# Skill-Dev

A web platform for building object-detection models from start to finish: upload images or videos, annotate them, train a detector, and test the trained model. All of it happens in the browser.

---

## 1. Purpose

Training a custom object detector usually takes several separate tools: one to label data, scripts to convert between dataset formats, a training framework, and more scripts to try out the result. Skillwala puts these steps into one CVAT-style application, so someone without deep ML tooling experience can go from raw images to a working model.

The platform is designed to run on ordinary hardware. Training is **CPU-only**, so no GPU is needed.

## 2. What the project does

| Step | What the user does | What the system does |
| --- | --- | --- |
| **1. Create a project** | Gives it a name, color, and labels (classes) | Stores the project and assigns label colors automatically |
| **2. Bring in data** | Uploads images, videos, or a ZIP dataset in **YOLO, COCO, Pascal VOC, or CreateML** format | Validates the archive (size, file count, zip-bomb protection), detects the format, imports images and existing annotations, and merges class names into the project's labels |
| **3. Videos** | Uploads `.mp4`, `.mov`, `.webm`, `.avi`, `.mkv`, etc. | Extracts frames with OpenCV (5 fps by default, max 3000 frames per video). Each frame is annotated like an image |
| **4. Annotate** | Draws shapes on images in the annotation workspace | Saves rectangles, polygons, polylines, points, and ellipses in pixel coordinates |
| **5. Train** | Picks an architecture, train/val split, epochs, batch size, and whether to use pretrained weights | Queues a training job. A background worker exports the data to COCO format, trains with MMDetection on the CPU, and reports progress, loss, and mAP after each epoch |
| **6. Manage models** | Views finished runs and downloads checkpoints | Serves the `.pth` checkpoint file for each completed job |
| **7. Test** | Uploads an image or video to a trained model | Runs inference and returns bounding boxes, class names, and confidence scores, which are drawn on the media |

## 3. Main function

The core of the project is the **annotate → train → test loop for object detection**:

1. **Dataset import** (`backend/apps/projects/datasets/`): parses YOLO / COCO / VOC / CreateML archives into one internal format of images, labels, and annotations.
2. **Training pipeline** (`backend/apps/training/`):
   - `dataset.py` exports a project's annotations to COCO with a seeded train/val split.
   - `mmdet_config.py` adapts MMDetection's built-in configs to the project's classes and to CPU training.
   - `runner.py` runs the job, streams progress to the database, supports cancellation, and saves the best checkpoint.
   - `training_worker` (management command) polls the queue and runs one job at a time. Only one active job per project is allowed.
3. **Inference** (`TrainingJobInferView`): loads the trained checkpoint (cached in memory), runs detection on an uploaded image, filters by confidence, and removes duplicate overlapping boxes across classes using IoU.

### Supported model architectures

| Architecture | Notes |
| --- | --- |
| RTMDet-tiny | Default. Fastest on CPU |
| SSDLite MobileNetV2 | Fast, lightweight |
| Faster R-CNN R50-FPN | Most accurate, slow on CPU |

All three start from COCO-pretrained weights, with the classification head re-initialized for the project's labels.

## 4. Tech stack

### Backend (`backend/`)
| Area | Technology |
| --- | --- |
| Language | Python |
| Web framework | Django 5.1 |
| REST API | Django REST Framework |
| Auth | JWT via `djangorestframework-simplejwt` (token rotation and blacklist), email-or-username login |
| Database | SQLite (default) or PostgreSQL 17 (via Docker Compose) |
| Config | `django-environ` (`.env` / `.env.local`) |
| Static files | WhiteNoise (also serves the built React app) |
| Images and video | Pillow, OpenCV |
| Dataset parsing | PyYAML, defusedxml |
| ML / training | PyTorch 2.1 (CPU), MMDetection 3.3, MMEngine, MMCV 2.1, pycocotools |

### Frontend (`frontend/`)
| Area | Technology |
| --- | --- |
| Language | TypeScript |
| UI library | React 19 |
| Routing | React Router 7 |
| Build tool | Vite 8 |
| Styling | Tailwind CSS 4 |
| Icons | lucide-react |
| ZIP handling | JSZip (reading datasets in the browser) |

## 5. Architecture

```
┌──────────────────────┐   /api/v1/*    ┌──────────────────────────┐
│  React + Vite (SPA)  │ ─────────────▶ │  Django + DRF (REST API) │
│  frontend/           │ ◀───────────── │  backend/                │
└──────────────────────┘   JSON + JWT   └────────────┬─────────────┘
                                                     │
                                ┌────────────────────┼─────────────────────┐
                                ▼                    ▼                     ▼
                       ┌────────────────┐  ┌──────────────────┐  ┌──────────────────┐
                       │ SQLite /       │  │ media/           │  │ training_worker  │
                       │ PostgreSQL     │  │ (images, frames) │  │ (MMDetection,    │
                       │                │  │                  │  │  CPU)            │
                       └────────────────┘  └──────────────────┘  └────────┬─────────┘
                                                                          ▼
                                                                 training_runs/
                                                                 (configs, checkpoints)
```

- In development, Vite proxies `/api` and `/media` to Django on port 8000.
- In production, Django serves the built React app (`frontend/dist`) through WhiteNoise, with an SPA catch-all route.
- The training worker is a **separate process**, so the web server never needs PyTorch or MMDetection installed.

## 6. Project structure

