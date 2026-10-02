import { Link, useParams } from 'react-router-dom';
import { Badge, Empty } from '../components/ui';
import { jobs, projects, tasks } from '../data/mock';

export default function TaskDetail() {
  const { id } = useParams();
  const t = tasks.find((x) => x.id === Number(id));
  if (!t) return <Empty text="Task not found" />;
  const project = projects.find((p) => p.id === t.projectId)!;
  const tj = jobs.filter((j) => j.taskId === t.id);

  return (
    <>
      <Link to={`/projects/${project.id}/overview`} className="text-sm text-brand-600">← {project.name}</Link>
      <div className="card mt-3 flex gap-6 p-5">
        <img src={t.thumb} className="h-36 w-56 rounded-md object-cover" />
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <h1 className="text-2xl font-semibold">{t.name}</h1>
            <button className="btn-ghost">Actions</button>
          </div>
          <p className="mt-1 text-sm text-muted">Task #{t.id} created by {t.owner} on {t.created}</p>
          <dl className="mt-4 grid grid-cols-4 gap-4 text-sm">
            <div><dt className="text-muted">Status</dt><dd className="mt-1"><Badge>{t.status}</Badge></dd></div>
            <div><dt className="text-muted">Frames</dt><dd className="mt-1 font-medium">{t.frames}</dd></div>
            <div><dt className="text-muted">Mode</dt><dd className="mt-1 font-medium capitalize">{t.mode}</dd></div>
            <div><dt className="text-muted">Assignee</dt><dd className="mt-1"><select className="input py-1" defaultValue={t.assignee}><option value="">Unassigned</option><option>ali</option><option>sara</option><option>bilal</option></select></dd></div>
          </dl>
        </div>
      </div>
      <div className="card mt-5 p-5">
        <h2 className="mb-3 font-semibold">Labels</h2>
        <div className="flex flex-wrap gap-2">
          {project.labels.map((l) => <span key={l.name} className="rounded-md border px-2 py-1 text-sm" style={{ borderColor: l.color, color: l.color }}>{l.name}</span>)}
        </div>
      </div>
      <div className="card mt-5 overflow-hidden">
        <div className="flex items-center justify-between p-4"><h2 className="font-semibold">Jobs</h2><span className="text-sm text-muted">{tj.length} jobs</span></div>
        <JobsTable rows={tj} />
      </div>
    </>
  );
}

export function JobsTable({ rows }: { rows: typeof jobs }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-panel-3 text-left text-muted">
        <tr><th className="px-4 py-2">Job</th><th>Task</th><th>Frames</th><th>Stage</th><th>State</th><th>Assignee</th><th>Updated</th><th></th></tr>
      </thead>
      <tbody>
        {rows.map((j) => (
          <tr key={j.id} className="border-t border-line">
            <td className="px-4 py-2.5 font-medium text-brand-600"><Link to={`/tasks/${j.taskId}/jobs/${j.id}`}>Job #{j.id}</Link></td>
            <td>#{j.taskId}</td>
            <td>{j.frames}</td>
            <td><Badge>{j.stage}</Badge></td>
            <td><Badge>{j.state}</Badge></td>
            <td>{j.assignee || <span className="text-muted">-</span>}</td>
            <td className="text-muted">{j.updated}</td>
            <td className="pr-4 text-right"><Link to={`/tasks/${j.taskId}/jobs/${j.id}`} className="btn-ghost py-1">Open</Link></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
