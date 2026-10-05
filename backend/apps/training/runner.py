"""Runs a TrainingJob with MMDetection on the CPU.

torch/mmdet are imported lazily so the web app (and the test suite) never needs them;
only the training worker process does. Install them with ``requirements-training.txt``.
"""
import logging
import os
import shutil
import time
import traceback
from pathlib import Path

from django.conf import settings
from django.utils import timezone

from .dataset import export_coco
from .mmdet_config import ARCHITECTURES, TrainSettings, apply_settings
from .models import TrainingJob

log = logging.getLogger(__name__)


class JobCancelled(Exception):
    pass


def work_dir_for(job: TrainingJob) -> Path:
    return Path(settings.TRAINING["ROOT"]) / f"project_{job.project_id}" / f"job_{job.id}"


def force_cpu():
    """Hide any GPU before torch is imported, and size the CPU thread pool."""
    os.environ["CUDA_VISIBLE_DEVICES"] = ""
    import torch

    threads = settings.TRAINING["CPU_THREADS"] or os.cpu_count() or 1
    torch.set_num_threads(threads)
    return torch


def update(job: TrainingJob, **fields):
    for key, value in fields.items():
        setattr(job, key, value)
    TrainingJob.objects.filter(pk=job.pk).update(**fields)


def cancel_requested(job: TrainingJob) -> bool:
    return TrainingJob.objects.filter(pk=job.pk, cancel_requested=True).exists()


class ProgressReporter:
    """Framework-independent progress logic; ``make_hook`` wraps it as an mmengine Hook."""

    def __init__(self, job: TrainingJob, every_seconds: float):
        self.job = job
        self.every = every_seconds
        self.last = 0.0
        self.epoch_losses: list[float] = []

    def on_iter(self, iteration: int, max_iters: int, loss: float | None):
        if loss is not None:
            self.epoch_losses.append(loss)
        now = time.monotonic()
        if now - self.last < self.every and iteration + 1 < max_iters:
            return
        self.last = now
        if cancel_requested(self.job):
            raise JobCancelled()
        # Leave the last percent for the final validation and checkpoint.
        update(self.job, progress=round(min(99.0, (iteration + 1) * 100 / max(max_iters, 1)), 1))

    def on_epoch_end(self, epoch: int):
        mean = sum(self.epoch_losses) / len(self.epoch_losses) if self.epoch_losses else None
        self.epoch_losses = []
        history = [*self.job.history, {"epoch": epoch, "loss": round(mean, 5) if mean is not None else None}]
        update(self.job, current_epoch=epoch, history=history)

    def on_val(self, metrics: dict):
        clean = {k.split("/", 1)[-1]: round(float(v), 5) for k, v in (metrics or {}).items()
                 if isinstance(v, (int, float))}
        history = list(self.job.history)
        if history:
            history[-1] = {**history[-1], **clean}
        update(self.job, metrics=clean, history=history)


def make_hook(reporter: ProgressReporter):
    from mmengine.hooks import Hook

    class DBProgressHook(Hook):
        priority = "VERY_LOW"

        def after_train_iter(self, runner, batch_idx, data_batch=None, outputs=None):
            loss = outputs.get("loss") if isinstance(outputs, dict) else None
            reporter.on_iter(runner.iter, runner.max_iters, float(loss) if loss is not None else None)

        def after_train_epoch(self, runner):
            reporter.on_epoch_end(runner.epoch + 1)  # still 0-based inside this hook

        def after_val_epoch(self, runner, metrics=None):
            reporter.on_val(metrics)

    return DBProgressHook()


def load_base_config(spec):
    from mmengine.config import Config
    import mmdet

    path = Path(mmdet.__file__).parent / ".mim" / "configs" / spec.config
    if not path.is_file():
        raise FileNotFoundError(f"MMDetection config not found: {path}")
    return Config.fromfile(str(path))


