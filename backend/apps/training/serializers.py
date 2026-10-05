from django.conf import settings
from rest_framework import serializers

from .models import Architecture, TrainingJob


class TrainingJobSerializer(serializers.ModelSerializer):
    architecture_label = serializers.CharField(source="get_architecture_display", read_only=True)
    has_checkpoint = serializers.SerializerMethodField()
    base_job_name = serializers.CharField(source="base_job.name", read_only=True, default=None)

    class Meta:
        model = TrainingJob
        fields = (
            "id", "name", "architecture", "architecture_label", "train_split", "epochs", "batch_size",
            "use_pretrained", "base_job", "base_job_name", "status", "cancel_requested", "progress", "current_epoch",
            "train_images", "val_images", "class_names", "metrics", "history", "error",
            "has_checkpoint", "created_at", "started_at", "finished_at",
        )
        read_only_fields = tuple(f for f in fields if f not in (
            "name", "architecture", "train_split", "epochs", "batch_size", "use_pretrained",
        ))

    def get_has_checkpoint(self, job):
        return bool(job.checkpoint)


class TrainingJobCreateSerializer(serializers.ModelSerializer):
    name = serializers.CharField(max_length=120)
    architecture = serializers.ChoiceField(choices=Architecture.choices, default=Architecture.RTMDET_TINY)
    train_split = serializers.IntegerField(min_value=10, max_value=95, default=70)
    epochs = serializers.IntegerField(min_value=1, default=None)
    batch_size = serializers.IntegerField(min_value=1, max_value=16, default=2)
    use_pretrained = serializers.BooleanField(default=True)
    base_job = serializers.PrimaryKeyRelatedField(queryset=TrainingJob.objects.none(), required=False,
                                                  allow_null=True, default=None)

    class Meta:
        model = TrainingJob
        fields = ("name", "architecture", "train_split", "epochs", "batch_size", "use_pretrained", "base_job")

    def __init__(self, *args, project=None, **kwargs):
        super().__init__(*args, **kwargs)
        # Only this project's completed models can be retrained.
        if project is not None:
            self.fields["base_job"].queryset = project.training_jobs.filter(
                status=TrainingJob.Status.COMPLETED).exclude(checkpoint="")

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Model name is required.")
        return value

    def validate_epochs(self, value):
        if value is None:
            return settings.TRAINING["DEFAULT_EPOCHS"]
        limit = settings.TRAINING["MAX_EPOCHS"]
        if value > limit:
            raise serializers.ValidationError(f"Ensure this value is less than or equal to {limit}.")
        return value

    def validate(self, attrs):
        base = attrs.get("base_job")
        if base:
            # The trained weights only fit the architecture they were trained with.
            attrs["architecture"] = base.architecture
        return attrs
