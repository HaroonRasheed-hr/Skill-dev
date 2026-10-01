import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MoreVertical } from 'lucide-react';
import { PageHeader } from '../components/ui';
import { projects, tasks } from '../data/mock';

export default function Projects() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const list = projects.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Projects" search={q} onSearch={setQ} actions={<button className="btn-primary" onClick={() => navigate('/projects/create')}>Create project</button>} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => {
          const pt = tasks.filter((t) => t.projectId === p.id);
          const done = pt.filter((t) => t.status === 'completed').length;
          return (
            <Link key={p.id} to={`/projects/${p.id}/overview`} className="card overflow-hidden transition hover:border-brand-500">
              {p.thumbnail ? (
                <div className="h-36 bg-panel"><img src={p.thumbnail} className="h-full w-full object-cover" /></div>
              ) : (
                <div className="grid h-36 grid-cols-2 gap-0.5 bg-panel">
                  {pt.slice(0, 2).map((t) => <img key={t.id} src={t.thumb} className="h-full w-full object-cover" />)}
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold">{p.name}</h3>
                  <MoreVertical className="h-4 w-4 text-muted" />
                </div>
                <p className="mt-1 text-xs text-muted">#{p.id} · Created by {p.owner} · Updated {p.updated}</p>
                <p className="mt-3 text-sm text-muted">{pt.length} tasks · {done} completed</p>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
