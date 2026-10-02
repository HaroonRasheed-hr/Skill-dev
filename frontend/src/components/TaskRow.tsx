import { Link } from 'react-router-dom';
import { Badge, Progress } from './ui';
import type { Task } from '../data/mock';

export default function TaskRow({ t }: { t: Task }) {
  return (
    <div className="card flex items-center gap-4 p-3">
      <img src={t.thumb} className="h-16 w-24 rounded object-cover" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">#{t.id} · Created by {t.owner} on {t.created}</p>
        <Link to={`/tasks/${t.id}`} className="font-semibold hover:text-brand-600">{t.name}</Link>
      </div>
      <div className="w-48">
        <div className="mb-1 flex items-center justify-between text-xs"><Badge>{t.status}</Badge><span className="text-muted">{t.jobsDone} of {t.jobs} jobs</span></div>
        <Progress value={t.jobsDone / t.jobs} />
      </div>
      <Link to={`/tasks/${t.id}`} className="btn-primary">Open</Link>
    </div>
  );
}
