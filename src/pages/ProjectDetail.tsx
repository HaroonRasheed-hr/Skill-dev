import { Link, useParams } from 'react-router-dom';
import { Calendar, ChevronRight, Clock, Eye, Image, MoreVertical, Tag } from 'lucide-react';
import type { ReactNode } from 'react';
import { Empty } from '../components/ui';
import { projects, tasks } from '../data/mock';

export function useProject() {
  const { id } = useParams();
  return projects.find((x) => x.id === Number(id));
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card flex min-h-80 flex-col p-5">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      <div className="flex flex-1 flex-col pt-5">{children}</div>
    </section>
  );
}

function Donut({ value }: { value: number }) {
  const r = 52, c = 2 * Math.PI * r, done = Math.round(value * 100);
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#94a3b8" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${c * value - 14} ${c}`} />
        <circle cx="70" cy="70" r={r} fill="none" stroke="#22d3ee" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${Math.max(c * (1 - value) - 14, 0)} ${c}`} strokeDashoffset={-c * value} />
      </svg>
      <span className="absolute -right-2 top-1 rounded-full bg-white px-1.5 text-[10px] font-semibold text-slate-900">{100 - done}%</span>
      <span className="absolute bottom-1 left-2 rounded-full bg-white px-1.5 text-[10px] font-semibold text-slate-900">{done}%</span>
    </div>
  );
}

function BarChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  const max = Math.max(5, ...data.map((d) => d.value));
  const ticks = Array.from({ length: 6 }, (_, i) => Math.round((max / 5) * (5 - i)));
  return (
    <div className="flex flex-1 gap-3 text-xs text-muted">
      <div className="flex flex-col justify-between pb-6">{ticks.map((t) => <span key={t}>{t}</span>)}</div>
      <div className="relative flex flex-1 flex-col">
        <div className="absolute inset-0 bottom-6 flex flex-col justify-between">{ticks.map((t) => <div key={t} className="border-t border-line/60" />)}</div>
        <div className="relative flex flex-1 items-end justify-around">
          {data.map((d) => (
            <div key={d.name} className="w-5 rounded-full bg-gradient-to-b from-sky-400 to-blue-600" style={{ height: `${(d.value / max) * 100}%` }} title={`${d.name}: ${d.value}`} />
          ))}
        </div>
        <div className="flex h-6 items-end justify-around">{data.map((d) => <span key={d.name}>{d.name}</span>)}</div>
      </div>
    </div>
  );
}

export default function ProjectDetail() {
  const p = useProject();
  if (!p) return <Empty text="Project not found" />;
  const pt = tasks.filter((t) => t.projectId === p.id);
  const total = p.images ?? pt.reduce((n, t) => n + t.frames, 0);
  const annotated = p.annotated ?? pt.reduce((n, t) => n + Math.round((t.frames * t.jobsDone) / t.jobs), 0);
  const skipped = 0;
  const classData = p.labels.map((l, i) => ({ ...l, value: Math.max(1, Math.round((annotated / (i + 2)) / Math.max(total / 5, 1))) }));
  const stats: [string, number, string][] = [
    ['Total Images', total, 'bg-cyan-400'],
    ['Skipped Images', skipped, 'bg-slate-400'],
    ['Annotated Images', annotated, 'bg-slate-400'],
  ];

  return (
    <div className="card p-6">
      <div className="mb-6 flex items-center gap-3">
        <Eye className="h-4 w-4 text-muted" />
        <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
        <h1 className="text-lg font-semibold">Overview</h1>
        <button className="btn-ghost ml-auto text-sm">Actions <MoreVertical className="h-4 w-4" /></button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Images / Dataset Overview"
          action={<div className="flex gap-2"><button className="btn-ghost text-xs">Export</button><button className="btn-ghost text-xs">Import</button></div>}
        >
          <div className="flex flex-wrap items-center gap-10 pb-6">
            <Donut value={total ? annotated / total : 0} />
            <div className="space-y-3">
              {stats.map(([k, v, dot]) => (
                <div key={k} className="flex w-36 items-center gap-3 rounded-lg bg-panel-3 px-3 py-2 text-xs">
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                  <span className="flex-1 text-center">{k}</span>
                  <span className="font-semibold">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <Link to={`/projects/${p.id}/annotation`} className="mt-auto flex items-center rounded-lg bg-blue-600/70 px-4 py-2.5 text-sm font-semibold hover:bg-blue-600">
            <span className="flex-1 text-center">Continue Annotation</span>
            <ChevronRight className="h-4 w-4 border-l border-white/20 pl-1" />
          </Link>
        </Card>

        <Card title="Class Per Image">
          <BarChart data={classData} />
        </Card>

        <Card title="Project Overview">
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-4 text-muted">
              <span className="flex items-center gap-2"><Calendar className="h-4 w-4" />Creation Date <span className="rounded bg-panel-3 px-2 text-xs text-white">{p.created ? new Date(p.created).toLocaleDateString('en-CA') : pt[pt.length - 1]?.created ?? '—'}</span></span>
              <span className="flex items-center gap-2"><Clock className="h-4 w-4" />Updated <span className="rounded bg-panel-3 px-2 text-xs text-white">{p.updated}</span></span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-panel-3 px-3 py-2"><Image className="h-4 w-4" /><b>Total Images:</b> {total}</div>
            <div className="flex items-center gap-2 rounded-lg bg-panel-3 px-3 py-2"><Tag className="h-4 w-4" /><b>Classes:</b> {p.labels.length}</div>
          </div>
        </Card>

        <Card title="Classes Overview">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {p.labels.map((l) => (
              <div key={l.name} className="flex flex-col items-center justify-center gap-2 rounded-lg border-l-4 bg-panel-3 py-6 text-sm font-medium capitalize" style={{ borderLeftColor: l.color }}>
                <Tag className="h-5 w-5" />{l.name}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
