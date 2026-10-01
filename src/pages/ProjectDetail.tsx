import { Link, useParams } from 'react-router-dom';
import { LayoutDashboard, Plus } from 'lucide-react';
import TaskRow from '../components/TaskRow';
import { Empty, PageHeader, Section } from '../components/ui';
import { jobs, projects, tasks } from '../data/mock';

export function useProject() {
  const { id } = useParams();
  return projects.find((x) => x.id === Number(id));
}

export default function ProjectDetail() {
  const p = useProject();
  if (!p) return <Empty text="Project not found" />;
  const pt = tasks.filter((t) => t.projectId === p.id);
  const pj = jobs.filter((j) => pt.some((t) => t.id === j.taskId));
  const stats = [
    ['Tasks', pt.length],
    ['Jobs', pj.length],
    ['Frames', pt.reduce((n, t) => n + t.frames, 0)],
    ['Labels', p.labels.length],
  ];

  return (
    <>
      <PageHeader title={p.name} icon={LayoutDashboard} actions={<button className="btn-ghost">Actions</button>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="card p-5"><p className="text-sm text-muted">{k}</p><p className="mt-1 text-3xl font-semibold">{v}</p></div>
        ))}
      </div>
      <Section title="Tasks" action={<Link to="/tasks/create" className="btn-primary"><Plus className="h-4 w-4" />Create task</Link>}>
        <div className="space-y-3">{pt.length ? pt.map((t) => <TaskRow key={t.id} t={t} />) : <p className="text-muted">No tasks yet</p>}</div>
      </Section>
    </>
  );
}
