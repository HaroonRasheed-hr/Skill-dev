from pathlib import Path

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.training.models import TrainingJob

from .helpers import TempStorageMixin, add_image, make_project, make_user, project_with_images

S = TrainingJob.Status


class TrainingApiTestCase(TempStorageMixin, APITestCase):
    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(self.user)
        self.project = project_with_images(self.user, annotated=10, plain=5)

    def url(self, name, project=None, **kw):
        return reverse(f"training:{name}", kwargs={"project_id": (project or self.project).id, **kw})

    def start(self, project=None, **payload):
        payload.setdefault("name", "detector-v1")
        return self.client.post(self.url("job-list", project), payload, format="json")

    def make_job(self, **kw):
        kw.setdefault("name", "old")
        return TrainingJob.objects.create(project=self.project, created_by=self.user, train_split=70,
                                          epochs=1, batch_size=1, **kw)


class SummaryTests(TrainingApiTestCase):
    def test_summary(self):
        res = self.client.get(self.url("summary"), {"split": 80})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        d = res.data
        self.assertEqual((d["total_images"], d["annotated_images"], d["remaining_images"]), (15, 10, 5))
        self.assertEqual(d["annotated_percent"], 66.7)
        self.assertEqual((d["split"], d["train_images"], d["val_images"]), (80, 8, 2))
        self.assertEqual([c["name"] for c in d["classes"]], ["car", "person"])
        self.assertEqual(d["architectures"][0]["value"], "rtmdet_tiny")
        self.assertIsNone(d["active_job"])

    def test_split_is_clamped_and_validated(self):
        self.assertEqual(self.client.get(self.url("summary"), {"split": 200}).data["split"], 95)
        self.assertEqual(self.client.get(self.url("summary"), {"split": "x"}).status_code, 400)

    def test_shows_active_job(self):
        job = self.make_job(status=S.RUNNING)
        self.assertEqual(self.client.get(self.url("summary")).data["active_job"]["id"], job.id)


class CreateJobTests(TrainingApiTestCase):
    def test_start_training_with_defaults(self):
        res = self.start(name="  detector-v1 ")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["name"], "detector-v1")
        self.assertEqual(res.data["status"], "queued")
        self.assertEqual(res.data["architecture"], "rtmdet_tiny")
        self.assertEqual((res.data["train_split"], res.data["epochs"], res.data["batch_size"]), (70, 12, 2))
        self.assertTrue(res.data["use_pretrained"])
        job = TrainingJob.objects.get()
        self.assertEqual((job.project, job.created_by), (self.project, self.user))

    def test_custom_settings(self):
        res = self.start(architecture="faster_rcnn_r50", train_split=90, epochs=3, batch_size=4,
                         use_pretrained=False)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["architecture_label"], "Faster R-CNN R50-FPN (accurate, slow on CPU)")
        self.assertFalse(res.data["use_pretrained"])

    def test_invalid_settings(self):
        for payload, field in [({"name": " "}, "name"), ({"architecture": "yolo-gpu"}, "architecture"),
                               ({"train_split": 5}, "train_split"), ({"train_split": 99}, "train_split"),
                               ({"epochs": 0}, "epochs"), ({"epochs": 101}, "epochs"),
                               ({"batch_size": 64}, "batch_size")]:
            with self.subTest(payload=payload):
                res = self.start(**payload)
                self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, res.data)
        self.assertFalse(TrainingJob.objects.exists())

    def test_read_only_fields_are_ignored(self):
        res = self.start(status="completed", progress=100, checkpoint="/etc/passwd")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        job = TrainingJob.objects.get()
        self.assertEqual((job.status, job.progress, job.checkpoint), (S.QUEUED, 0, ""))

    def test_needs_annotated_images(self):
        project = make_project(self.user)
        add_image(project)
        res = self.start(project)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("No annotated images", str(res.data))

    def test_one_active_job_per_project(self):
        self.assertEqual(self.start().status_code, status.HTTP_201_CREATED)
        res = self.start(name="second")
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        TrainingJob.objects.update(status=S.COMPLETED)
        self.assertEqual(self.start(name="third").status_code, status.HTTP_201_CREATED)

    def test_list_newest_first(self):
        old = self.make_job(status=S.COMPLETED)
        new = self.start().data
        self.assertEqual([j["id"] for j in self.client.get(self.url("job-list")).data], [new["id"], old.id])


