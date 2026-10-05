import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Eye, EyeOff, Lock, LockOpen, Maximize, Menu, Move,
  MousePointer2, Pause, Play, Redo2, RotateCw, Save, Spline, Square, Trash2, Undo2, Wand2, ZoomIn, Pentagon, Dot,
} from 'lucide-react';
import { labels } from '../data/mock';
import { usePersistentState } from '../lib/persist';

type Shape = { id: number; frame: number; label: string; x: number; y: number; w: number; h: number; hidden: boolean; locked: boolean };
type Tool = 'cursor' | 'move' | 'rect' | 'polygon' | 'polyline' | 'points' | 'ai';

const FRAMES = 150;
const initial: Shape[] = [
  { id: 1, frame: 0, label: 'car', x: 120, y: 260, w: 220, h: 130, hidden: false, locked: false },
  { id: 2, frame: 0, label: 'person', x: 520, y: 200, w: 70, h: 190, hidden: false, locked: false },
];

export default function Annotation() {
  const { taskId, jobId } = useParams();
  const key = `annotation:${taskId}:${jobId}`;
  const [frame, setFrame] = usePersistentState(`${key}:frame`, 0);
  const [playing, setPlaying] = useState(false);
  const [tool, setTool] = usePersistentState<Tool>(`${key}:tool`, 'cursor');
  const [label, setLabel] = usePersistentState(`${key}:label`, labels[0].name);
  const [shapes, setShapes] = usePersistentState<Shape[]>(`${key}:shapes`, initial);
  const [history, setHistory] = useState<Shape[][]>([]);
  const [future, setFuture] = useState<Shape[][]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x: number; y: number } | null>(null);
  const [tab, setTab] = usePersistentState<'objects' | 'labels'>(`${key}:tab`, 'objects');
  const [saved, setSaved] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const timer = useRef<number | undefined>(undefined);

  const color = (name: string) => labels.find((l) => l.name === name)?.color ?? '#999';
  const visible = shapes.filter((s) => s.frame === frame);

  function commit(next: Shape[]) {
    setHistory((h) => [...h, shapes]);
    setFuture([]);
    setShapes(next);
    setSaved(false);
  }
  const undo = () => { if (!history.length) return; setFuture((f) => [shapes, ...f]); setShapes(history[history.length - 1]); setHistory((h) => h.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setHistory((h) => [...h, shapes]); setShapes(future[0]); setFuture((f) => f.slice(1)); };
  const update = (id: number, patch: Partial<Shape>) => commit(shapes.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const go = (f: number) => setFrame(Math.max(0, Math.min(FRAMES - 1, f)));
  function togglePlay() {
    if (playing) { window.clearInterval(timer.current); setPlaying(false); return; }
    setPlaying(true);
    timer.current = window.setInterval(() => setFrame((f) => {
      if (f >= FRAMES - 1) { window.clearInterval(timer.current); setPlaying(false); return f; }
      return f + 1;
    }), 200);
  }

  function point(e: React.MouseEvent) {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 800, y: ((e.clientY - r.top) / r.height) * 500 };
  }
  function onDown(e: React.MouseEvent) {
    if (tool !== 'rect') { setActive(null); return; }
    const p = point(e);
    setDraft({ x0: p.x, y0: p.y, x: p.x, y: p.y });
  }
  function onMove(e: React.MouseEvent) {
    if (draft) setDraft({ ...draft, ...point(e) });
  }
  function onUp() {
    if (!draft) return;
    const w = Math.abs(draft.x - draft.x0), h = Math.abs(draft.y - draft.y0);
    if (w > 5 && h > 5) {
      const id = Math.max(0, ...shapes.map((s) => s.id)) + 1;
      commit([...shapes, { id, frame, label, x: Math.min(draft.x, draft.x0), y: Math.min(draft.y, draft.y0), w, h, hidden: false, locked: false }]);
      setActive(id);
    }
    setDraft(null);
  }

  const tools: [Tool | 'fit' | 'rotate', typeof Move, string][] = [
    ['cursor', MousePointer2, 'Cursor'], ['move', Move, 'Move image'], ['rotate', RotateCw, 'Rotate'], ['fit', ZoomIn, 'Fit image'],
    ['rect', Square, 'Draw rectangle'], ['polygon', Pentagon, 'Draw polygon'], ['polyline', Spline, 'Draw polyline'], ['points', Dot, 'Draw points'], ['ai', Wand2, 'AI tools'],
  ];

  return (
    <div className="flex h-screen flex-col bg-panel">
      {/* Top bar */}
      <header className="flex h-12 items-center gap-2 bg-gray-900 px-3 text-gray-200">
        <Link to={`/tasks/${taskId}`} className="flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-gray-800">Menu</Link>
        <button onClick={() => setSaved(true)} className="flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-gray-800">{saved ? 'Saved' : 'Save'}</button>
        <button onClick={undo} disabled={!history.length} className="rounded p-1.5 hover:bg-gray-800 disabled:opacity-30" title="Undo"><Undo2 className="h-4 w-4" /></button>
        <button onClick={redo} disabled={!future.length} className="rounded p-1.5 hover:bg-gray-800 disabled:opacity-30" title="Redo"><Redo2 className="h-4 w-4" /></button>

        <div className="mx-auto flex items-center gap-1">
          <button onClick={() => go(0)} className="rounded p-1.5 hover:bg-gray-800"><ChevronFirst className="h-4 w-4" /></button>
          <button onClick={() => go(frame - 1)} className="rounded p-1.5 hover:bg-gray-800"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={togglePlay} className="rounded p-1.5 hover:bg-gray-800">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
          <button onClick={() => go(frame + 1)} className="rounded p-1.5 hover:bg-gray-800"><ChevronRight className="h-4 w-4" /></button>
          <button onClick={() => go(FRAMES - 1)} className="rounded p-1.5 hover:bg-gray-800"><ChevronLast className="h-4 w-4" /></button>
          <input type="range" min={0} max={FRAMES - 1} value={frame} onChange={(e) => go(+e.target.value)} className="mx-2 w-56 accent-brand-500" />
          <input type="number" value={frame} onChange={(e) => go(+e.target.value)} className="w-16 rounded bg-gray-800 px-2 py-0.5 text-sm" />
          <span className="ml-1 text-xs text-muted">frame_{String(frame).padStart(6, '0')}.jpg</span>
        </div>

        <span className="text-xs text-muted">Job #{jobId}</span>
        <select className="rounded bg-gray-800 px-2 py-1 text-sm"><option>Standard</option><option>Review</option><option>Attribute annotation</option></select>
        <button className="rounded p-1.5 hover:bg-gray-800" onClick={() => document.documentElement.requestFullscreen?.()}><Maximize className="h-4 w-4" /></button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left toolbar */}
        <aside className="flex w-12 flex-col items-center gap-1 bg-gray-800 py-2">
          {tools.map(([id, Icon, title], i) => (
            <div key={id} className="contents">
              {i === 4 && <hr className="my-1 w-8 border-gray-600" />}
              <button
                title={title}
                onClick={() => (id === 'fit' || id === 'rotate' ? null : setTool(id))}
                className={`rounded p-2 ${tool === id ? 'bg-brand-500 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
              >
                <Icon className="h-5 w-5" />
              </button>
            </div>
          ))}
        </aside>

        {/* Canvas */}
        <section className="relative flex min-w-0 flex-1 items-center justify-center p-4">
          {tool === 'rect' && (
            <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-md bg-panel-2 p-2 text-sm shadow">
              Label:
              <select value={label} onChange={(e) => setLabel(e.target.value)} className="input w-36 py-1">{labels.map((l) => <option key={l.name}>{l.name}</option>)}</select>
              <span className="text-muted">Drag on the image to draw</span>
            </div>
          )}
          <div className="relative aspect-[8/5] h-full max-h-full max-w-full bg-black shadow-lg">
            <img src={`https://picsum.photos/seed/frame${frame % 10}/800/500`} className="absolute inset-0 h-full w-full select-none object-cover" draggable={false} />
            <svg
              ref={svgRef}
              viewBox="0 0 800 500"
              className={`absolute inset-0 h-full w-full ${tool === 'rect' ? 'cursor-crosshair' : ''}`}
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={onUp}
            >
              {visible.filter((s) => !s.hidden).map((s) => (
                <g key={s.id} onMouseDown={(e) => { if (tool === 'cursor') { e.stopPropagation(); setActive(s.id); } }}>
                  <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={color(s.label)} fillOpacity={active === s.id ? 0.35 : 0.15} stroke={color(s.label)} strokeWidth={active === s.id ? 3 : 2} />
                  <text x={s.x} y={s.y - 5} fill="white" fontSize="13" stroke="black" strokeWidth="0.4">{s.label} {s.id}</text>
                </g>
              ))}
              {draft && (
                <rect x={Math.min(draft.x, draft.x0)} y={Math.min(draft.y, draft.y0)} width={Math.abs(draft.x - draft.x0)} height={Math.abs(draft.y - draft.y0)} fill="none" stroke={color(label)} strokeWidth={2} strokeDasharray="6 3" />
              )}
            </svg>
          </div>
        </section>

        {/* Right sidebar */}
        <aside className="flex w-80 flex-col border-l border-line bg-panel-2">
          <div className="flex border-b">
            {(['objects', 'labels'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2.5 text-sm font-medium capitalize ${tab === t ? 'border-b-2 border-brand-500 text-brand-600' : 'text-muted'}`}>{t}</button>
            ))}
          </div>
          {tab === 'objects' ? (
            <div className="flex-1 space-y-2 overflow-auto p-2">
              {!visible.length && <p className="p-6 text-center text-sm text-muted">No objects on this frame. Pick the rectangle tool to draw one.</p>}
              {visible.map((s) => (
                <div key={s.id} onClick={() => setActive(s.id)} className={`rounded-md border-l-4 bg-panel-3 p-2 ${active === s.id ? 'ring-2 ring-brand-500/40' : ''}`} style={{ borderLeftColor: color(s.label) }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{s.id}</span>
                    <span className="text-xs text-muted">RECTANGLE SHAPE</span>
                    <div className="ml-auto flex gap-1 text-muted">
                      <button onClick={() => update(s.id, { locked: !s.locked })}>{s.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}</button>
                      <button onClick={() => update(s.id, { hidden: !s.hidden })}>{s.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                      <button disabled={s.locked} onClick={() => commit(shapes.filter((x) => x.id !== s.id))} className="hover:text-red-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <select disabled={s.locked} value={s.label} onChange={(e) => update(s.id, { label: e.target.value })} className="input mt-2 py-1">
                    {labels.map((l) => <option key={l.name}>{l.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 space-y-1 overflow-auto p-2">
              {labels.map((l) => (
                <div key={l.name} className="flex items-center gap-2 rounded-md p-2 hover:bg-panel-3">
                  <span className="h-4 w-4 rounded" style={{ background: l.color }} />
                  <span className="flex-1 text-sm">{l.name}</span>
                  <span className="text-xs text-muted">{shapes.filter((s) => s.label === l.name).length}</span>
                </div>
              ))}
            </div>
          )}
          <div className="border-t p-3 text-xs text-muted">{shapes.length} objects in job · {visible.length} on frame {frame}</div>
        </aside>
      </div>
    </div>
  );
}
