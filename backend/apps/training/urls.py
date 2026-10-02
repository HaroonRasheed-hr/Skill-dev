from django.urls import path

from . import views

app_name = "training"

urlpatterns = [
    path("summary/", views.TrainingSummaryView.as_view(), name="summary"),
    path("jobs/", views.TrainingJobListView.as_view(), name="job-list"),
    path("jobs/<int:job_id>/", views.TrainingJobDetailView.as_view(), name="job-detail"),
    path("jobs/<int:job_id>/cancel/", views.TrainingJobCancelView.as_view(), name="job-cancel"),
    path("jobs/<int:job_id>/checkpoint/", views.TrainingJobCheckpointView.as_view(), name="job-checkpoint"),
]
