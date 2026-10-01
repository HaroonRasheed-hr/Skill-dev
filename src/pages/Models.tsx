import { useState } from 'react';
import { Box, ChevronRight, Plus, Workflow } from 'lucide-react';
import { Badge, Modal, PageHeader, Section } from '../components/ui';
import { models } from '../data/mock';

export default function Models() {
  const [adding, setAdding] = useState(false);

  const upload = (
    <div className="flex overflow-hidden rounded-xl bg-brand-500 text-[#04121c]">
      <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-3 font-semibold hover:bg-brand-600">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#04121c]/80 text-brand-500"><Plus className="h-4 w-4" /></span>Upload
      </button>
      <button className="border-l border-[#04121c]/20 px-3 hover:bg-brand-600"><ChevronRight className="h-4 w-4" /></button>
    </div>
  );

  return (
    <>
      <PageHeader title="Models" icon={Workflow} />
      <Section title="Model List" action={upload}>
        <div className="divide-y divide-line">
          {models.map((m) => (
            <div key={m.id} className="flex items-center gap-4 py-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-500"><Box className="h-5 w-5" /></span>
              <div className="flex-1">
                <h3 className="font-semibold">{m.name}</h3>
                <p className="text-xs text-muted">{m.framework} · {m.version} · <span className="capitalize">{m.type}</span> · updated {m.updated}</p>
              </div>
              <div className="hidden gap-1 lg:flex">{m.labels.map((l) => <span key={l} className="rounded bg-panel-3 px-2 py-0.5 text-xs">{l}</span>)}</div>
              <span className="w-20 text-right text-sm">{m.map ? `mAP ${m.map}` : '-'}</span>
              <Badge>{m.status}</Badge>
              <button className="btn-ghost">{m.status === 'deployed' ? 'Run' : 'Deploy'}</button>
            </div>
          ))}
        </div>
      </Section>
      {adding && (
        <Modal title="Upload a model" onClose={() => setAdding(false)}>
          <div className="space-y-4">
            <div><label className="label">Name</label><input className="input" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Type</label><select className="input"><option>detector</option><option>interactor</option><option>tracker</option><option>reid</option></select></div>
              <div><label className="label">Framework</label><select className="input"><option>PyTorch</option><option>TensorFlow</option><option>ONNX</option></select></div>
            </div>
            <div><label className="label">Weights file</label><input type="file" className="input" /></div>
            <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary" onClick={() => setAdding(false)}>Upload</button></div>
          </div>
        </Modal>
      )}
    </>
  );
}
