from django.conf import settings
from rest_framework import serializers

from .models import Architecture, TrainingJob


class TrainingJobSerializer(serializers.ModelSerializer):
    architecture_label = serializers.CharField(source="get_architecture_display", read_only=True)
    has_checkpoint = serializers.SerializerMethodField()

    class Meta:
        model = TrainingJob
        fields = (
            "id", "name", "architecture", "architecture_label", "train_split", "epochs", "batch_size",
            "use_pretrained", "status", "cancel_requested", "progress", "current_epoch",
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

    class Meta:
        model = TrainingJob
        fields = ("name", "architecture", "train_split", "epochs", "batch_size", "use_pretrained")

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
