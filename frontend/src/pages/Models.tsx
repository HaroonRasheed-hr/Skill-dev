import { useEffect, useState } from 'react';
import { Box, ChevronRight, Download, Plus, RotateCcw, Workflow } from 'lucide-react';
import { Badge, Modal, PageHeader, Section } from '../components/ui';
import type { models as mockModels } from '../data/mock';
import { usePersistentState } from '../lib/persist';
import { useNavigate, useParams } from 'react-router-dom';
import { api, downloadFile, type ApiTrainingJob } from '../lib/api';

type Model = (typeof mockModels)[number] & { jobId?: number; hasCheckpoint?: boolean; baseName?: string | null };

const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

/** A training job shown as a model row, under the name the user gave it. */
function jobToModel(j: ApiTrainingJob): Model {
  const map = j.metrics?.bbox_mAP ?? j.metrics?.segm_mAP;
  return {
    id: `job-${j.id}`, name: j.name, type: 'detector', framework: j.architecture_label || 'PyTorch', version: 'v1',
    labels: j.class_names ?? [], status: j.status === 'completed' ? 'trained' : j.status,
    map: map != null ? Number(map.toFixed(2)) : null, updated: fmtDate(j.finished_at ?? j.created_at),
    jobId: j.id, hasCheckpoint: j.has_checkpoint, baseName: j.base_job_name,
  } as Model;
}

export default function Models() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [models, setModels] = usePersistentState<Model[]>(`models:${id}`, []);
  const [trained, setTrained] = useState<Model[]>([]);
  const [form, setForm] = usePersistentState(`models:${id}:form`, { name: '', type: 'detector', framework: 'PyTorch' });

  useEffect(() => {
    if (!id) return;
    api<ApiTrainingJob[]>(`/projects/${id}/training/jobs/`)
      .then((jobs) => setTrained(jobs.filter((j) => j.status !== 'cancelled').map(jobToModel)))
      .catch(() => {});
  }, [id]);

  const all = [...trained, ...models];

  const download = (m: Model) => {
    downloadFile(`/projects/${id}/training/jobs/${m.jobId}/checkpoint/`, `${m.name}.pth`)
      .catch((e) => alert(e instanceof Error ? e.message : 'Download failed'));
  };

  const submit = () => {
    if (!form.name.trim()) return;
    const updated = fmtDate(new Date());
    setModels((ms) => [...ms, { id: `${form.name}-${Date.now()}`, name: form.name.trim(), type: form.type, framework: form.framework, version: 'v1', labels: [], status: 'trained', map: null, updated }]);
    setForm({ name: '', type: 'detector', framework: 'PyTorch' });
    setAdding(false);
  };

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
        {all.length === 0 ? (
          <p className="text-sm text-muted">No logs or model yet</p>
        ) : (
        <div className="divide-y divide-line">
          {all.map((m) => (
            <div key={m.id} className="flex items-center gap-4 py-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-500"><Box className="h-5 w-5" /></span>
              <div className="flex-1">
                <h3 className="font-semibold">{m.name}</h3>
                <p className="text-xs text-muted">{m.framework} · {m.version} · <span className="capitalize">{m.type}</span> · updated {m.updated}{m.baseName && <> · retrained from {m.baseName}</>}</p>
              </div>
              <div className="hidden gap-1 lg:flex">{m.labels.map((l) => <span key={l} className="rounded bg-panel-3 px-2 py-0.5 text-xs">{l}</span>)}</div>
              <span className="w-20 text-right text-sm">{m.map ? `mAP ${m.map}` : '-'}</span>
              <Badge>{m.status}</Badge>
              {m.hasCheckpoint && (
                <button className="btn-ghost flex items-center gap-1" onClick={() => download(m)} title="Download model weights"><Download className="h-4 w-4" />Download</button>
              )}
              {m.jobId && m.status === 'trained' && m.hasCheckpoint && (
                <button className="btn-ghost flex items-center gap-1" onClick={() => navigate(`/projects/${id}/train?retrain=${m.jobId}`)} title="Train this model again on the current annotations"><RotateCcw className="h-4 w-4" />Retrain</button>
              )}
              <button className="btn-ghost">{m.status === 'deployed' ? 'Run' : 'Deploy'}</button>
            </div>
          ))}
        </div>
        )}
      </Section>
      {adding && (
        <Modal title="Upload a model" onClose={() => setAdding(false)}>
          <div className="space-y-4">
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Type</label><select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>detector</option><option>interactor</option><option>tracker</option><option>reid</option></select></div>
              <div><label className="label">Framework</label><select className="input" value={form.framework} onChange={(e) => setForm({ ...form, framework: e.target.value })}><option>PyTorch</option><option>TensorFlow</option><option>ONNX</option></select></div>
            </div>
            <div><label className="label">Weights file</label><input type="file" className="input" /></div>
            <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary" onClick={submit}>Upload</button></div>
          </div>
        </Modal>
      )}
    </>
  );
}
