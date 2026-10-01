import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MoreVertical, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { Empty } from '../components/ui';
import { jobs, tasks } from '../data/mock';
import { useProject } from './ProjectDetail';

const MAX_FRAMES = 6;

export default function ProjectLabels() {
  const p = useProject();
  const [list, setList] = useState(p?.labels ?? []);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#00c2f0');
  if (!p) return <Empty text="Project not found" />;
  const pt = tasks.filter((t) => t.projectId === p.id);

  function add() {
    const n = name.trim();
    if (!n || list.some((l) => l.name === n)) return;
    setList([...list, { name: n, color }]);
    setName('');
  }

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/15">
          <Tag className="h-4 w-4 text-brand-500" />
        </span>
        <h1 className="text-xl font-semibold">Label</h1>
        <button className="ml-auto flex items-center gap-3 rounded-lg border border-line px-4 py-1.5 text-sm hover:border-brand-500">
          Actions <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-6">
        {pt.length === 0 && <Empty text="No tasks in this project yet" />}
        {pt.map((t) => {
          const job = jobs.find((j) => j.taskId === t.id);
          const shown = Math.min(t.frames, MAX_FRAMES);
          return (
            <section key={t.id} className="card p-10">
              <div className="flex items-start justify-between gap-4 border-b border-line pb-8">
                <div>
                  <h2 className="text-xl font-semibold">{t.name}</h2>
                  <p className="mt-1">Created by {t.owner} on {t.created}</p>
                </div>
                <Link
                  to={job ? `/tasks/${t.id}/jobs/${job.id}` : `/tasks/${t.id}`}
                  className="flex items-center rounded-xl bg-brand-500 px-4 py-4 font-semibold text-slate-900 hover:bg-brand-500/90"
                >
                  Start Labeling
                  <span className="ml-4 border-l border-slate-900/20 pl-3"><ChevronRight className="h-4 w-4" /></span>
                </Link>
              </div>
              <div className="flex gap-6 pt-6">
                <span>Frame count: {t.frames}</span>
                <span>Frame range: 0-{t.frames - 1}</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-6">
                {Array.from({ length: shown }, (_, i) => (
                  <div key={i} className="relative h-36 w-36 overflow-hidden rounded-lg border border-line bg-panel-2">
                    <img
                      src={`https://picsum.photos/seed/t${t.id}f${i}/300/300`}
                      alt={`Frame ${i}`}
                      loading="lazy"
                      className="h-full w-full object-cover"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] text-white">#{i}</span>
                  </div>
                ))}
                {t.frames > shown && (
                  <Link to={`/tasks/${t.id}`} className="flex h-36 w-36 items-center justify-center rounded-lg border border-dashed border-line text-sm text-muted hover:text-brand-500">
                    +{t.frames - shown} more
                  </Link>
                )}
              </div>
            </section>
          );
        })}

        <section className="card p-10">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <h2 className="text-lg font-semibold">All Labels <span className="text-sm font-normal text-muted">({list.length})</span></h2>
          </div>
          <div className="my-5 flex flex-wrap gap-3">
            <input className="input flex-1" placeholder="Label name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border bg-panel-2" />
            <select className="input w-44"><option>Any shape</option><option>Rectangle</option><option>Polygon</option><option>Points</option><option>Skeleton</option></select>
            <button className="btn-primary whitespace-nowrap" onClick={add}><Plus className="h-4 w-4" />Add label</button>
          </div>
          {list.length === 0 ? (
            <p className="py-6 text-center text-muted">No labels yet</p>
          ) : (
            <div className="divide-y divide-line">
              {list.map((l) => (
                <div key={l.name} className="flex items-center gap-4 py-3">
                  <span className="h-5 w-5 rounded" style={{ background: l.color }} />
                  <span className="flex-1 font-medium">{l.name}</span>
                  <span className="text-sm text-muted">0 attributes</span>
                  <button className="text-muted hover:text-brand-500"><Pencil className="h-4 w-4" /></button>
                  <button className="text-muted hover:text-red-400" onClick={() => setList(list.filter((x) => x !== l))}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
