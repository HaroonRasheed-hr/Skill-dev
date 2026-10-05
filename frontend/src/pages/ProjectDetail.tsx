import { Link } from 'react-router-dom';
import { Calendar, ChevronDown, ChevronRight, Clock, Eye, HelpCircle, Image, MoreVertical, Tag, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Empty } from '../components/ui';
import { tasks, type Project } from '../data/mock';
import { api, cacheProject, downloadFile, toProject, useProject, type ApiProject } from '../lib/api';

export { useProject };

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

// [label, backend value]: the formats the backend can export and import
const FORMATS = [['COCO 1.0', 'coco'], ['YOLO 1.1', 'yolo'], ['Pascal VOC 1.1', 'voc']];

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-cyan-400' : 'bg-slate-600'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function DatasetDialog({ mode, project, onClose, onImported }: {
  mode: 'export' | 'import'; project: Project; onClose: () => void; onImported: (p: Project) => void;
}) {
  const exp = mode === 'export';
  const [format, setFormat] = useState('');
  const [images, setImages] = useState(false);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [defaults, setDefaults] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = format && (exp || file);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (exp) {
        const q = new URLSearchParams({ dataset_format: format, images: images ? '1' : '0', name: name.trim() });
        await downloadFile(`/projects/${project.id}/export/?${q}`, `${project.name}_${format}.zip`);
      } else {
        const body = new FormData();
        body.append('dataset', file!);
        const p = toProject(await api<ApiProject>(`/projects/${project.id}/import/`, { method: 'POST', body }));
        cacheProject(p);
        onImported(p);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };
  const field = 'w-full rounded-lg border border-line bg-panel-3 px-3 py-2 text-sm outline-none focus:border-cyan-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl border border-line bg-[#0f1b3d] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="font-semibold">{exp ? 'Export project as a dataset' : 'Import dataset to project'}</h2>
          <button onClick={onClose} className="text-muted hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-6 px-6 py-6">
          <div>
            <label className="mb-2 block text-sm font-semibold"><span className="text-red-500">*</span> {exp ? 'Export' : 'Import'} format</label>
            <div className="relative">
              <select value={format} onChange={(e) => setFormat(e.target.value)} className={`${field} appearance-none pr-9 ${format ? '' : 'text-muted'}`}>
                <option value="" disabled>Select dataset format</option>
                {FORMATS.map(([label, value]) => <option key={value} value={value} className="text-white">{label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-muted" />
            </div>
          </div>
          {exp ? (
            <>
              <label className="flex items-center gap-3 text-sm font-semibold"><Toggle on={images} onChange={setImages} />Save images</label>
              <div>
                <label className="mb-2 block text-sm font-semibold">Custom name</label>
                <div className="flex items-center gap-1 rounded-lg border border-line bg-panel-3 p-1 pr-3">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Custom name for a dataset" className="flex-1 rounded-md bg-transparent px-2 py-1 text-sm outline-none" />
                  <span className="text-sm text-muted">.zip</span>
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="mb-2 block text-sm font-semibold"><span className="text-red-500">*</span> Dataset file</label>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-panel-3 px-4 py-6 text-sm text-muted hover:border-cyan-400">
                <Upload className="h-5 w-5" />
                {file ? <span className="text-white">{file.name}</span> : 'Click to select a .zip file'}
                <input type="file" accept=".zip" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          )}
          <label className="flex items-center gap-3 text-sm font-semibold">
            <Toggle on={defaults} onChange={setDefaults} />Use default settings
            <HelpCircle className="h-4 w-4 text-muted" />
          </label>
          {error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-panel-3">Cancel</button>
          <button onClick={submit} disabled={!valid || busy} className="rounded-lg bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-300 disabled:opacity-50">
            {busy ? (exp ? 'Exporting…' : 'Importing…') : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionsMenu({ onPick }: { onPick: (m: 'export' | 'import') => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const item = 'block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-panel-3';
  const pick = (m: 'export' | 'import') => { setOpen(false); onPick(m); };
  return (
    <div ref={ref} className="relative ml-auto">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-xl border border-line px-4 py-1.5 text-sm hover:bg-panel-3">
        Actions <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-36 rounded-xl border border-line bg-[#0f1b3d] p-1.5 shadow-2xl">
          <button className={item} onClick={() => pick('export')}>Export dataset</button>
          <button className={item} onClick={() => pick('import')}>Import dataset</button>
          <button className={item} onClick={() => setOpen(false)}>Backup Project</button>
          <div className="my-1 border-t border-line" />
          <button className={`${item} hover:text-red-400`} onClick={() => setOpen(false)}>Delete</button>
        </div>
      )}
    </div>
  );
}

export default function ProjectDetail() {
  const [dialog, setDialog] = useState<'export' | 'import' | null>(null);
  const [imported, setImported] = useState<Project | null>(null);
  const loaded = useProject();
  // After an import, show the updated counts and classes without refetching
  const p = loaded && imported?.id === loaded.id ? imported : loaded;
  if (!p) return <Empty text={p === undefined ? 'Loading…' : 'Project not found'} />;
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
        <ActionsMenu onPick={setDialog} />
      </div>
      {dialog && <DatasetDialog key={dialog} mode={dialog} project={p} onClose={() => setDialog(null)} onImported={setImported} />}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Images / Dataset Overview"
          action={<div className="flex gap-2"><button className="btn-ghost text-xs" onClick={() => setDialog('export')}>Export</button><button className="btn-ghost text-xs" onClick={() => setDialog('import')}>Import</button></div>}
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
