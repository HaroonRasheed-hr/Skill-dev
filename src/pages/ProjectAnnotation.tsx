import { Link } from 'react-router-dom';
import { PenTool, Plus } from 'lucide-react';
import { Empty, PageHeader, Section } from '../components/ui';
import { jobs, tasks } from '../data/mock';
import { useProject } from './ProjectDetail';
import { JobsTable } from './TaskDetail';

export default function ProjectAnnotation() {
  const p = useProject();
  if (!p) return <Empty text="Project not found" />;
  const ids = tasks.filter((t) => t.projectId === p.id).map((t) => t.id);
  const rows = jobs.filter((j) => ids.includes(j.taskId));

  return (
    <>
      <PageHeader title="Annotation" icon={PenTool} />
      <Section title="Job List" action={<Link to="/tasks/create" className="btn-primary"><Plus className="h-4 w-4" />Create task</Link>}>
        {rows.length ? <div className="-mx-7 -mb-7"><JobsTable rows={rows} /></div> : <p className="text-muted">No jobs yet. Create a task to start annotating.</p>}
      </Section>
    </>
  );
}
