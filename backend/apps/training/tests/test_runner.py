import io
import json
import os
import time
from pathlib import Path
from unittest import mock

from django.core.management import call_command
from django.test import TestCase

from apps.training import runner
from apps.training.models import TrainingJob

from .helpers import TempStorageMixin, make_user, project_with_images

S = TrainingJob.Status


def make_job(project, **kw):
    kw.setdefault("name", "detector-v1")
    return TrainingJob.objects.create(project=project, created_by=project.owner, train_split=75,
                                      epochs=2, batch_size=2, **kw)


def fake_trainer(job, cfg, reporter):
    """Stands in for MMDetection: reports two epochs and writes a checkpoint."""
    for epoch in (1, 2):
        for it in range(2):
            reporter.on_iter((epoch - 1) * 2 + it, 4, loss=1.0 / epoch)
        reporter.on_epoch_end(epoch)
        reporter.on_val({"coco/bbox_mAP": 0.25 * epoch, "coco/bbox_mAP_50": 0.5, "note": "skip"})
    ckpt = cfg.work_dir / "best_coco_bbox_mAP_epoch_2.pth"
    ckpt.write_bytes(b"weights")
    return ckpt


class RunJobTests(TempStorageMixin, TestCase):
    def setUp(self):
        self.project = project_with_images(make_user(), annotated=4, plain=1)
        self.job = make_job(self.project, status=S.RUNNING)

    def test_successful_run(self):
        seen = {}

        def trainer(job, cfg, reporter):
            seen["cfg"] = cfg
            return fake_trainer(job, cfg, reporter)

        runner.run_job(self.job, trainer=trainer)
        self.job.refresh_from_db()

        self.assertEqual(self.job.status, S.COMPLETED)
        self.assertEqual(self.job.progress, 100.0)
        self.assertEqual((self.job.train_images, self.job.val_images), (3, 1))
        self.assertEqual(self.job.class_names, ["car", "person"])
        self.assertEqual(self.job.current_epoch, 2)
        self.assertEqual(self.job.metrics, {"bbox_mAP": 0.5, "bbox_mAP_50": 0.5})
        self.assertEqual(self.job.history, [
            {"epoch": 1, "loss": 1.0, "bbox_mAP": 0.25, "bbox_mAP_50": 0.5},
            {"epoch": 2, "loss": 0.5, "bbox_mAP": 0.5, "bbox_mAP_50": 0.5},
        ])
        self.assertTrue(Path(self.job.checkpoint).is_file())
        self.assertIsNotNone(self.job.finished_at)

        cfg = seen["cfg"]
        self.assertEqual((cfg.epochs, cfg.batch_size, cfg.classes), (2, 2, ["car", "person"]))
        self.assertIn("rtmdet_tiny", cfg.load_from)
        self.assertEqual(len(json.loads(cfg.train_ann.read_text())["images"]), 3)

    def test_without_pretrained_weights(self):
        self.job.use_pretrained = False
        captured = {}
        runner.run_job(self.job, trainer=lambda j, cfg, r: captured.setdefault("c", cfg) and fake_trainer(j, cfg, r))
        self.assertIsNone(captured["c"].load_from)

    def test_trainer_error_marks_job_failed(self):
        def boom(job, cfg, reporter):
            raise RuntimeError("out of memory")

        with self.assertLogs("apps.training.runner", "ERROR"):
            runner.run_job(self.job, trainer=boom)
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, S.FAILED)
        self.assertEqual(self.job.error, "RuntimeError: out of memory")
        self.assertIn("out of memory", (Path(self.job.work_dir) / "error.log").read_text())

    def test_missing_checkpoint_fails(self):
        with self.assertLogs("apps.training.runner", "ERROR"):
            runner.run_job(self.job, trainer=lambda *a: None)
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, S.FAILED)
        self.assertIn("without saving a checkpoint", self.job.error)

    def test_project_without_usable_annotations_fails(self):
        self.project.images.all().delete()
        with self.assertLogs("apps.training.runner", "ERROR"):
            runner.run_job(self.job, trainer=fake_trainer)
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, S.FAILED)
        self.assertIn("No annotated images", self.job.error)

    def test_cancel_request_stops_training(self):
        TrainingJob.objects.filter(pk=self.job.pk).update(cancel_requested=True)
        runner.run_job(self.job, trainer=fake_trainer)
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, S.CANCELLED)
        self.assertEqual(self.job.checkpoint, "")

    def test_rerun_clears_old_work_dir(self):
        stale = runner.work_dir_for(self.job) / "stale.txt"
        stale.parent.mkdir(parents=True, exist_ok=True)
        stale.write_text("old")
        runner.run_job(self.job, trainer=fake_trainer)
        self.assertFalse(stale.exists())


