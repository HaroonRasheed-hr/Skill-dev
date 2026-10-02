from pathlib import Path

from django.test import SimpleTestCase

from apps.training.mmdet_config import ARCHITECTURES, TrainSettings, apply_settings, set_num_classes
from apps.training.models import Architecture

TRAIN_PIPE = [{"type": "LoadImageFromFile"}, {"type": "RandomFlip"}, {"type": "PackDetInputs"}]
TEST_PIPE = [{"type": "LoadImageFromFile"}, {"type": "Resize"}, {"type": "PackDetInputs"}]


def rtmdet_like():
    """The parts of rtmdet_tiny's config that apply_settings touches."""
    return {
        "model": {"bbox_head": {"type": "RTMDetSepBNHead", "num_classes": 80}},
        "train_pipeline_stage2": TRAIN_PIPE,
        "train_dataloader": {"batch_size": 32, "num_workers": 10, "persistent_workers": True,
                             "dataset": {"type": "CocoDataset", "pipeline": [{"type": "CachedMosaic"}]}},
        "val_dataloader": {"dataset": {"type": "CocoDataset", "pipeline": TEST_PIPE}},
        "train_cfg": {"max_epochs": 300, "dynamic_intervals": [(280, 1)]},
        "custom_hooks": [{"type": "EMAHook"}, {"type": "PipelineSwitchHook", "switch_epoch": 280}],
        "default_hooks": {"visualization": {"type": "DetVisualizationHook"}},
        "auto_scale_lr": {"enable": False, "base_batch_size": 256},
    }


def ssd_like():
    """SSDLite wraps its training set in a RepeatDataset."""
    return {
        "model": {"bbox_head": {"num_classes": 80}},
        "train_dataloader": {"dataset": {"type": "RepeatDataset", "times": 5,
                                         "dataset": {"type": "CocoDataset", "pipeline": TRAIN_PIPE}}},
        "val_dataloader": {"dataset": {"type": "CocoDataset", "pipeline": TEST_PIPE}},
    }


def settings_for(tmp="/runs/job_1", val=True, **kw):
    base = dict(
        work_dir=Path(tmp), data_root=Path("/media"), train_ann=Path(tmp) / "data/train.json",
        val_ann=Path(tmp) / "data/val.json" if val else None, classes=["car", "person"],
        epochs=5, batch_size=2, seed=7, load_from="https://example.com/w.pth",
    )
    base.update(kw)
    return TrainSettings(**base)


class SetNumClassesTests(SimpleTestCase):
    def test_sets_nested_heads(self):
        model = {"rpn_head": {"x": 1}, "roi_head": {"bbox_head": {"num_classes": 80}},
                 "extra": [{"num_classes": 80}]}
        self.assertEqual(set_num_classes(model, 3), 2)
        self.assertEqual(model["roi_head"]["bbox_head"]["num_classes"], 3)
        self.assertEqual(model["extra"][0]["num_classes"], 3)


class ApplySettingsTests(SimpleTestCase):
    def test_rtmdet_is_adapted_for_cpu_and_our_dataset(self):
        cfg = apply_settings(rtmdet_like(), settings_for())

        self.assertEqual(cfg["model"]["bbox_head"]["num_classes"], 2)
        train = cfg["train_dataloader"]
        self.assertEqual((train["batch_size"], train["num_workers"], train["persistent_workers"]), (2, 0, False))
        self.assertEqual(train["dataset"]["pipeline"], TRAIN_PIPE)  # stage-2 pipeline, no Mosaic
        self.assertEqual(train["dataset"]["metainfo"]["classes"], ("car", "person"))
        self.assertEqual(train["dataset"]["ann_file"], str(Path("/runs/job_1/data/train.json")))
        self.assertEqual(train["dataset"]["data_prefix"]["img"], str(Path("/media")) + "/")
        self.assertEqual(cfg["train_cfg"], {"type": "EpochBasedTrainLoop", "max_epochs": 5, "val_interval": 1})
        self.assertEqual(cfg["val_dataloader"]["dataset"]["pipeline"], TEST_PIPE)
        self.assertEqual(cfg["val_evaluator"]["type"], "CocoMetric")
        self.assertEqual([h["type"] for h in cfg["custom_hooks"]], ["EMAHook"])
        self.assertNotIn("visualization", cfg["default_hooks"])
        self.assertEqual(cfg["default_hooks"]["checkpoint"]["save_best"], "coco/bbox_mAP")
        self.assertEqual(cfg["auto_scale_lr"], {"enable": True, "base_batch_size": 256})
        self.assertEqual(cfg["param_scheduler"][-1]["end"], 5)
        self.assertEqual(cfg["launcher"], "none")
        self.assertEqual(cfg["randomness"]["seed"], 7)
        self.assertEqual(cfg["load_from"], "https://example.com/w.pth")
        self.assertIsNone(cfg["test_dataloader"])

    def test_wrapped_dataset_pipeline_is_unwrapped(self):
        cfg = apply_settings(ssd_like(), settings_for())
        self.assertEqual(cfg["train_dataloader"]["dataset"]["type"], "CocoDataset")
        self.assertEqual(cfg["train_dataloader"]["dataset"]["pipeline"], TRAIN_PIPE)
        self.assertEqual(cfg["auto_scale_lr"]["base_batch_size"], 16)

    def test_without_validation_set(self):
        cfg = apply_settings(rtmdet_like(), settings_for(val=False, load_from=None))
        self.assertIsNone(cfg["val_dataloader"])
        self.assertIsNone(cfg["val_evaluator"])
        self.assertIsNone(cfg["val_cfg"])
        self.assertIsNone(cfg["default_hooks"]["checkpoint"]["save_best"])
        self.assertIsNone(cfg["load_from"])

    def test_model_without_num_classes_is_rejected(self):
        cfg = rtmdet_like()
        cfg["model"] = {"backbone": {}}
        with self.assertRaises(ValueError):
            apply_settings(cfg, settings_for())

    def test_every_architecture_has_a_config_and_weights(self):
        for arch in Architecture:
            spec = ARCHITECTURES[arch]
            self.assertTrue(spec.config.endswith(".py"))
            self.assertTrue(spec.weights.startswith("https://download.openmmlab.com/"))
