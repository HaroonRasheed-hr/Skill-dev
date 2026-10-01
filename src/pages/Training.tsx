import { useState } from 'react';
import { Dumbbell, Play, Square } from 'lucide-react';
import { Badge, PageHeader, Progress } from '../components/ui';
import { models, projects, trainingRuns } from '../data/mock';

// Fake loss curve for the running job
const curve = Array.from({ length: 37 }, (_, i) => 2.4 * Math.exp(-i / 14) + 0.6 + Math.sin(i) * 0.05);

export default function Training() {
  const [selected, setSelected] = useState(trainingRuns[0].id);
  const run = trainingRuns.find((r) => r.id === selected)!;
  const max = Math.max(...curve);
  const points = curve.map((v, i) => `${(i / (curve.length - 1)) * 400},${150 - (v / max) * 140}`).join(' ');

  return (
    <>
      <PageHeader title="Train" icon={Dumbbell} />
      <div className="grid gap-5 lg:grid-cols-3">
        <form className="card space-y-4 p-5" onSubmit={(e) => e.preventDefault()}>
          <h2 className="font-semibold">New training run</h2>
          <div><label className="label">Base model</label><select className="input">{models.filter((m) => m.type === 'detector').map((m) => <option key={m.id}>{m.name}</option>)}</select></div>
          <div><label className="label">Dataset (project)</label><select className="input">{projects.map((p) => <option key={p.id}>{p.name}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Epochs</label><input className="input" type="number" defaultValue={100} /></div>
            <div><label className="label">Batch size</label><input className="input" type="number" defaultValue={16} /></div>
            <div><label className="label">Learning rate</label><input className="input" defaultValue="0.001" /></div>
            <div><label className="label">Image size</label><input className="input" type="number" defaultValue={640} /></div>
          </div>
          <div><label className="label">Train / val split</label><input type="range" className="w-full accent-brand-500" defaultValue={80} /></div>
          <div><label className="label">GPU</label><select className="input"><option>NVIDIA A100 (1x)</option><option>NVIDIA T4 (1x)</option></select></div>
          <button className="btn-primary w-full justify-center"><Play className="h-4 w-4" />Start training</button>
        </form>

        <div className="space-y-5 lg:col-span-2">
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-panel-3 text-left text-muted"><tr><th className="px-4 py-2">Run</th><th>Model</th><th>Dataset</th><th>Status</th><th className="w-40">Progress</th><th>Started</th></tr></thead>
              <tbody>
                {trainingRuns.map((r) => (
                  <tr key={r.id} onClick={() => setSelected(r.id)} className={`cursor-pointer border-t ${r.id === selected ? 'bg-brand-50' : 'hover:bg-panel-3'}`}>
                    <td className="px-4 py-2.5 font-medium">{r.id}</td><td>{r.model}</td><td>{r.dataset}</td><td><Badge>{r.status}</Badge></td>
                    <td className="pr-4"><Progress value={r.epoch / r.epochs} /><span className="text-xs text-muted">{r.epoch}/{r.epochs} epochs</span></td>
                    <td className="text-muted">{r.started}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">{run.id} · {run.model}</h2>
              {run.status === 'running' && <button className="btn-ghost text-red-600"><Square className="h-4 w-4" />Stop</button>}
            </div>
            <div className="mb-4 grid grid-cols-3 gap-3">
              {[['Epoch', `${run.epoch}/${run.epochs}`], ['Loss', run.loss], ['mAP@50', run.map]].map(([k, v]) => (
                <div key={k} className="rounded-md bg-panel-3 p-3"><p className="text-xs text-muted">{k}</p><p className="text-xl font-semibold">{v}</p></div>
              ))}
            </div>
            <p className="mb-2 text-sm text-muted">Training loss</p>
            <svg viewBox="0 0 400 150" className="h-40 w-full">
              <polyline points={points} fill="none" stroke="#2f7cf6" strokeWidth="2" />
            </svg>
            <pre className="mt-4 h-32 overflow-auto rounded-md bg-page p-3 text-xs text-green-300">
{`[09:12:04] Loading dataset "${run.dataset}" ... 1350 images
[09:12:09] Split: 1080 train / 270 val
[09:14:51] Epoch ${run.epoch - 1}: loss=0.84 mAP50=0.57
[09:16:33] Epoch ${run.epoch}: loss=${run.loss} mAP50=${run.map}`}
            </pre>
          </div>
        </div>
      </div>
    </>
  );
}
