from django.contrib import admin

from .models import TrainingJob


@admin.register(TrainingJob)
class TrainingJobAdmin(admin.ModelAdmin):
    list_display = ("name", "project", "architecture", "status", "progress", "created_at")
    list_filter = ("status", "architecture")
    search_fields = ("name", "project__name")
    raw_id_fields = ("project", "created_by")
