import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Zap } from 'lucide-react';
import { models } from '../data/mock';
import { usePersistentState } from '../lib/persist';
import { useParams } from 'react-router-dom';
import { api, type ApiTrainingJob } from '../lib/api';

export default function Testing() {
  const { id } = useParams();
  const [modelId, setModelId] = usePersistentState(`testing:${id}:model`, '');
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Detection[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [trained, setTrained] = useState<{ id: string; name: string; version: string }[]>([]);

  useEffect(() => {
    if (!id) return;
    api<ApiTrainingJob[]>(`/projects/${id}/training/jobs/`)
      .then((jobs) => setTrained(jobs.filter((j) => j.status === 'completed').map((j) => ({ id: `job-${j.id}`, name: j.name, version: 'v1' }))))
      .catch(() => {});
  }, [id]);

  const allModels = [...trained, ...models];
  const model = allModels.find((m) => m.id === modelId);

  const onFile = (f?: File) => {
    if (!f) return;
    setImage(URL.createObjectURL(f));
    setFile(f);
    setOutput(null);
    setResults(null);
    setError('');
  };

  type Detection = { box: [number, number, number, number]; score: number; label: string };

  /** Trained models run on the backend; the result is drawn as boxes over the input image. */
  const infer = async () => {
    if (!model || !image) return;
    if (!model.id.startsWith('job-') || !file) { setOutput(image); return; }
    setBusy(true);
    setError('');
    setResults(null);
    try {
      const body = new FormData();
      body.append('image', file);
      const { detections } = await api<{ detections: Detection[] }>(`/projects/${id}/training/jobs/${model.id.slice(4)}/infer/`, { method: 'POST', body });
      const img = new Image();
      img.src = image;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const scale = Math.max(1, img.naturalWidth / 800);
      ctx.lineWidth = 2 * scale;
      ctx.font = `${14 * scale}px sans-serif`;
      detections.forEach((d, i) => {
        const [x1, y1, x2, y2] = d.box;
        const text = `${i + 1}`;
        ctx.strokeStyle = ctx.fillStyle = '#22d3ee';
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        const ty = Math.max(y1, 18 * scale);
        ctx.fillRect(x1, ty - 18 * scale, ctx.measureText(text).width + 8 * scale, 18 * scale);
        ctx.fillStyle = '#04121c';
        ctx.fillText(text, x1 + 4 * scale, ty - 4 * scale);
      });
      setOutput(canvas.toDataURL('image/jpeg', 0.9));
      setResults(detections);
      if (detections.length === 0) setError('No objects detected.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Inference failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb-8 flex items-center gap-3">
        <Zap className="h-7 w-7" />
        <h1 className="text-2xl font-semibold">Test</h1>
        <div className="relative ml-auto">
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-3 rounded-xl bg-panel-2 px-7 py-3 text-sm font-semibold hover:bg-panel-3"
          >
            {model ? `${model.name} ${model.version}` : 'Select model'}
            <ChevronDown className="h-4 w-4" />
          </button>
          {open && (
            <ul className="absolute right-0 z-10 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-panel-2 shadow-lg">
              {allModels.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => { setModelId(m.id); setOpen(false); setOutput(null); }}
                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-panel-3 ${m.id === modelId ? 'text-brand-500' : ''}`}
                  >
                    {m.name} {m.version}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <section className="rounded-2xl border border-line bg-panel-2 p-7">
        <h2 className="mb-5 text-xl font-semibold">{model ? `${model.name} ${model.version}` : 'No model available'}</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex h-[400px] items-center justify-center overflow-hidden rounded-2xl border border-line bg-panel-3/40 text-lg text-muted hover:border-brand-500/60"
          >
            {image ? <img src={image} className="h-full w-full object-contain" /> : 'Click to upload image'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <div className="flex h-[400px] items-center justify-center overflow-hidden rounded-2xl border border-line bg-panel-3/40 text-lg text-muted">
            {busy ? 'Running inference...' : output ? <img src={output} className="h-full w-full object-contain" /> : 'Output will appear here'}
          </div>
        </div>
      </section>

      {results && results.length > 0 && (
        <section className="mt-7 rounded-2xl border border-line bg-panel-2 p-7">
          <h2 className="mb-1 text-xl font-semibold">Results</h2>
          <p className="mb-5 text-sm text-muted">
            {results.length} object{results.length === 1 ? '' : 's'} detected ·{' '}
            {Object.entries(results.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.label]: (acc[d.label] ?? 0) + 1 }), {}))
              .map(([label, n]) => `${n} ${label}`).join(', ')}
          </p>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-4 font-medium">#</th>
                  <th className="py-2 pr-4 font-medium">Label</th>
                  <th className="py-2 pr-4 font-medium">Confidence</th>
                  <th className="py-2 font-medium">Position (x1, y1, x2, y2)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {results.map((d, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-4">{i + 1}</td>
                    <td className="py-2 pr-4 capitalize">{d.label}</td>
                    <td className="py-2 pr-4">{Math.round(d.score * 100)}%</td>
                    <td className="py-2 text-muted">{d.box.map(Math.round).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="mt-7 flex items-center justify-end gap-4">
        {error && <p className="text-sm text-muted">{error}</p>}
        <button
          disabled={!model || !image || busy}
          onClick={infer}
          className="flex items-center rounded-xl bg-brand-500 px-7 py-4 font-semibold text-slate-900 hover:bg-brand-500/90 disabled:cursor-not-allowed"
        >
          Infer
          <span className="ml-6 border-l border-slate-900/20 pl-4"><ChevronRight className="h-4 w-4" /></span>
        </button>
      </div>
    </>
  );
}
