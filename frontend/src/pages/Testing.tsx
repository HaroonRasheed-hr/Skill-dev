import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Zap } from 'lucide-react';
import { models } from '../data/mock';

export default function Testing() {
  const [modelId, setModelId] = useState('');
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const model = models.find((m) => m.id === modelId);

  const onFile = (f?: File) => {
    if (!f) return;
    setImage(URL.createObjectURL(f));
    setOutput(null);
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
              {models.map((m) => (
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
            {output ? <img src={output} className="h-full w-full object-contain" /> : 'Output will appear here'}
          </div>
        </div>
      </section>

      <div className="mt-7 flex justify-end">
        <button
          disabled={!model || !image}
          onClick={() => setOutput(image)}
          className="flex items-center rounded-xl bg-brand-500 px-7 py-4 font-semibold text-slate-900 hover:bg-brand-500/90 disabled:cursor-not-allowed"
        >
          Infer
          <span className="ml-6 border-l border-slate-900/20 pl-4"><ChevronRight className="h-4 w-4" /></span>
        </button>
      </div>
    </>
  );
}