class JobActionTests(TrainingApiTestCase):
    def test_detail(self):
        job = self.make_job()
        res = self.client.get(self.url("job-detail", job_id=job.id))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["id"], job.id)
        self.assertFalse(res.data["has_checkpoint"])

    def test_cancel_queued_job_is_immediate(self):
        job = self.make_job()
        res = self.client.post(self.url("job-cancel", job_id=job.id))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "cancelled")

    def test_cancel_running_job_asks_worker_to_stop(self):
        job = self.make_job(status=S.RUNNING)
        res = self.client.post(self.url("job-cancel", job_id=job.id))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual((res.data["status"], res.data["cancel_requested"]), ("running", True))

    def test_cancel_finished_job_conflicts(self):
        job = self.make_job(status=S.COMPLETED)
        self.assertEqual(self.client.post(self.url("job-cancel", job_id=job.id)).status_code, 409)

    def test_delete_finished_job_removes_files(self):
        work_dir = Path(self._tmp) / "runs" / "del"
        work_dir.mkdir(parents=True)
        job = self.make_job(status=S.FAILED, work_dir=str(work_dir))
        with self.captureOnCommitCallbacks(execute=True):
            res = self.client.delete(self.url("job-detail", job_id=job.id))
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(TrainingJob.objects.exists())
        self.assertFalse(work_dir.exists())

    def test_cannot_delete_active_job(self):
        job = self.make_job(status=S.RUNNING)
        self.assertEqual(self.client.delete(self.url("job-detail", job_id=job.id)).status_code, 409)

    def test_download_checkpoint(self):
        ckpt = Path(self._tmp) / "runs" / "dl" / "best.pth"
        ckpt.parent.mkdir(parents=True)
        ckpt.write_bytes(b"weights")
        job = self.make_job(status=S.COMPLETED, checkpoint=str(ckpt))
        res = self.client.get(self.url("job-checkpoint", job_id=job.id))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(b"".join(res.streaming_content), b"weights")
        self.assertIn('filename="old-rtmdet_tiny.pth"', res["Content-Disposition"])
        res.close()

    def test_checkpoint_outside_training_root_is_not_served(self):
        outside = Path(self._tmp) / "secret.pth"
        outside.write_bytes(b"x")
        job = self.make_job(status=S.COMPLETED, checkpoint=str(outside))
        self.assertEqual(self.client.get(self.url("job-checkpoint", job_id=job.id)).status_code, 404)

    def test_missing_checkpoint_404(self):
        job = self.make_job(status=S.COMPLETED)
        self.assertEqual(self.client.get(self.url("job-checkpoint", job_id=job.id)).status_code, 404)


class PermissionTests(TrainingApiTestCase):
    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.url("summary")).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.start().status_code, status.HTTP_401_UNAUTHORIZED)

    def test_other_users_projects_and_jobs_are_hidden(self):
        job = self.make_job()
        self.client.force_authenticate(make_user("mallory"))
        for res in [
            self.client.get(self.url("summary")),
            self.client.get(self.url("job-list")),
            self.start(),
            self.client.get(self.url("job-detail", job_id=job.id)),
            self.client.post(self.url("job-cancel", job_id=job.id)),
            self.client.delete(self.url("job-detail", job_id=job.id)),
            self.client.get(self.url("job-checkpoint", job_id=job.id)),
        ]:
            self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        job.refresh_from_db()
        self.assertEqual(job.status, S.QUEUED)

    def test_job_of_another_project_is_not_reachable_through_mine(self):
        other = project_with_images(self.user)
        job = self.make_job()
        self.assertEqual(self.client.get(self.url("job-detail", other, job_id=job.id)).status_code, 404)
