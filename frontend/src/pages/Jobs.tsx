import { useState } from 'react';
import { PageHeader } from '../components/ui';
import { jobs } from '../data/mock';
import { JobsTable } from './TaskDetail';
import { usePersistentState } from '../lib/persist';

export default function Jobs() {
  const [stage, setStage] = usePersistentState('jobs:stage', 'all');
  const rows = jobs.filter((j) => stage === 'all' || j.stage === stage);
  return (
    <>
      <PageHeader
        title="Jobs"
        actions={
          <select className="input w-44" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="all">All stages</option><option value="annotation">Annotation</option><option value="validation">Validation</option><option value="acceptance">Acceptance</option>
          </select>
        }
      />
      <div className="card overflow-hidden"><JobsTable rows={rows} /></div>
    </>
  );
}
