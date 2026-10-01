# Skillwala UI

A CVAT-style UI for data annotation, model training and testing, built with React + TypeScript + Tailwind (Vite). It currently runs on mock data in `src/data/mock.ts`.

```bash
npm install
npm run dev     # http://localhost:5173
npm run build
```

## Screens

| Route | Page |
| --- | --- |
| `/auth/login`, `/auth/register` | Sign in / create account |
| `/projects`, `/projects/:id` | Project cards, project details with labels and tasks |
| `/tasks`, `/tasks/create`, `/tasks/:id` | Task list, create task (file upload and advanced options), task details with jobs |
| `/jobs` | All jobs, filterable by stage |
| `/tasks/:taskId/jobs/:jobId` | Annotation workspace (frame player, tools, draw boxes, objects and labels sidebar, undo/redo) |
| `/models` | Model registry (add, deploy, run on task) |
| `/training` | Start training runs, run history, loss curve, logs |
| `/testing` | Evaluate models: metrics, per-class AP, sample predictions |
