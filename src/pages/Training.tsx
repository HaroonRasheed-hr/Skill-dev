import { useState } from 'react';
import { ChevronRight, Zap } from 'lucide-react';
import { Empty } from '../components/ui';
import { jobs, tasks } from '../data/mock';
import { useProject } from './ProjectDetail';

const TRAIN_SPLIT = 0.8;

// "0-149" -> 150
const rangeSize = (r: string) => {
  const [a, b] = r.split('-').map(Number);
  return b - a + 1;
};

function BatchCard({ title, pct, caption }: { title: string; pct: number; caption: string }) {
  return (
    <div className="rounded-2xl bg-panel-2 px-10 pb-8 pt-6">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <h3 className="text-base font-semibold">{title}</h3>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-blue-700 text-sm font-semibold text-slate-900 ring-4 ring-brand-500/20 shadow-[0_0_14px] shadow-brand-500/50">%</span>
      </div>
      <div className="flex flex-col items-center gap-2 pt-10">
        <p className="text-5xl font-bold">{pct}%</p>
        <span className="rounded-lg bg-brand-500/15 px-6 py-2 text-sm font-semibold">{caption}</span>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line px-9 py-8">
      <span className="text-lg font-semibold">{label}</span>
      <span className="flex items-center gap-3 rounded-lg bg-panel-3 px-4 py-2 text-base font-semibold">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {value}
      </span>
    </div>
  );
}

export default function Training() {
  const p = useProject();
  const [expanded, setExpanded] = useState(false);
  if (!p) return <Empty text="Project not found" />;

  const pt = tasks.filter((t) => t.projectId === p.id);
  const total = pt.reduce((s, t) => s + t.frames, 0);
  const annotated = jobs
    .filter((j) => j.state === 'completed' && pt.some((t) => t.id === j.taskId))
    .reduce((s, j) => s + rangeSize(j.frames), 0);
  const annotatedPct = total ? Math.round((annotated / total) * 100) : 0;
  const trainCount = Math.round(annotated * TRAIN_SPLIT);
  const valCount = annotated - trainCount;
  const pctOf = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const classes = p.labels?.length ?? 0;

  // Donut ring
  const r = 52;
  const circ = 2 * Math.PI * r;

  return (
    <>
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-blue-600 shadow-[0_0_12px] shadow-brand-500/50">
          <Zap className="h-5 w-5 text-white" />
        </span>
        <h1 className="text-xl font-semibold">Train</h1>
        <button
          disabled={annotated === 0}
          className="ml-auto flex items-center rounded-xl bg-brand-500 px-4 py-4 font-semibold text-slate-900 hover:bg-brand-500/90 disabled:cursor-not-allowed"
        >
          Start Training
          <span className="ml-4 border-l border-slate-900/20 pl-4"><ChevronRight className="h-4 w-4" /></span>
        </button>
      </div>

      <section className="card rounded-2xl p-10">
        <div className="flex items-center justify-between border-b border-line pb-6">
          <h2 className="text-2xl font-semibold">Train Your Model</h2>
          <button className="text-brand-500 underline hover:text-brand-500/80">Advance settings</button>
        </div>
        <p className="mt-6 max-w-3xl leading-relaxed text-muted">
          Training your model will take some time. We will notify you when training is complete. You can continue
          working on other projects while training is in progress.
        </p>
        <h3 className="mt-8 border-b border-line pb-4 text-lg font-semibold">Dataset Info</h3>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl bg-panel-2 px-6 pb-10 pt-6">
            <h4 className="border-b border-line pb-4 text-base font-semibold">Annotated Images</h4>
            <div className="mt-10 flex items-center gap-12 pl-6">
              <div className="relative h-56 w-56 shrink-0">
                <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
                  <circle cx="64" cy="64" r={r} fill="none" stroke="currentColor" strokeWidth="18" className="text-page" />
                  <circle
                    cx="64" cy="64" r={r} fill="none" strokeWidth="18" strokeLinecap="round" opacity={annotatedPct ? 1 : 0}
                    className="stroke-brand-500"
                    strokeDasharray={circ}
                    strokeDashoffset={circ * (1 - annotatedPct / 100)}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-sm text-muted">Annotated Images</span>
                  <span className="text-3xl font-bold">{annotatedPct}%</span>
                </div>
              </div>
              <div className="flex-1 space-y-3 text-center text-base font-semibold">
                <div className="rounded-lg bg-panel-3 py-2.5">Annotated Images: {annotated}</div>
                <div className="rounded-lg bg-brand-500/15 py-2.5">Remaining Images: {total - annotated}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-panel-2 px-6 pb-10 pt-6">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <h4 className="text-base font-semibold">Dataset Summary</h4>
              <div className="flex h-8 items-end gap-1">
                {[40, 70, 50, 100, 60, 90, 45, 75].map((h, i) => (
                  <span key={i} className="w-1 rounded-full bg-gradient-to-t from-blue-600 to-brand-500" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
            <div className="mt-5 space-y-4">
              <SummaryRow label="Total Images" value={total} dot="bg-brand-500" />
              <SummaryRow label="No of Classes" value={classes} dot="bg-green-500" />
            </div>
          </div>
        </div>

        {expanded && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <BatchCard title="Train Batch" pct={pctOf(trainCount)} caption={`${trainCount} Images for Training`} />
            <BatchCard title="VAL Batch" pct={pctOf(valCount)} caption={`${valCount} Images for Validation`} />
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded-full bg-brand-500 px-7 py-2 text-sm text-slate-900 hover:bg-brand-500/90"
          >
            {expanded ? 'View Less' : 'More Details'}
          </button>
        </div>
      </section>
    </>
  );
}
