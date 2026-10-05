import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MoreVertical, CheckCircle2, Check, Archive, Trash2, X, AlertCircle, Folder, ListChecks, ArchiveRestore, Filter, ArrowDownAZ, ArrowUpAZ, Plus, ArrowRight } from 'lucide-react';
import { useHeaderSearch } from '../components/Layout';
import { tasks, type Project } from '../data/mock';
import { api, cacheProject, fetchProjects, uncacheProject } from '../lib/api';
import { usePersistentState } from '../lib/persist';

export default function Projects() {
  const navigate = useNavigate();
  const q = useHeaderSearch();
  const [all, setAll] = useState<Project[]>([]);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    fetchProjects()
      .then((list) => { list.forEach(cacheProject); setAll(list); })
      .catch((e: Error) => setLoadError(e.message));
  }, []);
  const [archived, setArchived] = usePersistentState<Set<Project['id']>>('projects:archived', () => new Set());
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<Project['id']>>(new Set());
  const [showArchived, setShowArchived] = usePersistentState('projects:showArchived', false);
  const [toDelete, setToDelete] = useState<Project[] | null>(null);

  const [sortAsc, setSortAsc] = usePersistentState('projects:sortAsc', true);

  const list = all
    .filter((p) => archived.has(p.id) === showArchived && p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (sortAsc ? 1 : -1) * a.name.localeCompare(b.name));
  const allSelected = list.length > 0 && list.every((p) => selected.has(p.id));

  const toggle = (id: Project['id']) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(list.map((p) => p.id)));
  const exitSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const archive = (ids: Project['id'][]) => {
    setArchived((a) => new Set([...a, ...ids]));
    setSelected(new Set());
  };
  const unarchive = (ids: Project['id'][]) => {
    setArchived((a) => new Set([...a].filter((id) => !ids.includes(id))));
    setSelected(new Set());
  };
  const confirmDelete = async () => {
    const ids = new Set<Project['id']>();
    for (const p of toDelete!) {
      try {
        await api(`/projects/${p.id}/`, { method: 'DELETE' });
        ids.add(p.id);
        uncacheProject(p.id);
      } catch (e) {
        setLoadError(`Could not delete "${p.name}": ${(e as Error).message}`);
      }
    }
    setAll((a) => a.filter((p) => !ids.has(p.id)));
    setSelected(new Set());
    setToDelete(null);
  };

  return (
    <>
      <div className="mb-6 rounded-xl border border-white/5 bg-[#0b1020] px-8 pb-5 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="flex items-center gap-3 text-xl font-bold text-white">
            <Folder className="h-6 w-6 text-cyan-400" /> {showArchived ? 'Archived projects' : 'Projects'}
          </h1>
          <div className="flex flex-wrap items-center gap-4">
            {selecting && (
              <button className="flex h-11 items-center gap-2 rounded-xl bg-[#111a2e] px-5 text-sm font-semibold text-slate-400 transition hover:text-white" onClick={toggleAll}>
                <ListChecks className="h-4 w-4" /> {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            )}
            <button
              className={`flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${selecting ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300' : 'border-white/15 bg-white/[0.03] text-slate-400 hover:text-white'}`}
              onClick={() => (selecting ? exitSelection() : setSelecting(true))}
            >
              <CheckCircle2 className="h-4 w-4" /> Select
              <span className={`ml-1 h-2 w-2 rounded-full ${selecting ? 'bg-cyan-400' : 'bg-slate-500'}`} />
            </button>
            <button
              className={`flex h-11 items-center gap-3 rounded-xl px-6 text-sm font-semibold transition ${showArchived ? 'bg-cyan-400/10 text-cyan-300' : 'bg-[#111a2e] text-slate-400 hover:text-white'}`}
              onClick={() => {
                setShowArchived((v) => !v);
                setSelected(new Set());
              }}
              title={showArchived ? 'Show active projects' : `Show archived (${archived.size})`}
            >
              <Filter className="h-5 w-5" /> Filters
            </button>
            <button
              className="flex h-11 items-center gap-3 rounded-xl bg-[#111a2e] px-5 text-sm font-semibold text-slate-400 transition hover:text-white"
              onClick={() => setSortAsc((v) => !v)}
            >
              {sortAsc ? <ArrowDownAZ className="h-5 w-5" /> : <ArrowUpAZ className="h-5 w-5" />} Sort by
            </button>
            <button
              className="flex h-11 items-center rounded-xl bg-cyan-400 pl-4 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300"
              onClick={() => navigate('/projects/create')}
            >
              <span className="mr-2.5 grid h-6 w-6 place-items-center rounded-full bg-slate-900/70 text-cyan-300">
                <Plus className="h-4 w-4" />
              </span>
              Create new project
              <span className="ml-4 flex h-6 items-center border-l border-slate-900/30 px-4">
                <ArrowRight className="h-5 w-5" />
              </span>
            </button>
          </div>
        </div>
        <div className="mt-5 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      </div>
      {loadError && <p className="mb-4 text-sm text-red-400">{loadError}</p>}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => {
          const pt = tasks.filter((t) => t.projectId === p.id);
          const done = pt.filter((t) => t.status === 'completed').length;
          const isSel = selected.has(p.id);
          return (
            <Link
              key={p.id}
              to={`/projects/${p.id}/overview`}
              onClick={(e) => {
                if (selecting) {
                  e.preventDefault();
                  toggle(p.id);
                }
              }}
              className={`card relative overflow-hidden transition hover:border-brand-500 ${isSel ? 'border-brand-500 ring-1 ring-brand-500' : ''}`}
            >
              {selecting && (
                <span className={`absolute left-3 top-3 z-10 grid h-6 w-6 place-items-center rounded-md border ${isSel ? 'border-brand-500 bg-brand-500 text-white' : 'border-white/40 bg-black/40'}`}>
                  {isSel && <Check className="h-4 w-4" />}
                </span>
              )}
              {p.thumbnail ? (
                <div className="h-36 bg-panel"><img src={p.thumbnail} className="h-full w-full object-cover" /></div>
              ) : (
                <div className="grid h-36 grid-cols-2 gap-0.5 bg-panel">
                  {pt.slice(0, 2).map((t, i, arr) => <img key={t.id} src={t.thumb} className={`h-full w-full object-cover ${arr.length === 1 ? "col-span-2" : ""}`} />)}
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold">{p.name}</h3>
                  {p.isLabeled && <span className="ml-auto mr-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-500" title={`${p.annotated} annotated images`}>{p.datasetFormat} · Labeled</span>}
                  <MoreVertical className="h-4 w-4 text-muted" />
                </div>
                <p className="mt-1 text-xs text-muted">#{p.id} · Created by {p.owner} · Updated {p.updated}</p>
                <p className="mt-3 text-sm text-muted">{pt.length} tasks · {done} completed</p>
              </div>
            </Link>
          );
        })}
      </div>

      {selecting && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-panel p-2 shadow-2xl">
          <span className="flex items-center gap-2 px-3 text-sm text-muted">
            <span className="grid h-7 min-w-7 place-items-center rounded-lg bg-brand-500/20 px-2 font-semibold text-brand-400">{selected.size}</span>
            project{selected.size > 1 ? 's' : ''} selected
          </span>
          {showArchived ? (
            <button className="btn-ghost text-brand-400" onClick={() => unarchive([...selected])}>
              <ArchiveRestore className="h-4 w-4" /> Unarchive
            </button>
          ) : (
            <button className="btn-ghost text-brand-400" onClick={() => archive([...selected])}>
              <Archive className="h-4 w-4" /> Add to Archive
            </button>
          )}
          <button className="btn-ghost text-red-400" onClick={() => setToDelete(list.filter((p) => selected.has(p.id)))}>
            <Trash2 className="h-4 w-4" /> Delete
          </button>
          <button className="btn-ghost" onClick={() => setSelected(new Set())} aria-label="Clear selection">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {toDelete && <DeleteModal items={toDelete} onCancel={() => setToDelete(null)} onConfirm={confirmDelete} />}
    </>
  );
}

function DeleteModal({ items, onCancel, onConfirm }: { items: Project[]; onCancel: () => void; onConfirm: () => void }) {
  const [text, setText] = useState('');
  const ok = text.trim().toLowerCase() === 'delete';
  const title = items.length === 1 ? `Delete "${items[0].name}"` : `Delete ${items.length} projects`;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4 border-b border-white/10 p-6">
          <span className="grid h-12 w-12 place-items-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-500"><Trash2 className="h-5 w-5" /></span>
          <div className="flex-1">
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-muted">This action cannot be undone</p>
          </div>
          <button className="btn-ghost" onClick={onCancel} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-6">
          <div className="flex gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <p>All images, annotations and tasks inside {items.length === 1 ? 'this project' : 'these projects'} will be <b className="text-red-400">permanently deleted</b> and cannot be recovered.</p>
          </div>
          <div className="max-h-40 space-y-2 overflow-auto">
            {items.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/10 px-4 py-3 text-sm">
                <Folder className="h-4 w-4 text-muted" />
                <span className="flex-1">{p.name}</span>
                <span className="rounded bg-white/5 px-1.5 text-xs text-muted">#{p.id}</span>
              </div>
            ))}
          </div>
          <label className="block text-sm text-muted">
            Type <code className="rounded border border-red-500/30 bg-red-500/10 px-1.5 text-red-400">delete</code> to confirm:
            <input autoFocus className="input mt-2 w-full" placeholder="Type delete here…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok && onConfirm()} />
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t border-white/10 p-6">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button disabled={!ok} onClick={onConfirm} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40">
            <Trash2 className="h-4 w-4" /> Delete Project{items.length > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
