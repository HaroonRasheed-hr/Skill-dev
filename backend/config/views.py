from django.conf import settings
from django.http import FileResponse, HttpResponseNotFound
from django.views.decorators.http import require_safe


@require_safe
def spa_index(request, path=""):
    """Serve the React index.html so client-side routes work on refresh."""
    index = settings.FRONTEND_DIST / "index.html"
    if not index.is_file():
        return HttpResponseNotFound("Frontend build not found. Run `npm run build` in frontend/.")
    response = FileResponse(index.open("rb"), content_type="text/html")
    response["Cache-Control"] = "no-cache"
    return response