```
skill-dev/
├── backend/
│   ├── config/                 # Django settings (base / local / production), URLs, WSGI/ASGI
│   ├── apps/
│   │   ├── accounts/           # Custom User model, register/login/refresh/logout/me
│   │   ├── projects/           # Projects, labels, images, annotations, video frames
│   │   │   ├── datasets/       # ZIP safety checks + YOLO/COCO/VOC/CreateML parsers
│   │   │   ├── services.py     # Project creation and media import
│   │   │   └── videos.py       # Frame extraction with OpenCV
│   │   └── training/           # Training jobs, MMDetection config, runner, worker, inference
│   ├── requirements.txt        # Web app dependencies
│   ├── requirements-training.txt  # PyTorch + MMDetection (worker only)
│   └── docker-compose.yml      # PostgreSQL
└── frontend/
    └── src/
        ├── pages/              # Projects, Annotation, Training, Models, Testing, ...
        ├── components/         # Layout, AuthShell, shared UI
        └── lib/api.ts          # API client with JWT auto-refresh
```

## 7. Data model

| Model | Key fields |
| --- | --- |
| `User` | Unique email, username, first/last name |
| `Project` | Owner, name, description, color, dataset name/format, thumbnail |
| `Label` | Project, name (unique per project, case-insensitive), color |
| `Image` | Project, file, width/height, plus video name, frame index, and timestamp if extracted from a video |
| `Annotation` | Image, label, kind (rect/polygon/polyline/points/ellipse), points, source (imported/manual) |
| `TrainingJob` | Architecture, split, epochs, batch size, status, progress, metrics, per-epoch history, checkpoint path |

## 8. API overview

All endpoints are under `/api/v1/` and require a JWT `Bearer` token, except register and login.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/auth/register/` | Create an account |
| POST | `/auth/login/` | Get access and refresh tokens |
| POST | `/auth/token/refresh/` | Refresh the access token |
| POST | `/auth/logout/` | Blacklist the refresh token |
| GET | `/auth/me/` | Current user |
| GET/POST | `/projects/` | List / create projects (with dataset or media upload) |
| GET/PATCH/DELETE | `/projects/{id}/` | Project details / update / delete |
| GET | `/projects/{id}/images/` | Paginated images |
| GET/PUT | `/projects/{id}/images/{image_id}/annotations/` | Read / replace an image's annotations |
| GET | `/projects/{id}/training/summary/` | Dataset readiness for training |
| GET/POST | `/projects/{id}/training/jobs/` | List / start training jobs |
| GET/DELETE | `/projects/{id}/training/jobs/{job_id}/` | Job details / delete |
| POST | `/projects/{id}/training/jobs/{job_id}/cancel/` | Cancel a running job |
| GET | `/projects/{id}/training/jobs/{job_id}/checkpoint/` | Download the trained model |
| POST | `/projects/{id}/training/jobs/{job_id}/infer/` | Run detection on an uploaded image |

## 9. Run the full application with Docker

Install Docker Desktop, then run this from the repository root:

```bash
docker compose up --build
```

Open **http://localhost:3000** to use the application. Compose starts PostgreSQL, the Django API, the CPU-based training worker, and the React frontend. The first build downloads the training dependencies and can take several minutes. Training runs on the CPU and may be slow for large datasets.

Uploaded media, the database, and model checkpoints are kept in Docker volumes when containers stop. To stop the application, run `docker compose down`.

This Compose setup is for local development: its default password and secret key are not production credentials, and Nginx serves HTTP only. Do not expose it directly to the public internet. A production deployment needs production Django settings, strong secrets, and an HTTPS reverse proxy. `APP_PORT` changes the frontend port, and `TRAINING_CPU_THREADS` controls the worker's CPU thread count.

## 10. Run locally for development

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows  (source .venv/bin/activate on Linux/macOS)
pip install -r requirements.txt
copy .env.example .env            # then set DJANGO_SECRET_KEY, DJANGO_DEBUG=True for local dev
python manage.py migrate
python manage.py runserver        # http://localhost:8000
```

Optional PostgreSQL: run `docker compose up -d`, then set `DATABASE_URL` in `.env`.

### Training worker (separate terminal)
```bash
pip install -r requirements-training.txt
mim install "mmcv==2.1.0"
python manage.py training_worker
```

### Frontend
```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173
npm run build                     # production build in frontend/dist
```

### Tests
```bash
cd backend
python manage.py test
```

## 11. Configuration

Key environment variables (see `backend/.env.example`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | SQLite | PostgreSQL connection string |
| `CORS_ALLOWED_ORIGINS` | — | Frontend origin(s) allowed to call the API |
| `JWT_ACCESS_MINUTES` / `JWT_REFRESH_DAYS` | 15 / 7 | Token lifetimes |
| `AUTH_THROTTLE_RATE` | `10/min` | Rate limit on auth endpoints |
| `DATASET_MAX_ARCHIVE_MB` | 500 | Max uploaded ZIP size |
| `DATASET_MAX_UNCOMPRESSED_MB` | 2048 | Max unzipped size |
| `DATASET_MAX_FILES` | 20000 | Max files per archive |
| `TRAINING_DEFAULT_EPOCHS` / `TRAINING_MAX_EPOCHS` | 12 / 100 | Epoch limits |
| `TRAINING_CPU_THREADS` | 0 (all cores) | CPU threads for training |

## 12. Current status

- **Connected to the backend:** login/register, projects, dataset/media import, project annotation, training, models, and testing.
- **Not yet connected to the backend:** the Tasks and Jobs screens (mock data in `frontend/src/data/mock.ts`) and the Teams and Notifications screens. Some API-backed pages also still use mock data for parts of the UI.
- Training is CPU-only. GPU support would need a CUDA build of PyTorch and MMCV.
