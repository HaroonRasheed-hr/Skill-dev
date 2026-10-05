"""Adapts MMDetection's bundled configs to a project's dataset and to CPU-only training.

Everything here works on plain dicts (an mmengine ``Config`` behaves like one), so it is
unit-tested without torch or mmdet installed.
"""
from dataclasses import dataclass
from pathlib import Path

from .models import Architecture


@dataclass(frozen=True)
class ArchSpec:
    config: str  # path relative to mmdet's bundled ``.mim/configs``
    weights: str  # COCO-pretrained checkpoint; the class head is re-initialised


ARCHITECTURES = {
    Architecture.RTMDET_TINY: ArchSpec(
        "rtmdet/rtmdet_tiny_8xb32-300e_coco.py",
        "https://download.openmmlab.com/mmdetection/v3.0/rtmdet/rtmdet_tiny_8xb32-300e_coco/"
        "rtmdet_tiny_8xb32-300e_coco_20220902_112414-78e30dcc.pth",
    ),
    Architecture.SSDLITE: ArchSpec(
        "ssd/ssdlite_mobilenetv2-scratch_8xb24-600e_coco.py",
        "https://download.openmmlab.com/mmdetection/v2.0/ssd/ssdlite_mobilenetv2_scratch_600e_coco/"
        "ssdlite_mobilenetv2_scratch_600e_coco_20210629_110627-974d9307.pth",
    ),
    Architecture.FASTER_RCNN: ArchSpec(
        "faster_rcnn/faster-rcnn_r50_fpn_1x_coco.py",
        "https://download.openmmlab.com/mmdetection/v2.0/faster_rcnn/faster_rcnn_r50_fpn_1x_coco/"
        "faster_rcnn_r50_fpn_1x_coco_20200130-047c8118.pth",
    ),
}

# Dataset wrappers whose real dataset sits under ``dataset``.
WRAPPERS = {"RepeatDataset", "ClassBalancedDataset", "MultiImageMixDataset"}
# Hooks that assume the original long schedules (e.g. RTMDet switches pipelines at epoch 280).
DROP_HOOKS = {"PipelineSwitchHook"}


@dataclass
class TrainSettings:
    work_dir: Path
    data_root: Path  # images' storage root; COCO file_names are relative to it
    train_ann: Path
    val_ann: Path | None
    classes: list[str]
    epochs: int
    batch_size: int
    seed: int
    load_from: str | None


def set_num_classes(node, n: int) -> int:
    """Set every ``num_classes`` under ``node`` (heads can be nested); returns how many were set."""
    count = 0
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "num_classes":
                node[key] = n
                count += 1
            else:
                count += set_num_classes(value, n)
    elif isinstance(node, (list, tuple)):
        for item in node:
            count += set_num_classes(item, n)
    return count


def innermost_dataset(dataset: dict) -> dict:
    while dataset.get("type") in WRAPPERS and "dataset" in dataset:
        dataset = dataset["dataset"]
    return dataset


def coco_dataset(pipeline, data_root: Path, ann_file: Path, classes: list[str], test_mode: bool) -> dict:
    return {
        "type": "CocoDataset",
        "data_root": "",
        "ann_file": str(ann_file),
        "data_prefix": {"img": str(data_root) + "/"},
        "metainfo": {"classes": tuple(classes)},
        # Keep images without boxes out of training, but evaluate on every val image.
        "filter_cfg": None if test_mode else {"filter_empty_gt": True, "min_size": 1},
        "test_mode": test_mode,
        "pipeline": pipeline,
    }


def dataloader(dataset: dict, batch_size: int, shuffle: bool) -> dict:
    # Workers stay in-process: spawning data workers on Windows/CPU costs more than it saves.
    return {
        "batch_size": batch_size,
        "num_workers": 0,
        "persistent_workers": False,
        "drop_last": False,
        "sampler": {"type": "DefaultSampler", "shuffle": shuffle},
        "dataset": dataset,
    }


def train_pipeline(cfg) -> list:
    """Prefer RTMDet's light "stage 2" pipeline: Mosaic/MixUp are too costly for small CPU runs."""
    if cfg.get("train_pipeline_stage2"):
        return cfg["train_pipeline_stage2"]
    return innermost_dataset(cfg["train_dataloader"]["dataset"])["pipeline"]


def apply_settings(cfg, s: TrainSettings):
    """Rewrite ``cfg`` in place for this run and return it."""
    if not set_num_classes(cfg["model"], len(s.classes)):
        raise ValueError("Model config has no num_classes to set.")

    cfg["train_dataloader"] = dataloader(
        coco_dataset(train_pipeline(cfg), s.data_root, s.train_ann, s.classes, test_mode=False),
        s.batch_size, shuffle=True,
    )
    cfg["train_cfg"] = {"type": "EpochBasedTrainLoop", "max_epochs": s.epochs, "val_interval": 1}

    if s.val_ann:
        test_pipeline = innermost_dataset(cfg["val_dataloader"]["dataset"])["pipeline"]
        cfg["val_dataloader"] = dataloader(
            coco_dataset(test_pipeline, s.data_root, s.val_ann, s.classes, test_mode=True), 1, shuffle=False,
        )
        cfg["val_evaluator"] = {"type": "CocoMetric", "ann_file": str(s.val_ann), "metric": "bbox",
                                "format_only": False}
        cfg["val_cfg"] = {"type": "ValLoop"}
    else:
        cfg["val_dataloader"] = cfg["val_evaluator"] = cfg["val_cfg"] = None
    cfg["test_dataloader"] = cfg["test_evaluator"] = cfg["test_cfg"] = None

    # Short schedule: brief warm-up, then cosine decay across the requested epochs.
    cfg["param_scheduler"] = [
        # Warm up over the first epoch: a fixed 200 iterations outlasts small runs entirely.
        {"type": "LinearLR", "start_factor": 0.001, "by_epoch": True, "begin": 0, "end": 1,
         "convert_to_iter_based": True},
        {"type": "CosineAnnealingLR", "by_epoch": True, "begin": 0, "end": s.epochs, "T_max": s.epochs,
         "eta_min": 0.0, "convert_to_iter_based": True},
    ]
    # The bundled learning rates assume 8 GPUs; scale them to our single CPU batch.
    auto = dict(cfg.get("auto_scale_lr") or {})
    auto["enable"] = True
    # Cap the base at 16: RTMDet's 256 would shrink the LR ~100x and the model barely learns.
    auto["base_batch_size"] = min(auto.get("base_batch_size") or 16, 16)
    cfg["auto_scale_lr"] = auto

    cfg["custom_hooks"] = [h for h in cfg.get("custom_hooks") or [] if h.get("type") not in DROP_HOOKS]
    hooks = cfg.setdefault("default_hooks", {})
    hooks["checkpoint"] = {
        "type": "CheckpointHook", "interval": 1, "max_keep_ckpts": 1,
        "save_best": "coco/bbox_mAP" if s.val_ann else None, "rule": "greater",
    }
    hooks["logger"] = {"type": "LoggerHook", "interval": 10}
    hooks.pop("visualization", None)

    cfg["env_cfg"] = {"cudnn_benchmark": False, "mp_cfg": {"mp_start_method": "spawn"},
                      "dist_cfg": {"backend": "gloo"}}
    cfg["launcher"] = "none"
    cfg["randomness"] = {"seed": s.seed, "deterministic": False}
    cfg["work_dir"] = str(s.work_dir)
    cfg["load_from"] = s.load_from
    cfg["resume"] = False
    return cfg
