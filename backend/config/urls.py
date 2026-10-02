from django.contrib import admin
from django.urls import include, path, re_path

from config.views import spa_index

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("apps.accounts.urls")),
    # Everything else goes to the React app (must stay last).
    re_path(r"^(?!api/|admin/|static/).*$", spa_index, name="spa"),
]
