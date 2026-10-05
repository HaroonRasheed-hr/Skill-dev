import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown, ChevronLeft, ChevronRight, Circle, Eye, EyeOff, Filter, Hand, Info, ListTree, Lock, LockOpen, Maximize,
  Menu, Minus, Pentagon, Plus, Redo2, RotateCcw, Save, ScanSearch, Spline, Square, SquareDashed,
  Grip, Trash2, Undo2, Wand2, ImageIcon,
} from 'lucide-react';
import { Empty } from '../components/ui';
import { useProject } from './ProjectDetail';

type Kind = 'rect' | 'polygon' | 'polyline' | 'points' | 'ellipse';
type Tool = 'pan' | 'select' | 'ai' | Kind;
type Pt = { x: number; y: number };
type Shape = { id: number; image: number; kind: Kind; label: string; pts: Pt[]; hidden: boolean; locked: boolean };

const W = 1000, H = 625;
const demo = (id: number) => Array.from({ length: 6 }, (_, i) => `https://picsum.photos/seed/p${id}-${i}/1000/625`);

// Hover card for each rail tool: what it does and its shortcut
const toolHelp: Record<string, [string, string, string?]> = {
  'Pan image': ['Pan the image', 'Drag the image to move around it. Use the mouse wheel to zoom.', 'H'],
  'Reset view': ['Reset view', 'Put zoom and position back to the starting view.'],
  'Fit image': ['Fit image', 'Fit the whole image inside the canvas.'],
  Select: ['Select shapes', 'Click a shape to select it, then edit or delete it in the Objects panel.', 'V'],
  'Zoom in': ['Zoom in', 'Make the image bigger to annotate small objects.', '+'],
  'Zoom out': ['Zoom out', 'Make the image smaller to see more of it.', '−'],
  'AI tools': ['AI tools', 'Let a model suggest annotations for this image. Coming soon.'],
  Rectangle: ['Draw a rectangle', 'Drag from one corner to the opposite one to enclose an object in a bounding box.', 'R'],
  Polygon: ['Draw a polygon', 'Click around the object’s outline, then right-click or press Enter to close the shape.', 'P'],
  Polyline: ['Draw a polyline', 'Click to place points along a line, then right-click or press Enter to finish.', 'L'],
  Points: ['Draw points', 'Click to mark key points, then right-click or press Enter to finish.', 'O'],
  Ellipse: ['Draw an ellipse', 'Drag across a round object to fit an ellipse around it.', 'E'],
};

function RailBtn({ icon: Icon, title, active, onClick }: { icon: typeof Square; title: string; active?: boolean; onClick: () => void }) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [heading, text, key] = toolHelp[title] ?? [title, ''];
  return (
    <>
      <button
        aria-label={title} onClick={onClick}
        onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.right + 12, y: r.top + r.height / 2 }); }}
        onMouseLeave={() => setTip(null)}
        className={`shrink-0 rounded-md p-1.5 ${active ? 'bg-brand-500 text-[#04121c]' : 'text-ink hover:bg-panel-3'}`}
      >
        <Icon className="h-[18px] w-[18px]" />
      </button>
      {tip && (
        <div className="pointer-events-none fixed z-50 w-72 -translate-y-1/2 rounded-xl border border-line bg-panel-2 p-4 text-left font-normal tracking-normal shadow-2xl" style={{ left: tip.x, top: tip.y }}>
          <span className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-b border-l border-line bg-panel-2" />
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-ink">{heading}</p>
            {key && <kbd className="rounded-md bg-panel-3 px-2 py-0.5 text-xs font-semibold text-ink">{key}</kbd>}
          </div>
          {text && <p className="mt-2 text-[13px] leading-snug text-muted">{text}</p>}
        </div>
      )}
    </>
  );
}

function BarBtn({ icon: Icon, text, onClick, disabled }: { icon: typeof Square; text: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={text} className="flex shrink-0 flex-col items-center gap-0.5 px-2 text-[11px] font-semibold leading-none disabled:opacity-40 2xl:px-3">
      <Icon className="h-[18px] w-[18px]" /><span className="hidden xl:block">{text}</span>
    </button>
  );
}

