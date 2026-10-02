from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path

from config.views import spa_index

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/projects/", include("apps.projects.urls")),
]
# Uploaded media is served by Django only in development.
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
# Everything else goes to the React app (must stay last).
urlpatterns.append(re_path(r"^(?!api/|admin/|static/|media/).*$", spa_index, name="spa"))
