from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q


class Architecture(models.TextChoices):
    """Detectors offered for training, lightest (fastest on CPU) first."""

    RTMDET_TINY = "rtmdet_tiny", "RTMDet-tiny (fast)"
    SSDLITE = "ssdlite_mobilenetv2", "SSDLite MobileNetV2 (fast)"
    FASTER_RCNN = "faster_rcnn_r50", "Faster R-CNN R50-FPN (accurate, slow on CPU)"


class TrainingJob(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued"
        RUNNING = "running"
        COMPLETED = "completed"
        FAILED = "failed"
        CANCELLED = "cancelled"

    ACTIVE = (Status.QUEUED, Status.RUNNING)

    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="training_jobs")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    name = models.CharField(max_length=120)
    architecture = models.CharField(max_length=32, choices=Architecture.choices, default=Architecture.RTMDET_TINY)
    # Percentage of the usable annotated images used for training; the rest validate.
    train_split = models.PositiveSmallIntegerField(validators=[MinValueValidator(10), MaxValueValidator(95)])
    epochs = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(300)])
    batch_size = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(16)])
    use_pretrained = models.BooleanField(default=True)
    # A completed job of the same project whose trained weights this run starts from (retraining).
    base_job = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    seed = models.PositiveIntegerField(default=42)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.QUEUED)
    cancel_requested = models.BooleanField(default=False)
    progress = models.FloatField(default=0)  # 0-100
    current_epoch = models.PositiveSmallIntegerField(default=0)
    # Filled when the dataset is exported at the start of the run.
    train_images = models.PositiveIntegerField(default=0)
    val_images = models.PositiveIntegerField(default=0)
    class_names = models.JSONField(default=list, blank=True)
    # Latest validation metrics, e.g. {"bbox_mAP": 0.41, ...}, and one entry per epoch.
    metrics = models.JSONField(default=dict, blank=True)
    history = models.JSONField(default=list, blank=True)
    error = models.TextField(blank=True)
    work_dir = models.CharField(max_length=500, blank=True)
    checkpoint = models.CharField(max_length=500, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            # A CPU can only usefully train one model per project at a time.
            models.UniqueConstraint(
                fields=["project"],
                condition=Q(status__in=["queued", "running"]),
                name="one_active_training_job_per_project",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.status})"

    @property
    def is_active(self):
        return self.status in self.ACTIVE