export default function ProjectAnnotation() {
  const p = useProject();
  const images = p?.media?.length ? p.media : demo(p?.id ?? 0);
  const labels = p?.labels.length ? p.labels : [{ name: 'object', color: '#00c2f0' }];

  const [index, setIndex] = useState(0);
  const [tool, setTool] = useState<Tool>('rect');
  const [label, setLabel] = useState(labels[0].name);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [history, setHistory] = useState<Shape[][]>([]);
  const [future, setFuture] = useState<Shape[][]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [draft, setDraft] = useState<Pt[] | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const [pending, setPending] = useState<{ kind: Kind; pts: Pt[]; x: number; y: number } | null>(null);
  const [pick, setPick] = useState(0);
  const [query, setQuery] = useState('');
  const mouse = useRef<Pt>({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pt>({ x: 0, y: 0 });
  const [tab, setTab] = useState<'objects' | 'labels' | 'issues'>('objects');
  const [sort, setSort] = useState<'asc' | 'desc' | 'label'>('asc');
  const [autosave, setAutosave] = useState(false);
  const [saved, setSaved] = useState(true);
  const [opacity, setOpacity] = useState(30);
  const [brightness, setBrightness] = useState(100);
  const [showAppearance, setShowAppearance] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ start: Pt; pan: Pt } | null>(null);

  const color = (name: string) => labels.find((l) => l.name === name)?.color ?? '#999';
  const onImage = shapes.filter((s) => s.image === index);
  const listed = [...onImage].sort((a, b) => sort === 'label' ? a.label.localeCompare(b.label) : sort === 'asc' ? a.id - b.id : b.id - a.id);

  function commit(next: Shape[]) {
    setHistory((h) => [...h, shapes]);
    setFuture([]);
    setShapes(next);
    setSaved(autosave);
  }
  const undo = () => { if (!history.length) return; setFuture((f) => [shapes, ...f]); setShapes(history[history.length - 1]); setHistory((h) => h.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setHistory((h) => [...h, shapes]); setShapes(future[0]); setFuture((f) => f.slice(1)); };
  const update = (id: number, patch: Partial<Shape>) => commit(shapes.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const go = (i: number) => { setDraft(null); setActive(null); setIndex(Math.max(0, Math.min(images.length - 1, i))); };

  function add(kind: Kind, pts: Pt[], name = label) {
    const id = Math.max(0, ...shapes.map((s) => s.id)) + 1;
    commit([...shapes, { id, image: index, kind, label: name, pts, hidden: false, locked: false }]);
    setActive(id);
  }
  // Completed shapes wait here until the user picks their label
  function complete(kind: Kind, pts: Pt[]) {
    const r = canvasRef.current?.getBoundingClientRect();
    setPending({ kind, pts, x: mouse.current.x - (r?.left ?? 0), y: mouse.current.y - (r?.top ?? 0) });
    setPick(Math.max(0, labels.findIndex((l) => l.name === label)));
    setQuery('');
  }
  function finish() {
    if (!draft) return;
    const min = tool === 'polygon' ? 3 : tool === 'polyline' ? 2 : 1;
    if (draft.length >= min) complete(tool as Kind, draft);
    setDraft(null);
  }
  const matches = labels.filter((l) => l.name.toLowerCase().includes(query.toLowerCase()));
  function choose(name?: string) {
    if (!pending || !name) return;
    add(pending.kind, pending.pts, name);
    setLabel(name);
    setPending(null);
  }
  const toolKeys: Record<string, Tool> = { r: 'rect', p: 'polygon', l: 'polyline', o: 'points', e: 'ellipse', v: 'select', h: 'pan' };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pending) {
        const n = Number(e.key);
        if (n >= 1 && n <= matches.length && !query) { e.preventDefault(); choose(matches[n - 1].name); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setPick((i) => (i + 1) % matches.length); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setPick((i) => (i - 1 + matches.length) % matches.length); }
        else if (e.key === 'Enter') { e.preventDefault(); choose(matches[pick]?.name); }
        else if (e.key === 'Escape') setPending(null);
        return;
      }
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); }
      else if (e.key === 'Escape') setDraft(null);
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(8, z * 1.25));
      else if (e.key === '-') setZoom((z) => Math.max(0.2, z / 1.25));
      else if (!e.ctrlKey && toolKeys[e.key.toLowerCase()]) { setDraft(null); setTool(toolKeys[e.key.toLowerCase()]); }
      else if (e.key === 'Backspace' && draft) setDraft(draft.length > 1 ? draft.slice(0, -1) : null);
      else if (e.ctrlKey && e.key === 'z') undo();
      else if (e.ctrlKey && e.key === 'y') redo();
      else if (e.key === 'd' || e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'a' || e.key === 'ArrowLeft') go(index - 1);
      else if (e.key === 'Delete' && active != null) commit(shapes.filter((s) => s.id !== active || s.locked));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function point(e: React.MouseEvent): Pt {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(W, ((e.clientX - r.left) / r.width) * W)), y: Math.max(0, Math.min(H, ((e.clientY - r.top) / r.height) * H)) };
  }
  function onDown(e: React.MouseEvent) {
    if (e.button !== 0 || pending) return;
    if (tool === 'pan' || tool === 'select' || tool === 'ai') {
      if (tool === 'select') setActive(null);
      drag.current = { start: { x: e.clientX, y: e.clientY }, pan };
      return;
    }
    const q = point(e);
    if (tool === 'rect' || tool === 'ellipse') setDraft([q, q]);
    else setDraft((d) => [...(d ?? []), q]);
  }
  function onMove(e: React.MouseEvent) {
    mouse.current = { x: e.clientX, y: e.clientY };
    if (drag.current) {
      const d = drag.current;
      setPan({ x: d.pan.x + e.clientX - d.start.x, y: d.pan.y + e.clientY - d.start.y });
      return;
    }
    const q = point(e);
    setHover(q);
    if (draft && (tool === 'rect' || tool === 'ellipse')) setDraft([draft[0], q]);
  }
  function onUp() {
    drag.current = null;
    if (!draft || (tool !== 'rect' && tool !== 'ellipse')) return;
    const [a, b] = draft;
    if (Math.abs(a.x - b.x) > 4 && Math.abs(a.y - b.y) > 4) complete(tool, [a, b]);
    setDraft(null);
  }
  const onWheel = (e: React.WheelEvent) => setZoom((z) => Math.max(0.2, Math.min(8, z * (e.deltaY < 0 ? 1.1 : 0.9))));

  function render(s: { kind: Kind; pts: Pt[]; label: string }, on: boolean, dashed = false) {
    const c = color(s.label), fill = on ? Math.min(1, opacity / 100 + 0.2) : opacity / 100, sw = (on ? 3 : 2) / zoom;
    const common = { stroke: c, strokeWidth: sw, strokeDasharray: dashed ? `${6 / zoom} ${3 / zoom}` : undefined };
    const [a, b] = s.pts;
    if (s.kind === 'rect') return <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(a.x - b.x)} height={Math.abs(a.y - b.y)} fill={c} fillOpacity={fill} {...common} />;
    if (s.kind === 'ellipse') return <ellipse cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} rx={Math.abs(a.x - b.x) / 2} ry={Math.abs(a.y - b.y) / 2} fill={c} fillOpacity={fill} {...common} />;
    const path = s.pts.map((q) => `${q.x},${q.y}`).join(' ');
    return (
      <>
        {s.kind === 'polygon' && !dashed && <polygon points={path} fill={c} fillOpacity={fill} {...common} />}
        {(s.kind === 'polyline' || dashed) && <polyline points={path} fill="none" {...common} />}
        {s.pts.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={(s.kind === 'points' ? 5 : 3) / zoom} fill={c} stroke="white" strokeWidth={1 / zoom} />)}
      </>
    );
  }

  if (!p) return <Empty text="Project not found" />;

  const draw: [Kind | 'ai', typeof Square, string][] = [
    ['ai', Wand2, 'AI tools'], ['rect', Square, 'Rectangle'], ['polygon', Pentagon, 'Polygon'], ['polyline', Spline, 'Polyline'], ['points', Grip, 'Points'], ['ellipse', Circle, 'Ellipse'],
  ];
  const drawing = tool !== 'pan' && tool !== 'select' && tool !== 'ai';
  const multi = tool === 'polygon' || tool === 'polyline' || tool === 'points';

  return (
    <div ref={rootRef} className="flex h-full min-h-[440px] gap-2 overflow-hidden bg-panel 2xl:gap-3">
      {/* Tool rail */}
      <aside className="no-scrollbar flex w-10 shrink-0 flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden rounded-lg bg-panel-2 py-2 text-[9px] font-bold tracking-wide text-muted">
        <span>NAV</span>
        <RailBtn icon={Hand} title="Pan image" active={tool === 'pan'} onClick={() => setTool('pan')} />
        <RailBtn icon={RotateCcw} title="Reset view" onClick={resetView} />
        <hr className="my-1 w-6 shrink-0" /><span>VIEW</span>
        <RailBtn icon={SquareDashed} title="Fit image" onClick={resetView} />
        <RailBtn icon={ScanSearch} title="Select" active={tool === 'select'} onClick={() => setTool('select')} />
        <RailBtn icon={Plus} title="Zoom in" onClick={() => setZoom((z) => Math.min(8, z * 1.25))} />
        <RailBtn icon={Minus} title="Zoom out" onClick={() => setZoom((z) => Math.max(0.2, z / 1.25))} />
        <hr className="my-1 w-6 shrink-0" /><span>DRAW</span>
        {draw.map(([id, Icon, title]) => <RailBtn key={id} icon={Icon} title={title} active={tool === id} onClick={() => { setDraft(null); setTool(id); }} />)}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-2 2xl:gap-3">
        {/* Top bars */}
        <div className="flex items-stretch gap-2 2xl:gap-3">
          <div className="flex shrink-0 items-center rounded-lg border border-line bg-panel-2 py-1.5">
            <BarBtn icon={Menu} text="Menu" />
            <BarBtn icon={Save} text={saved ? 'Saved' : 'Save'} onClick={() => setSaved(true)} />
            <label className="flex shrink-0 items-center gap-2 whitespace-nowrap px-2 text-xs xl:text-sm" title="Autosave">
              <button onClick={() => { setAutosave(!autosave); if (!autosave) setSaved(true); }} className={`relative h-5 w-9 rounded-full ${autosave ? 'bg-brand-500' : 'bg-panel-3'}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${autosave ? 'left-4.5' : 'left-0.5'}`} />
              </button>
              <span className="hidden lg:inline">Autosave {autosave ? 'ON' : 'OFF'}</span>
            </label>
            <BarBtn icon={Undo2} text="Undo" onClick={undo} disabled={!history.length} />
            <BarBtn icon={Redo2} text="Redo" onClick={redo} disabled={!future.length} />
          </div>
          <div className="flex shrink-0 items-center rounded-lg border border-line bg-panel-2 py-1.5">
            <BarBtn icon={ChevronLeft} text="Prev" onClick={() => go(index - 1)} disabled={index === 0} />
            <span className="whitespace-nowrap px-2 text-sm font-semibold">{index + 1} / {images.length}</span>
            <BarBtn icon={ChevronRight} text="Next" onClick={() => go(index + 1)} disabled={index === images.length - 1} />
          </div>
          <div className="ml-auto flex min-w-0 items-center rounded-lg border border-line bg-panel-2 py-1.5 pr-1.5">
            <BarBtn icon={Maximize} text="Fullscreen" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : rootRef.current?.requestFullscreen())} />
            <BarBtn icon={Info} text="Info" />
            <BarBtn icon={Filter} text="Filters" />
            <select className="input w-28 py-1.5 xl:w-36"><option>Standard</option><option>Review</option><option>Attribute annotation</option></select>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 gap-2 2xl:gap-3">
          {/* Canvas */}
          <section ref={canvasRef} className="relative min-w-0 flex-1 overflow-hidden rounded-lg bg-page" onWheel={onWheel}>
            {drawing && (
              <div className="absolute left-2 right-12 top-2 z-10 flex w-fit max-w-[calc(100%-3.5rem)] items-center gap-2 rounded-lg bg-panel-2/95 p-1.5 text-sm shadow">
                <span className="h-3 w-3 rounded" style={{ background: color(label) }} />
                <select value={label} onChange={(e) => setLabel(e.target.value)} className="input w-32 shrink-0 py-1">{labels.map((l) => <option key={l.name}>{l.name}</option>)}</select>
                <span className="hidden truncate text-xs text-muted lg:block">{multi ? 'Click to add points · Right-click or Enter to finish · Backspace undoes a point' : 'Drag on the image to draw'}</span>
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center px-12 pb-10 pt-12">
              <div className="relative aspect-[8/5] max-h-full w-full max-w-full" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
                <img key={images[index]} src={images[index]} draggable={false} className="absolute inset-0 h-full w-full select-none object-contain" style={{ filter: `brightness(${brightness}%)` }} />
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${W} ${H}`}
                  className={`absolute inset-0 h-full w-full ${drawing ? 'cursor-crosshair' : tool === 'pan' ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => { onUp(); setHover(null); }} onDoubleClick={() => multi && finish()}
                  onContextMenu={(e) => { e.preventDefault(); mouse.current = { x: e.clientX, y: e.clientY }; finish(); }}
                >
                  {onImage.filter((s) => !s.hidden).map((s) => (
                    <g key={s.id} onMouseDown={(e) => { if (tool === 'select') { e.stopPropagation(); setActive(s.id); } }} className={tool === 'select' ? 'cursor-pointer' : ''}>
                      {render(s, active === s.id)}
                      <text x={s.pts[0].x} y={s.pts[0].y - 6 / zoom} fill="white" fontSize={13 / zoom} stroke="black" strokeWidth={0.4 / zoom}>{s.label} {s.id}</text>
                    </g>
                  ))}
                  {draft && render({ kind: tool as Kind, label, pts: multi && hover && tool !== 'points' ? [...draft, hover] : draft }, true, multi && tool !== 'points')}
                  {pending && render({ ...pending, label: matches[pick]?.name ?? label }, true, true)}
                </svg>
              </div>
            </div>

            {/* Label picker for the just-completed shape */}
            {pending && (
              <div className="absolute z-20 w-56 rounded-lg border border-line bg-panel-2 p-2 shadow-xl"
                style={{ left: Math.min(pending.x + 8, (canvasRef.current?.clientWidth ?? 600) - 232), top: Math.min(pending.y + 8, (canvasRef.current?.clientHeight ?? 400) - 60 - matches.length * 36) }}>
                <p className="mb-2 text-xs font-semibold text-muted">Choose a label</p>
                <input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setPick(0); }} placeholder="Search labels…" className="input mb-2 py-1" />
                {matches.map((l, i) => (
                  <button key={l.name} onMouseEnter={() => setPick(i)} onClick={() => choose(l.name)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${pick === i ? 'bg-panel-3' : ''}`}>
                    <span className="h-3 w-3 rounded" style={{ background: l.color }} />
                    <span className="flex-1">{l.name}</span>
                    {!query && i < 9 && <kbd className="rounded border border-line px-1 text-xs text-muted">{i + 1}</kbd>}
                  </button>
                ))}
                {!matches.length && <p className="px-2 py-1 text-sm text-muted">No matching label</p>}
                <p className="mt-2 text-[11px] text-muted">↑↓ + Enter to pick · Esc to discard</p>
              </div>
            )}

            {/* Zoom slider */}
            <div className="absolute bottom-12 right-2 flex flex-col items-center gap-2 rounded-full bg-panel-2 px-1.5 py-2 text-xs text-muted">
              Z
              <input type="range" min={20} max={800} value={Math.round(zoom * 100)} onChange={(e) => setZoom(+e.target.value / 100)} className="h-28 w-4 accent-brand-500 2xl:h-40 [writing-mode:vertical-lr] [direction:rtl]" />
              <button onClick={resetView} title="Reset zoom"><Plus className="h-4 w-4" /></button>
            </div>

            {/* Image settings */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
              {showSettings && (
                <div className="mb-2 w-64 space-y-3 rounded-lg bg-panel-2 p-3 text-sm shadow">
                  <label className="block">Brightness {brightness}%<input type="range" min={30} max={200} value={brightness} onChange={(e) => setBrightness(+e.target.value)} className="w-full accent-brand-500" /></label>
                </div>
              )}
              <button onClick={() => setShowSettings(!showSettings)} className="flex items-center gap-2 rounded-t-lg bg-panel-2 px-4 py-2 text-sm font-semibold">Image settings</button>
            </div>
          </section>

          {/* Right panel */}
          {showPanel ? (
            <aside className="relative flex w-60 shrink-0 flex-col rounded-lg border border-line bg-panel-2 p-2 xl:w-72 2xl:w-80 2xl:p-3">
              <button onClick={() => setShowPanel(false)} className="absolute right-2 top-2 rounded p-1 hover:bg-panel-3" title="Hide panel"><ListTree className="h-4 w-4" /></button>
              <div className="mb-2 flex gap-1 pr-7">
                {(['objects', 'labels', 'issues'] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-semibold capitalize ${tab === t ? 'bg-brand-500 text-[#04121c]' : ''}`}>{t}</button>
                ))}
              </div>

              <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-line p-2">
                {tab === 'objects' && (
                  <>
                    <div className="mb-2 flex items-center gap-2 whitespace-nowrap text-xs">
                      <span className="rounded-full border border-brand-500/40 bg-brand-50 px-2.5 py-1 font-semibold">Items: {onImage.length}</span>
                      <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="input ml-auto w-auto py-1 text-xs" title="Sort by">
                        <option value="asc">ID - ascent</option><option value="desc">ID - descent</option><option value="label">Label</option>
                      </select>
                    </div>
                    <div className="mb-2 flex justify-around text-muted">
                      <button title="Lock all" onClick={() => commit(shapes.map((s) => s.image === index ? { ...s, locked: !onImage.every((x) => x.locked) } : s))}><Lock className="h-4 w-4" /></button>
                      <button title="Hide all" onClick={() => commit(shapes.map((s) => s.image === index ? { ...s, hidden: !onImage.every((x) => x.hidden) } : s))}><EyeOff className="h-4 w-4" /></button>
                      <ChevronDown className="h-4 w-4" />
                    </div>
                    <div className="flex-1 space-y-2 overflow-auto">
                      {!listed.length && <p className="p-4 text-center text-sm text-muted">No objects yet. Pick a draw tool and annotate the image.</p>}
                      {listed.map((s) => (
                        <div key={s.id} onClick={() => setActive(s.id)} className={`rounded-md border-l-4 bg-panel-3 p-2 ${active === s.id ? 'ring-2 ring-brand-500/50' : ''}`} style={{ borderLeftColor: color(s.label) }}>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{s.id}</span>
                            <span className="text-xs uppercase text-muted">{s.kind} shape</span>
                            <div className="ml-auto flex gap-1 text-muted">
                              <button onClick={(e) => { e.stopPropagation(); update(s.id, { locked: !s.locked }); }}>{s.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}</button>
                              <button onClick={(e) => { e.stopPropagation(); update(s.id, { hidden: !s.hidden }); }}>{s.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                              <button disabled={s.locked} onClick={(e) => { e.stopPropagation(); commit(shapes.filter((x) => x.id !== s.id)); }} className="hover:text-red-500 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                            </div>
                          </div>
                          <select disabled={s.locked} value={s.label} onChange={(e) => update(s.id, { label: e.target.value })} className="input mt-2 py-1">
                            {labels.map((l) => <option key={l.name}>{l.name}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {tab === 'labels' && (
                  <div className="space-y-1 overflow-auto">
                    {labels.map((l) => (
                      <button key={l.name} onClick={() => setLabel(l.name)} className={`flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-panel-3 ${label === l.name ? 'bg-panel-3' : ''}`}>
                        <span className="h-4 w-4 rounded" style={{ background: l.color }} />
                        <span className="flex-1 text-sm">{l.name}</span>
                        <span className="text-xs text-muted">{onImage.filter((s) => s.label === l.name).length}</span>
                      </button>
                    ))}
                  </div>
                )}
                {tab === 'issues' && <p className="p-4 text-center text-sm text-muted">No issues on this image.</p>}
              </div>

              <div className="mt-2 rounded-lg bg-panel-3">
                <button onClick={() => setShowAppearance(!showAppearance)} className="flex w-full items-center gap-2 px-3 py-2 font-semibold">
                  <ChevronRight className={`h-4 w-4 transition ${showAppearance ? 'rotate-90' : ''}`} />Appearance
                </button>
                {showAppearance && (
                  <label className="block px-3 pb-3 text-sm">Fill opacity {opacity}%<input type="range" min={0} max={100} value={opacity} onChange={(e) => setOpacity(+e.target.value)} className="w-full accent-brand-500" /></label>
                )}
              </div>
            </aside>
          ) : (
            <button onClick={() => setShowPanel(true)} className="h-fit rounded-lg border border-line bg-panel-2 p-2" title="Show panel"><ListTree className="h-4 w-4" /></button>
          )}
        </div>
      </div>
    </div>
  );
}
