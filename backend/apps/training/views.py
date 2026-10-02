import shutil
from pathlib import Path

from django.conf import settings
from django.db import IntegrityError, transaction
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.projects.models import Project

from .dataset import dataset_summary, split_counts
from .models import Architecture, TrainingJob
from .serializers import TrainingJobCreateSerializer, TrainingJobSerializer


class ProjectScopedView(APIView):
    """Views under /projects/<project_id>/training/. Other users' projects return 404."""

    def get_project(self):
        return get_object_or_404(Project, pk=self.kwargs["project_id"], owner=self.request.user)

    def get_job(self):
        return get_object_or_404(TrainingJob, pk=self.kwargs["job_id"], project=self.get_project())


class TrainingSummaryView(ProjectScopedView):
    """Annotated vs remaining images, classes, and the split a given ``?split=`` would give."""

    def get(self, request, project_id):
        project = self.get_project()
        try:
            split = min(max(int(request.query_params.get("split", 70)), 10), 95)
        except ValueError:
            raise serializers.ValidationError({"split": ["Expected a whole number."]})
        summary = dataset_summary(project)
        train, val = split_counts(summary["usable_images"], split)
        active = project.training_jobs.filter(status__in=TrainingJob.ACTIVE).first()
        return Response({
            **summary,
            "split": split,
            "train_images": train,
            "val_images": val,
            "architectures": [{"value": v, "label": l} for v, l in Architecture.choices],
            "default_epochs": settings.TRAINING["DEFAULT_EPOCHS"],
            "max_epochs": settings.TRAINING["MAX_EPOCHS"],
            "active_job": TrainingJobSerializer(active).data if active else None,
        })


class TrainingJobListView(ProjectScopedView):
    def get(self, request, project_id):
        jobs = self.get_project().training_jobs.all()
        return Response(TrainingJobSerializer(jobs, many=True).data)

    def post(self, request, project_id):
        project = self.get_project()
        payload = TrainingJobCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        if dataset_summary(project)["usable_images"] == 0:
            raise serializers.ValidationError(
                {"detail": "No annotated images to train on. Draw boxes or polygons on some images first."}
            )
        try:
            with transaction.atomic():
                job = TrainingJob.objects.create(project=project, created_by=request.user, **payload.validated_data)
        except IntegrityError:  # one_active_training_job_per_project
            return Response({"detail": "A training job is already running for this project."},
                            status=status.HTTP_409_CONFLICT)
        return Response(TrainingJobSerializer(job).data, status=status.HTTP_201_CREATED)


class TrainingJobDetailView(ProjectScopedView):
    def get(self, request, project_id, job_id):
        return Response(TrainingJobSerializer(self.get_job()).data)

    def delete(self, request, project_id, job_id):
        job = self.get_job()
        if job.is_active:
            return Response({"detail": "Cancel the job before deleting it."}, status=status.HTTP_409_CONFLICT)
        work_dir = job.work_dir
        job.delete()
        if work_dir:
            transaction.on_commit(lambda: shutil.rmtree(work_dir, ignore_errors=True))
        return Response(status=status.HTTP_204_NO_CONTENT)


class TrainingJobCancelView(ProjectScopedView):
    def post(self, request, project_id, job_id):
        job = self.get_job()
        # A queued job is cancelled at once; a running one stops at the worker's next progress check.
        cancelled_now = TrainingJob.objects.filter(pk=job.pk, status=TrainingJob.Status.QUEUED).update(
            status=TrainingJob.Status.CANCELLED, cancel_requested=True, finished_at=timezone.now(),
        )
        if not cancelled_now:
            if not TrainingJob.objects.filter(pk=job.pk, status=TrainingJob.Status.RUNNING) \
                    .update(cancel_requested=True):
                return Response({"detail": "This job has already finished."}, status=status.HTTP_409_CONFLICT)
        job.refresh_from_db()
        return Response(TrainingJobSerializer(job).data)


class TrainingJobCheckpointView(ProjectScopedView):
    """Download the trained weights (.pth)."""

    def get(self, request, project_id, job_id):
        job = self.get_job()
        path = Path(job.checkpoint) if job.checkpoint else None
        root = Path(settings.TRAINING["ROOT"]).resolve()
        # Only ever serve files from inside the training root.
        if not path or not path.is_file() or root not in path.resolve().parents:
            raise NotFound("No trained model is available for this job.")
        filename = f"{job.name}-{job.architecture}.pth".replace(" ", "_")
        return FileResponse(path.open("rb"), as_attachment=True, filename=filename)
