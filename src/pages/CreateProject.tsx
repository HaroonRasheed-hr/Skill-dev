import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Plus, Eye, FileArchive, FilePlus2, Folder, FolderUp, LayoutGrid, PlusCircle, Tag, X } from 'lucide-react';
import { projects, type Label } from '../data/mock';
import { checkDataset, type DatasetEntry, type DatasetFormat } from '../lib/datasetFormat';

const swatches = ['#FF5A5F', '#4FD1FF', '#3B6CFF'];
const steps = ['Project Info', 'Dataset Definition', 'Review & Create'];

type Media = { file: File; url: string };
type Dataset = { kind: 'zip' | 'folder'; name: string; files: File[]; previews: Media[]; loading?: boolean; format?: DatasetFormat; annotated?: number };

const mediaTypes: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogg: 'video/ogg',
};
const mediaType = (path: string) => mediaTypes[path.split('.').pop()?.toLowerCase() ?? ''];
const toMedia = (file: File): Media => ({ file, url: URL.createObjectURL(file) });

// Checks the dataset has images + annotations, then turns its images into previews
async function loadDataset(entries: (DatasetEntry & { blob: () => Promise<Blob> })[]) {
  const check = await checkDataset(entries);
  if (!check.ok) return check;
  const byPath = new Map(entries.map((e) => [e.path, e]));
  const previews = await Promise.all(check.images.map(async (img) =>
    toMedia(new File([await byPath.get(img.path)!.blob()], img.path.split('/').pop()!, { type: mediaType(img.path) }))));
  return { ...check, previews };
}

async function zipEntries(zip: File) {
  const { default: JSZip } = await import('jszip');
  const archive = await JSZip.loadAsync(zip);
  return Object.values(archive.files).filter((f) => !f.dir).map((f) => ({ path: f.name, text: () => f.async('text'), blob: () => f.async('blob') }));
}

const folderEntries = (files: File[]) => files.map((f) => ({ path: f.webkitRelativePath || f.name, text: () => f.text(), blob: async () => f as Blob }));

function formatSize(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function datasetSummary(d: Dataset) {
  const size = formatSize(d.files.reduce((n, f) => n + f.size, 0));
  return d.kind === 'zip' ? size : `${d.files.length} file${d.files.length !== 1 ? 's' : ''} · ${size}`;
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="mb-10 flex items-start justify-center">
      {steps.map((s, i) => (
        <div key={s} className="flex items-start">
          <div className="flex w-36 flex-col items-center gap-2">
            <span className={`grid h-9 w-9 place-items-center rounded-full border text-sm ${i === step ? 'border-white bg-white text-page' : 'border-muted/60 text-ink'}`}>{i + 1}</span>
            <span className={`text-sm ${i === step ? 'font-semibold text-ink' : 'text-muted'}`}>{s}</span>
          </div>
          {i < steps.length - 1 && <div className="mt-[18px] h-0.5 w-24 bg-line" />}
        </div>
      ))}
    </div>
  );
}

function ArrowButton({ children, onClick, disabled, icon }: { children: ReactNode; onClick: () => void; disabled?: boolean; icon?: boolean }) {
  return (
    <button className="btn-primary px-5 py-3" onClick={onClick} disabled={disabled}>
      {icon && <PlusCircle className="h-4 w-4" />}
      {children}
      <span className="ml-2 border-l border-[#04121c]/30 pl-3"><ChevronRight className="h-4 w-4" /></span>
    </button>
  );
}

function FieldError({ text }: { text?: string }) {
  return text ? <p className="mt-2 text-sm text-red-400">{text}</p> : null;
}

const labelPalette = ['#FF5A5F', '#4CCBFF', '#3B6CFF', '#F59E0B', '#10B981', '#A855F7', '#EC4899', '#84CC16', '#F97316', '#14B8A6'];

const sameColor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function nextFreeColor(used: string[]) {
  const free = labelPalette.find((c) => !used.some((u) => sameColor(u, c)));
  if (free) return free;
  let c: string;
  do c = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0').toUpperCase();
  while (used.some((u) => sameColor(u, c)));
  return c;
}

