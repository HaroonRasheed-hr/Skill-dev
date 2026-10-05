from django.contrib import admin

from .models import Annotation, Image, Label, Project


class LabelInline(admin.TabularInline):
    model = Label
    extra = 0


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "dataset_format", "updated_at")
    list_filter = ("dataset_format",)
    search_fields = ("name", "owner__username")
    raw_id_fields = ("owner", "thumbnail")
    inlines = [LabelInline]


@admin.register(Image)
class ImageAdmin(admin.ModelAdmin):
    list_display = ("original_name", "project", "width", "height")
    raw_id_fields = ("project",)


@admin.register(Annotation)
class AnnotationAdmin(admin.ModelAdmin):
    list_display = ("id", "image", "label", "kind", "source")
    list_filter = ("kind", "source")
    raw_id_fields = ("image", "label")
