import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud } from 'lucide-react';
import { projects } from '../data/mock';

export default function CreateTask() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('My computer');
  const [files, setFiles] = useState<string[]>([]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-5 text-2xl font-semibold">Create a new task</h1>
      <form className="card space-y-5 p-6" onSubmit={(e) => { e.preventDefault(); navigate('/tasks'); }}>
        <div><label className="label">Name</label><input className="input" required /></div>
        <div><label className="label">Project</label><select className="input">{projects.map((p) => <option key={p.id}>{p.name}</option>)}</select></div>
        <div><label className="label">Labels</label><input className="input" placeholder="Inherited from project, or add: car, person" /></div>
        <div>
          <label className="label">Select files</label>
          <div className="mb-2 flex gap-1 border-b">
            {['My computer', 'Connected file share', 'Remote sources', 'Cloud Storage'].map((x) => (
              <button type="button" key={x} onClick={() => setTab(x)} className={`px-3 py-2 text-sm ${tab === x ? 'border-b-2 border-brand-500 text-brand-600' : 'text-muted'}`}>{x}</button>
            ))}
          </div>
          {tab === 'My computer' ? (
            <label className="flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-line py-10 text-muted hover:border-brand-500">
              <UploadCloud className="mb-2 h-10 w-10 text-brand-500" />
              Click or drag files to this area
              <span className="text-xs">Images, videos, archives, PDF</span>
              <input type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []).map((f) => f.name))} />
            </label>
          ) : (
            <input className="input" placeholder={tab === 'Remote sources' ? 'https://...' : 'Choose a path or bucket'} />
          )}
          {files.length > 0 && <p className="mt-2 text-sm text-muted">{files.length} file(s) selected</p>}
        </div>
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">Advanced configuration</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div><label className="label">Image quality (%)</label><input className="input" type="number" defaultValue={70} /></div>
            <div><label className="label">Segment size</label><input className="input" type="number" placeholder="Frames per job" /></div>
            <div><label className="label">Start frame</label><input className="input" type="number" /></div>
            <div><label className="label">Frame step</label><input className="input" type="number" /></div>
          </div>
        </details>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => navigate(-1)}>Cancel</button><button className="btn-primary">Submit &amp; Open</button></div>
      </form>
    </div>
  );
}
