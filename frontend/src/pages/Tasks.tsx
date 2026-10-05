import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import TaskRow from '../components/TaskRow';
import { Empty, PageHeader } from '../components/ui';
import { tasks } from '../data/mock';
import { usePersistentState } from '../lib/persist';

export default function Tasks() {
  const [q, setQ] = usePersistentState('tasks:q', '');
  const [status, setStatus] = usePersistentState('tasks:status', 'all');
  const list = tasks.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()) && (status === 'all' || t.status === status));

  return (
    <>
      <PageHeader
        title="Tasks"
        search={q}
        onSearch={setQ}
        actions={
          <>
            <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option><option value="annotation">Annotation</option><option value="validation">Validation</option><option value="completed">Completed</option>
            </select>
            <Link to="/tasks/create" className="btn-primary whitespace-nowrap">Create task</Link>
          </>
        }
      />
      <div className="space-y-3">{list.length ? list.map((t) => <TaskRow key={t.id} t={t} />) : <Empty text="No tasks match your filters" />}</div>
    </>
  );
}
