import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { PageHeader } from '../components/ui';
import { labels, models, tasks, testRuns } from '../data/mock';

const perClass = [0.82, 0.74, 0.61, 0.66];

export default function Testing() {
  const [selected, setSelected] = useState(testRuns[0].id);
  const run = testRuns.find((r) => r.id === selected)!;

  return (
    <>
      <PageHeader title="Test" icon={FlaskConical} />
      <div className="grid gap-5 lg:grid-cols-3">
        <form className="card space-y-4 p-5" onSubmit={(e) => e.preventDefault()}>
          <h2 className="font-semibold">Evaluate a model</h2>
          <div><label className="label">Model</label><select className="input">{models.filter((m) => m.map).map((m) => <option key={m.id}>{m.name} {m.version}</option>)}</select></div>
          <div><label className="label">Test set (task)</label><select className="input">{tasks.map((t) => <option key={t.id}>{t.name}</option>)}</select></div>
          <div><label className="label">Confidence threshold</label><input className="input" defaultValue="0.25" /></div>
          <div><label className="label">IoU threshold</label><input className="input" defaultValue="0.5" /></div>
          <button className="btn-primary w-full justify-center">Run evaluation</button>
        </form>

        <div className="space-y-5 lg:col-span-2">
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-panel-3 text-left text-muted"><tr><th className="px-4 py-2">Eval</th><th>Model</th><th>Test set</th><th>Precision</th><th>Recall</th><th>mAP@50</th><th>Date</th></tr></thead>
              <tbody>
                {testRuns.map((r) => (
                  <tr key={r.id} onClick={() => setSelected(r.id)} className={`cursor-pointer border-t ${r.id === selected ? 'bg-brand-50' : 'hover:bg-panel-3'}`}>
                    <td className="px-4 py-2.5 font-medium">{r.id}</td><td>{r.model}</td><td>{r.dataset}</td><td>{r.precision}</td><td>{r.recall}</td><td className="font-semibold">{r.map}</td><td className="text-muted">{r.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 font-semibold">{run.id} · {run.model}</h2>
            <div className="mb-6 grid grid-cols-4 gap-3">
              {[['Precision', run.precision], ['Recall', run.recall], ['F1', run.f1], ['mAP@50', run.map]].map(([k, v]) => (
                <div key={k} className="rounded-md bg-panel-3 p-3"><p className="text-xs text-muted">{k}</p><p className="text-xl font-semibold">{v}</p></div>
              ))}
            </div>
            <h3 className="mb-3 text-sm font-semibold text-muted">Per-class AP</h3>
            <div className="space-y-2">
              {labels.map((l, i) => (
                <div key={l.name} className="flex items-center gap-3 text-sm">
                  <span className="w-28">{l.name}</span>
                  <div className="h-3 flex-1 rounded bg-panel-3"><div className="h-full rounded" style={{ width: `${perClass[i] * 100}%`, background: l.color }} /></div>
                  <span className="w-10 text-right">{perClass[i]}</span>
                </div>
              ))}
            </div>
            <h3 className="mb-3 mt-6 text-sm font-semibold text-muted">Sample predictions</h3>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="relative">
                  <img src={`https://picsum.photos/seed/pred${n}/200/140`} className="rounded" />
                  <div className="absolute left-[20%] top-[25%] h-1/2 w-1/2 border-2 border-amber-400"><span className="absolute -top-4 left-0 bg-amber-400 px-1 text-[10px]">car 0.9</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