class ProgressReporterTests(TempStorageMixin, TestCase):
    def setUp(self):
        self.job = make_job(project_with_images(make_user()), status=S.RUNNING)

    def test_progress_is_throttled_but_always_reports_last_iter(self):
        rep = runner.ProgressReporter(self.job, every_seconds=3600)
        rep.on_iter(0, 10, 1.0)  # first call always writes
        self.assertEqual(TrainingJob.objects.get(pk=self.job.pk).progress, 10.0)
        rep.on_iter(4, 10, 1.0)  # throttled
        self.assertEqual(TrainingJob.objects.get(pk=self.job.pk).progress, 10.0)
        rep.on_iter(9, 10, 1.0)  # last iteration; capped below 100 until the job completes
        self.assertEqual(TrainingJob.objects.get(pk=self.job.pk).progress, 99.0)

    def test_epoch_without_losses(self):
        rep = runner.ProgressReporter(self.job, every_seconds=0)
        rep.on_epoch_end(1)
        rep.on_val(None)
        self.assertEqual(TrainingJob.objects.get(pk=self.job.pk).history, [{"epoch": 1, "loss": None}])


class QueueTests(TempStorageMixin, TestCase):
    def setUp(self):
        self.user = make_user()

    def test_claims_oldest_queued_job(self):
        first = make_job(project_with_images(self.user))
        make_job(project_with_images(self.user))
        job = runner.claim_next_job()
        self.assertEqual(job.pk, first.pk)
        self.assertEqual(job.status, S.RUNNING)
        self.assertIsNotNone(job.started_at)
        self.assertEqual(TrainingJob.objects.filter(status=S.QUEUED).count(), 1)

    def test_nothing_to_claim(self):
        self.assertIsNone(runner.claim_next_job())

    def test_job_cancelled_while_queued_is_skipped(self):
        make_job(project_with_images(self.user), cancel_requested=True)
        nxt = make_job(project_with_images(self.user))
        self.assertEqual(runner.claim_next_job().pk, nxt.pk)
        self.assertEqual(TrainingJob.objects.filter(status=S.CANCELLED).count(), 1)

    def test_interrupted_jobs_are_failed(self):
        job = make_job(project_with_images(self.user), status=S.RUNNING)
        done = make_job(project_with_images(self.user), status=S.COMPLETED)
        self.assertEqual(runner.fail_interrupted_jobs(), 1)
        job.refresh_from_db()
        done.refresh_from_db()
        self.assertEqual(job.status, S.FAILED)
        self.assertIn("Interrupted", job.error)
        self.assertEqual(done.status, S.COMPLETED)

    def test_find_checkpoint_prefers_best(self):
        d = Path(self._tmp) / "ckpt"
        d.mkdir()
        self.assertIsNone(runner.find_checkpoint(d))
        (d / "epoch_3.pth").write_bytes(b"")
        self.assertEqual(runner.find_checkpoint(d).name, "epoch_3.pth")
        best = d / "best_coco_bbox_mAP_epoch_2.pth"
        best.write_bytes(b"")
        os.utime(best, (time.time() - 100, time.time() - 100))
        self.assertEqual(runner.find_checkpoint(d), best)


class WorkerCommandTests(TempStorageMixin, TestCase):
    def test_once_trains_one_job(self):
        job = make_job(project_with_images(make_user()))
        with mock.patch("apps.training.management.commands.training_worker.run_job") as run:
            out = io.StringIO()
            call_command("training_worker", "--once", stdout=out)
        run.assert_called_once()
        self.assertEqual(run.call_args.args[0].pk, job.pk)
        self.assertIn(f"Training job {job.pk}", out.getvalue())

    def test_once_with_empty_queue_and_stale_job(self):
        make_job(project_with_images(make_user()), status=S.RUNNING)
        out = io.StringIO()
        call_command("training_worker", "--once", stdout=out)
        self.assertIn("Marked 1 interrupted job(s) as failed.", out.getvalue())