const PREVIEW_LIMIT = 6;

function Thumb({ media, onOpen, onRemove, onSelect, selected }: { media: Media; onOpen: () => void; onRemove: () => void; onSelect?: () => void; selected?: boolean }) {
  return (
    <div title={media.file.name} onClick={onSelect ?? onOpen}
      className={`group relative h-32 shrink-0 cursor-pointer overflow-hidden rounded-xl border bg-panel-2/60 ${selected ? 'border-brand-500 ring-2 ring-brand-500' : 'border-transparent hover:border-brand-500/60'}`}>
      {media.file.type.startsWith('video')
        ? <video src={media.url} className="h-full w-full object-contain" />
        : <img src={media.url} loading="lazy" className="h-full w-full object-contain" />}
      {onSelect && (
        <button title="Preview" className="absolute left-2 top-2 rounded-full bg-black/80 p-1.5 hover:bg-brand-500 hover:text-page" onClick={(e) => { e.stopPropagation(); onOpen(); }}><Eye className="h-3.5 w-3.5" /></button>
      )}
      <button title="Remove" className="absolute right-2 top-2 rounded-full bg-black/80 p-1.5 hover:bg-red-500" onClick={(e) => { e.stopPropagation(); onRemove(); }}><X className="h-3.5 w-3.5" /></button>
      {selected && <span className="absolute inset-x-0 bottom-0 bg-brand-500 py-1 text-center text-xs font-semibold text-page">Thumbnail</span>}
    </div>
  );
}

function LabelChip({ label, onRemove }: { label: Label; onRemove: () => void }) {
  return (
    <span className="flex w-44 items-center gap-3 rounded-lg border border-line bg-panel-2 px-4 py-3">
      <span className="h-6 w-2 rounded-full" style={{ background: label.color }} />
      <span className="flex-1 truncate font-medium">{label.name}</span>
      <button onClick={onRemove} className="text-muted hover:text-ink"><X className="h-4 w-4" /></button>
    </span>
  );
}

