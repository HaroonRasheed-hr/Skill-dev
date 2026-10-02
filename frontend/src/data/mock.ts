export type Status = 'annotation' | 'validation' | 'completed';
export type Label = { name: string; color: string };

export const labels: Label[] = [
  { name: 'car', color: '#f59e0b' },
  { name: 'person', color: '#10b981' },
  { name: 'bicycle', color: '#6366f1' },
  { name: 'traffic light', color: '#ef4444' },
];

export type Project = { id: number; name: string; owner: string; updated: string; labels: Label[]; description?: string; color?: string; thumbnail?: string; media?: string[]; images?: number; annotated?: number; created?: string };

export const projects: Project[] = [
  { id: 1, name: 'Urban Street Detection', owner: 'haroon', updated: '2 hours ago', labels },
  { id: 2, name: 'Retail Shelf Products', owner: 'ayesha', updated: 'yesterday', labels: labels.slice(0, 2) },
  { id: 3, name: 'Medical X-Ray Segmentation', owner: 'haroon', updated: '3 days ago', labels: labels.slice(2) },
];

export type Task = {
  id: number; name: string; projectId: number; owner: string; assignee: string; status: Status;
  frames: number; jobsDone: number; jobs: number; mode: string; created: string; thumb: string;
};

export const tasks: Task[] = [
  { id: 101, name: 'Lahore downtown - batch 1', projectId: 1, owner: 'haroon', assignee: 'ali', status: 'annotation', frames: 450, jobsDone: 1, jobs: 3, mode: 'interpolation', created: 'Sep 28, 2026', thumb: 'https://picsum.photos/seed/st1/320/200' },
  { id: 102, name: 'Lahore downtown - batch 2', projectId: 1, owner: 'haroon', assignee: 'sara', status: 'validation', frames: 300, jobsDone: 2, jobs: 2, mode: 'annotation', created: 'Sep 25, 2026', thumb: 'https://picsum.photos/seed/st2/320/200' },
  { id: 103, name: 'Karachi highway', projectId: 1, owner: 'ayesha', assignee: 'ali', status: 'completed', frames: 600, jobsDone: 4, jobs: 4, mode: 'interpolation', created: 'Sep 20, 2026', thumb: 'https://picsum.photos/seed/st3/320/200' },
  { id: 201, name: 'Shelf images - store A', projectId: 2, owner: 'ayesha', assignee: 'bilal', status: 'annotation', frames: 120, jobsDone: 0, jobs: 2, mode: 'annotation', created: 'Sep 30, 2026', thumb: 'https://picsum.photos/seed/sh1/320/200' },
  { id: 301, name: 'Chest X-rays set A', projectId: 3, owner: 'haroon', assignee: '', status: 'annotation', frames: 80, jobsDone: 0, jobs: 1, mode: 'annotation', created: 'Sep 29, 2026', thumb: 'https://picsum.photos/seed/xr1/320/200' },
];

export const jobs = [
  { id: 1001, taskId: 101, frames: '0-149', stage: 'annotation', state: 'in progress', assignee: 'ali', updated: '1 hour ago' },
  { id: 1002, taskId: 101, frames: '150-299', stage: 'validation', state: 'completed', assignee: 'sara', updated: '5 hours ago' },
  { id: 1003, taskId: 101, frames: '300-449', stage: 'annotation', state: 'new', assignee: '', updated: '2 days ago' },
  { id: 1004, taskId: 102, frames: '0-149', stage: 'acceptance', state: 'completed', assignee: 'sara', updated: 'yesterday' },
  { id: 1005, taskId: 102, frames: '150-299', stage: 'acceptance', state: 'completed', assignee: 'sara', updated: 'yesterday' },
  { id: 1006, taskId: 201, frames: '0-59', stage: 'annotation', state: 'new', assignee: 'bilal', updated: '3 hours ago' },
  { id: 1007, taskId: 103, frames: '0-599', stage: 'acceptance', state: 'completed', assignee: 'ali', updated: 'Sep 22' },
  { id: 1008, taskId: 301, frames: '0-79', stage: 'annotation', state: 'new', assignee: '', updated: 'Sep 29' },
];

export const models = [
  { id: 'yolov8-skw', name: 'YOLOv8 Skillwala', type: 'detector', framework: 'PyTorch', version: 'v3', labels: ['car', 'person', 'bicycle'], status: 'deployed', map: 0.71, updated: 'Sep 27, 2026' },
  { id: 'sam-vit-h', name: 'Segment Anything', type: 'interactor', framework: 'PyTorch', version: 'v1', labels: ['any'], status: 'deployed', map: null, updated: 'Aug 14, 2026' },
  { id: 'rtdetr-retail', name: 'RT-DETR Retail', type: 'detector', framework: 'PyTorch', version: 'v1', labels: ['product', 'price tag'], status: 'trained', map: 0.64, updated: 'Sep 30, 2026' },
  { id: 'siammask', name: 'SiamMask Tracker', type: 'tracker', framework: 'PyTorch', version: 'v2', labels: ['any'], status: 'deployed', map: null, updated: 'Jul 02, 2026' },
];

export const trainingRuns = [
  { id: 'run-42', model: 'YOLOv8 Skillwala', dataset: 'Urban Street Detection', status: 'running', epoch: 37, epochs: 100, loss: 0.82, map: 0.58, started: 'Today 09:12' },
  { id: 'run-41', model: 'RT-DETR Retail', dataset: 'Retail Shelf Products', status: 'completed', epoch: 50, epochs: 50, loss: 0.41, map: 0.64, started: 'Sep 29' },
  { id: 'run-40', model: 'YOLOv8 Skillwala', dataset: 'Urban Street Detection', status: 'failed', epoch: 12, epochs: 100, loss: 1.9, map: 0.21, started: 'Sep 26' },
];

export const testRuns = [
  { id: 'eval-17', model: 'YOLOv8 Skillwala v3', dataset: 'Karachi highway', precision: 0.78, recall: 0.69, map: 0.71, f1: 0.73, date: 'Sep 30' },
  { id: 'eval-16', model: 'RT-DETR Retail v1', dataset: 'Shelf images - store A', precision: 0.7, recall: 0.61, map: 0.64, f1: 0.65, date: 'Sep 30' },
];