def train_with_mmdet(job: TrainingJob, cfg_settings: TrainSettings, reporter: ProgressReporter) -> Path | None:
    """Build the config, train, and return the best (or last) checkpoint path."""
    force_cpu()
    from mmengine.runner import Runner
    from mmdet.utils import register_all_modules

    register_all_modules(init_default_scope=True)
    cfg = apply_settings(load_base_config(ARCHITECTURES[job.architecture]), cfg_settings)
    cfg.dump(str(cfg_settings.work_dir / "config.py"))

    runner = Runner.from_cfg(cfg)
    runner.register_hook(make_hook(reporter))
    runner.train()
    return find_checkpoint(cfg_settings.work_dir)


def find_checkpoint(work_dir: Path) -> Path | None:
    best = sorted(work_dir.glob("best_*.pth"), key=lambda p: p.stat().st_mtime)
    if best:
        return best[-1]
    last = sorted(work_dir.glob("epoch_*.pth"), key=lambda p: p.stat().st_mtime)
    return last[-1] if last else None


def run_job(job: TrainingJob, trainer=train_with_mmdet) -> TrainingJob:
    """Run a job the worker has already claimed (status RUNNING). Never raises."""
    work_dir = work_dir_for(job)
    try:
        if work_dir.exists():
            shutil.rmtree(work_dir)
        data = export_coco(job.project, work_dir / "data", job.train_split, job.seed)
        update(job, work_dir=str(work_dir), train_images=data.train_images,
               val_images=data.val_images, class_names=data.classes)

        if job.base_job_id:
            # Retraining: start from the earlier model's own weights instead of the COCO ones.
            base = job.base_job
            if base is None or not base.checkpoint or not Path(base.checkpoint).is_file():
                raise FileNotFoundError("The model selected for retraining no longer has its trained weights.")
            load_from = base.checkpoint
        else:
            load_from = ARCHITECTURES[job.architecture].weights if job.use_pretrained else None

        cfg_settings = TrainSettings(
            work_dir=work_dir,
            data_root=Path(settings.MEDIA_ROOT),
            train_ann=data.train_ann,
            val_ann=data.val_ann,
            classes=data.classes,
            epochs=job.epochs,
            batch_size=job.batch_size,
            seed=job.seed,
            load_from=load_from,
        )
        reporter = ProgressReporter(job, settings.TRAINING["PROGRESS_SECONDS"])
        checkpoint = trainer(job, cfg_settings, reporter)
        if checkpoint is None:
            raise RuntimeError("Training finished without saving a checkpoint.")
        update(job, status=TrainingJob.Status.COMPLETED, progress=100.0,
               checkpoint=str(checkpoint), finished_at=timezone.now())
    except JobCancelled:
        log.info("Training job %s cancelled", job.pk)
        update(job, status=TrainingJob.Status.CANCELLED, finished_at=timezone.now())
    except Exception as exc:  # report every failure on the job instead of crashing the worker
        log.exception("Training job %s failed", job.pk)
        update(job, status=TrainingJob.Status.FAILED, finished_at=timezone.now(),
               error=f"{type(exc).__name__}: {exc}"[:2000])
        (work_dir / "error.log").parent.mkdir(parents=True, exist_ok=True)
        (work_dir / "error.log").write_text(traceback.format_exc(), encoding="utf-8")
    return job


def claim_next_job() -> TrainingJob | None:
    """Atomically move the oldest queued job to RUNNING. Safe with several workers."""
    for job_id in TrainingJob.objects.filter(status=TrainingJob.Status.QUEUED).order_by("created_at", "id") \
            .values_list("id", flat=True)[:5]:
        claimed = TrainingJob.objects.filter(pk=job_id, status=TrainingJob.Status.QUEUED).update(
            status=TrainingJob.Status.RUNNING, started_at=timezone.now(),
        )
        if claimed:
            job = TrainingJob.objects.select_related("project").get(pk=job_id)
            if job.cancel_requested:  # cancelled while queued but before the API saw it
                update(job, status=TrainingJob.Status.CANCELLED, finished_at=timezone.now())
                continue
            return job
    return None


def fail_interrupted_jobs() -> int:
    """Jobs left RUNNING by a worker that died can never finish; mark them failed."""
    return TrainingJob.objects.filter(status=TrainingJob.Status.RUNNING).update(
        status=TrainingJob.Status.FAILED, finished_at=timezone.now(),
        error="Interrupted: the training worker stopped before the job finished.",
    )