function LabelModal({ labels, onChange, onClose }: { labels: Label[]; onChange: (l: Label[]) => void; onClose: () => void }) {
  const used = labels.map((l) => l.color);
  const [name, setName] = useState('');
  const [color, setColor] = useState(() => nextFreeColor(used));
  const [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const isUsed = (c: string) => used.some((u) => sameColor(u, c));

  const save = () => {
    const n = name.trim();
    if (!n) return setError('Label name is required');
    if (labels.some((l) => l.name.toLowerCase() === n.toLowerCase())) return setError('Label already exists');
    if (isUsed(color)) return setError('This color is already used by another label');
    const nextLabels = [...labels, { name: n, color }];
    onChange(nextLabels);
    setName('');
    setError('');
    setColor(nextFreeColor(nextLabels.map((l) => l.color)));
  };

  const remove = (l: Label) => onChange(labels.filter((x) => x !== l));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-4xl rounded-2xl bg-panel p-10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line pb-6">
          <h2 className="text-2xl font-semibold">Labels</h2>
          <button onClick={onClose} className="text-muted hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <h3 className="mt-8 mb-4 text-lg">Labels</h3>
        <div className="flex flex-wrap items-start gap-7">
          <div className="min-w-64 flex-1">
            <input autoFocus className={`input py-3 ${error ? 'border-red-500' : ''}`} placeholder="Label Name" value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }} onKeyDown={(e) => e.key === 'Enter' && save()} />
            <FieldError text={error} />
          </div>
          <div>
            <p className="mb-2 -mt-6 text-muted">Select Color</p>
            <div className="flex items-center gap-3 rounded-full border border-line bg-panel-2 px-4 py-2">
              {labelPalette.slice(0, 3).map((c) => (
                <button key={c} disabled={isUsed(c)} title={isUsed(c) ? 'Already used' : c} onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full disabled:cursor-not-allowed disabled:opacity-20 ${sameColor(color, c) ? 'ring-2 ring-white ring-offset-2 ring-offset-panel-2' : ''}`} style={{ background: c }} />
              ))}
              <span className="h-6 w-px bg-line" />
              <button onClick={() => picker.current?.click()}
                className={`grid h-8 w-8 place-items-center rounded-full bg-panel-3 ${!labelPalette.slice(0, 3).some((c) => sameColor(c, color)) ? 'ring-2 ring-white ring-offset-2 ring-offset-panel-2' : ''}`}>
                <LayoutGrid className="h-3.5 w-3.5 text-muted" />
              </button>
              <input ref={picker} type="color" className="sr-only" value={color} onChange={(e) => { setColor(e.target.value.toUpperCase()); setError(''); }} />
            </div>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-line bg-panel-2 px-3 py-1 text-sm text-muted">
              <span className="h-3 w-3 rounded-full" style={{ background: color }} />
              Selected: <code className="font-semibold text-ink">{color.toUpperCase()}</code>
            </div>
          </div>
        </div>
        <div className="mt-6"><ArrowButton onClick={save}>Save Label</ArrowButton></div>
        {labels.length > 0 && (
          <>
            <h3 className="mt-8 mb-3 text-lg">Preview</h3>
            <div className="flex flex-wrap gap-3">
              {labels.map((l) => (
                <LabelChip key={l.name} label={l} onRemove={() => remove(l)} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CreateProject() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#1DB4FF');
  const [media, setMedia] = useState<Media[]>([]);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [datasetMenu, setDatasetMenu] = useState(false);
  const [labels, setLabels] = useState<Label[]>([]);
  const [addingLabel, setAddingLabel] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Media | null>(null);
  const [gallery, setGallery] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const colorInput = useRef<HTMLInputElement>(null);

  const replaceDataset = (d: Dataset | null) => {
    dataset?.previews.forEach((m) => URL.revokeObjectURL(m.url));
    setDataset(d);
  };
  const startDataset = (d: Omit<Dataset, 'previews'>, read: () => Promise<Parameters<typeof loadDataset>[0]>) => {
    replaceDataset({ ...d, previews: [], loading: true });
    setErrors((er) => ({ ...er, data: '' }));
    const current = d.files[0];
    read().then(loadDataset)
      .then((res) => {
        if (!res.ok) throw new Error(res.error);
        setDataset((prev) => {
          if (prev?.files[0] !== current) { res.previews.forEach((m) => URL.revokeObjectURL(m.url)); return prev; }
          return { ...prev, previews: res.previews, loading: false, format: res.format, annotated: res.annotated };
        });
        // Bring the dataset's classes in as labels, each with its own color
        setLabels((ls) => {
          const next = [...ls];
          for (const name of res.classes) {
            if (!next.some((l) => l.name.toLowerCase() === name.toLowerCase())) next.push({ name, color: nextFreeColor(next.map((l) => l.color)) });
          }
          return next;
        });
        setErrors((er) => ({ ...er, labels: '' }));
      })
      .catch((err: Error) => {
        setDataset((prev) => (prev?.files[0] === current ? null : prev));
        setErrors((er) => ({ ...er, data: err.message.startsWith('No ') ? err.message : `Could not read this dataset: ${err.message}` }));
      });
  };
  const allMedia = [...media, ...(dataset?.previews ?? [])];
  const thumbnail = allMedia.find((m) => m.url === thumbnailUrl) ?? allMedia[0];
  const removeMedia = (m: Media) => {
    URL.revokeObjectURL(m.url);
    setMedia((list) => list.filter((x) => x !== m));
    setDataset((d) => d && { ...d, previews: d.previews.filter((x) => x !== m) });
  };

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPreview(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  useEffect(() => () => media.forEach((m) => URL.revokeObjectURL(m.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const validate = () => {
    const e: Record<string, string> = {};
    if (step === 0 && !name.trim()) e.name = 'Project name is required';
    if (step === 1) {
      if (media.length === 0 && !dataset) e.data = 'Upload at least one image/video or a dataset';
      if (labels.length === 0) e.labels = 'Add at least one label';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => validate() && setStep((s) => s + 1);


  const create = () => {
    projects.push({
      id: Math.max(0, ...projects.map((p) => p.id)) + 1, name: name.trim(), owner: 'haroon', updated: 'just now', labels,
      description: description.trim() || undefined, color,
      // Own object URL so it survives this page revoking its preview URLs on unmount
      thumbnail: thumbnail && !thumbnail.file.type.startsWith('video') ? URL.createObjectURL(thumbnail.file) : undefined,
    });
    navigate('/projects');
  };

  return (
    <div className="mx-auto max-w-6xl">
      <Stepper step={step} />

      {step === 0 && (
        <>
          <h1 className="border-b border-line pb-4 text-3xl font-semibold">Project Information</h1>
          <div className="mt-8 space-y-6">
            <div>
              <label className="mb-3 block font-semibold"><span className="text-red-500">*</span> Project Name</label>
              <input className={`input py-3 ${errors.name ? 'border-red-500' : ''}`} value={name} onChange={(e) => { setName(e.target.value); setErrors({}); }} />
              <FieldError text={errors.name} />
            </div>
            <div>
              <label className="mb-3 block font-semibold">Project Description <span className="text-muted">(Optional)</span></label>
              <textarea className="input min-h-32" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label className="mb-3 block font-semibold">Select Color</label>
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-3 rounded-full border border-line bg-panel px-4 py-2.5">
                  {swatches.map((c) => (
                    <button key={c} onClick={() => setColor(c)} className={`h-10 w-10 rounded-full ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-panel' : ''}`} style={{ background: c }} />
                  ))}
                  <span className="h-7 w-px bg-line" />
                  <button onClick={() => colorInput.current?.click()} className={`grid h-10 w-10 place-items-center rounded-full bg-[#1DB4FF] ${!swatches.includes(color) ? 'ring-2 ring-white ring-offset-2 ring-offset-panel' : ''}`}>
                    <LayoutGrid className="h-4 w-4 text-white" />
                  </button>
                  <input ref={colorInput} type="color" className="sr-only" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} />
                </div>
                <div className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-3 text-sm text-muted">
                  <span className="h-4 w-4 rounded-full" style={{ background: color }} />
                  Selected: <code className="font-semibold text-ink">{color.toUpperCase()}</code>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h1 className="border-b border-line pb-4 text-2xl font-semibold">Dataset Setup</h1>
          <h2 className="mt-8 mb-4 text-lg font-semibold">Upload Media</h2>
          <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
            <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-line py-10">
              <Folder className="h-10 w-10 text-brand-500" strokeWidth={1.5} />
              <p className="text-sm font-semibold">Select Your Image or Video</p>
              <ArrowButton icon onClick={() => mediaInput.current?.click()}>Upload</ArrowButton>
              <input ref={mediaInput} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => {
                const files = Array.from(e.target.files ?? []).map((file) => ({ file, url: URL.createObjectURL(file) }));
                setMedia((m) => [...m, ...files]);
                setErrors((er) => ({ ...er, data: '' }));
                e.target.value = '';
              }} />
            </div>
            <div className="relative flex flex-col items-center justify-center gap-4 py-10">
              <FilePlus2 className="h-10 w-10 text-brand-500" strokeWidth={1.5} />
              <p className="text-sm font-semibold">Or You can Upload a Dataset</p>
              <ArrowButton icon onClick={() => setDatasetMenu((v) => !v)}>Upload Dataset</ArrowButton>
              {datasetMenu && (
                <div className="absolute top-[calc(100%-2.5rem)] z-10 w-52 overflow-hidden rounded-lg border border-line bg-panel-2 shadow-xl">
                  <button className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-panel-3" onClick={() => { setDatasetMenu(false); zipInput.current?.click(); }}>
                    <FileArchive className="h-4 w-4 text-brand-500" />Upload ZIP file
                  </button>
                  <button className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-panel-3" onClick={() => { setDatasetMenu(false); folderInput.current?.click(); }}>
                    <FolderUp className="h-4 w-4 text-brand-500" />Upload folder
                  </button>
                </div>
              )}
              {dataset && (
                <span className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted">
                  {dataset.kind === 'zip' ? <FileArchive className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
                  <span className="max-w-48 truncate text-ink">{dataset.name}</span> · {dataset.loading ? 'Checking…' : <><span className="text-brand-500">{dataset.format}</span> · {dataset.annotated} annotated · {datasetSummary(dataset)}</>}
                  <button onClick={() => replaceDataset(null)} className="hover:text-ink"><X className="h-3.5 w-3.5" /></button>
                </span>
              )}
              <input ref={zipInput} type="file" accept=".zip,application/zip,application/x-zip-compressed" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) startDataset({ kind: 'zip', name: f.name, files: [f] }, () => zipEntries(f));
                e.target.value = '';
              }} />
              <input ref={folderInput} type="file" multiple className="hidden" {...{ webkitdirectory: '', directory: '' }} onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) startDataset({ kind: 'folder', name: files[0].webkitRelativePath.split('/')[0] || 'Folder', files }, async () => folderEntries(files));
                e.target.value = '';
              }} />
            </div>
          </div>
          <FieldError text={errors.data} />

          <h2 className="mt-8 mb-3 text-lg font-semibold">Preview</h2>
          {dataset?.loading && <p className="mb-3 text-sm text-muted">Checking images and annotations in {dataset.name}…</p>}
          {allMedia.length === 0 ? (!dataset?.loading && <p className="text-sm text-muted">{dataset ? 'No images or videos found in this dataset' : 'No files uploaded yet'}</p>) : (
            <>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
                <button onClick={() => mediaInput.current?.click()} className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-brand-500/50 bg-brand-50/40 text-brand-500 hover:border-brand-500">
                  <Plus className="h-7 w-7" /><span className="text-sm font-semibold">Add more</span>
                </button>
                {allMedia.slice(0, PREVIEW_LIMIT).map((m) => <Thumb key={m.url} media={m} selected={allMedia.length > 1 && m === thumbnail} onSelect={() => setThumbnailUrl(m.url)} onOpen={() => setPreview(m)} onRemove={() => removeMedia(m)} />)}
                {allMedia.length > PREVIEW_LIMIT && (
                  <button onClick={() => setGallery(true)} className="flex h-32 flex-col items-center justify-center rounded-xl border border-line bg-panel-2 hover:border-brand-500">
                    <span className="text-3xl font-bold text-brand-500">+{allMedia.length - PREVIEW_LIMIT}</span>
                    <span className="text-sm text-muted">more</span>
                  </button>
                )}
              </div>
              <p className="mt-3 text-sm text-muted">{allMedia.length} file{allMedia.length !== 1 && 's'}{dataset ? ' in dataset' : ''}</p>
            </>
          )}

          {labels.length > 0 ? (
            <>
              <div className="mt-8 mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Labels</h2>
                <ArrowButton icon onClick={() => setAddingLabel(true)}>Add Labels</ArrowButton>
              </div>
              <div className="flex flex-wrap gap-3">
                {labels.map((l) => <LabelChip key={l.name} label={l} onRemove={() => setLabels(labels.filter((x) => x !== l))} />)}
              </div>
            </>
          ) : (
            <>
              <h2 className="mt-8 mb-4 text-lg font-semibold">Labels</h2>
              <div className={`flex flex-col items-center gap-4 rounded-xl border border-dashed py-10 ${errors.labels ? 'border-red-500' : 'border-line'}`}>
                <Tag className="h-10 w-10 text-brand-500" strokeWidth={1.5} />
                <p className="text-sm font-semibold">Click Here to Add Labels</p>
                <ArrowButton icon onClick={() => setAddingLabel(true)}>Add Labels</ArrowButton>
              </div>
            </>
          )}
          <FieldError text={errors.labels} />
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="border-b border-line pb-4 text-2xl font-semibold">Review & Create</h1>
          <h2 className="mt-10 mb-5 text-lg font-semibold">Project Info</h2>
          <dl className="grid grid-cols-[13rem_1fr] gap-y-3 text-sm">
            <dt className="text-muted">Project Name</dt><dd className="font-semibold">{name}</dd>
            <dt className="text-muted">Project Description</dt><dd className="font-semibold">{description || '—'}</dd>
            <dt className="text-muted">Selected Color</dt>
            <dd className="flex items-center gap-2 text-xs text-muted"><span className="h-4 w-4 rounded-full ring-2 ring-white/20" style={{ background: color }} />{color.toUpperCase()}</dd>
            <dt className="text-muted">Labels</dt>
            <dd>
              <p className="mb-2 text-xs text-muted">{labels.length} label{labels.length !== 1 && 's'}</p>
              <div className="flex flex-wrap gap-2">
                {labels.map((l) => (
                  <span key={l.name} className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs"><span className="h-2 w-2 rounded-full" style={{ background: l.color }} />{l.name}</span>
                ))}
              </div>
            </dd>
          </dl>
          <h2 className="mt-10 mb-5 text-lg font-semibold">Dataset Setup</h2>
          <dl className="grid grid-cols-[13rem_1fr] items-center gap-y-3 text-sm">
            {allMedia.length > 0 && (<>
              <dt className="text-muted">Thumbnail</dt>
              <dd>
                <button onClick={() => setPreview(thumbnail)} className="relative h-28 w-28 overflow-hidden rounded-lg border border-line">
                  {thumbnail.file.type.startsWith('video') ? <video src={thumbnail.url} className="h-full w-full object-cover" /> : <img src={thumbnail.url} className="h-full w-full object-cover" />}
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-black/80 py-1 text-xs font-semibold"><Eye className="h-3 w-3" />Preview</span>
                </button>
                {allMedia.length > 1 && <p className="mt-2 text-xs text-muted">+{allMedia.length - 1} more file{allMedia.length > 2 && 's'}</p>}
              </dd>
            </>)}
            {dataset && (<><dt className="text-muted">Dataset</dt><dd><span className="font-semibold">{dataset.name}</span> <span className="text-xs text-muted">({dataset.kind === 'zip' ? 'ZIP' : 'Folder'} · {dataset.format} · {dataset.annotated} annotated images · {datasetSummary(dataset)})</span></dd></>)}
          </dl>
        </>
      )}

      <div className={`mt-10 flex ${step === 0 ? 'justify-end' : 'justify-between'}`}>
        {step > 0 && <button className="btn rounded-lg bg-panel-2 px-6 py-3 text-muted hover:text-ink" onClick={() => { setErrors({}); setStep(step - 1); }}>Previous</button>}
        {step < 2 ? <ArrowButton onClick={next}>Next</ArrowButton> : <ArrowButton onClick={create}>Create Project</ArrowButton>}
      </div>

      {addingLabel && (
        <LabelModal
          labels={labels}
          onChange={(l) => { setLabels(l); setErrors((e) => ({ ...e, labels: '' })); }}
          onClose={() => setAddingLabel(false)}
        />
      )}

      {gallery && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4" onClick={() => setGallery(false)}>
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-panel p-9" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">All Media <span className="text-base font-normal text-muted">({allMedia.length})</span></h2>
              <button onClick={() => setGallery(false)} className="text-muted hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 mb-6 flex items-center justify-between gap-4">
              <p className="text-muted">Click an image to set as thumbnail.</p>
              <button onClick={() => mediaInput.current?.click()} className="btn border border-brand-500/50 bg-brand-50/60 text-brand-500 hover:border-brand-500"><Plus className="h-4 w-4" />Add more</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-2">
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-5">
                {allMedia.map((m) => <Thumb key={m.url} media={m} selected={m === thumbnail} onSelect={() => setThumbnailUrl(m.url)} onOpen={() => setPreview(m)} onRemove={() => removeMedia(m)} />)}
              </div>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/85 p-6" onClick={() => setPreview(null)}>
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="truncate text-sm text-muted">{preview.file.name}</p>
            <button title="Close" onClick={() => setPreview(null)} className="rounded-full bg-panel-2 p-2 text-ink hover:bg-red-500"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid min-h-0 flex-1 place-items-center">
            {preview.file.type.startsWith('video')
              ? <video src={preview.url} controls onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-lg" />
              : <img src={preview.url} onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-lg object-contain" />}
          </div>
        </div>
      )}
    </div>
  );
}
