import { useState } from 'react';
import { Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { Empty, PageHeader, Section } from '../components/ui';
import { useProject } from './ProjectDetail';

export default function ProjectLabels() {
  const p = useProject();
  const [list, setList] = useState(p?.labels ?? []);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#00c2f0');
  if (!p) return <Empty text="Project not found" />;

  function add() {
    if (!name.trim()) return;
    setList([...list, { name: name.trim(), color }]);
    setName('');
  }

  return (
    <>
      <PageHeader title="Label" icon={Tag} />
      <Section title="Label List" className="mb-6">
        <div className="mb-5 flex gap-3">
          <input className="input" placeholder="Label name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border bg-panel-2" />
          <select className="input w-44"><option>Any shape</option><option>Rectangle</option><option>Polygon</option><option>Points</option><option>Skeleton</option></select>
          <button className="btn-primary whitespace-nowrap" onClick={add}><Plus className="h-4 w-4" />Add label</button>
        </div>
        <div className="divide-y divide-line">
          {list.map((l) => (
            <div key={l.name} className="flex items-center gap-4 py-3">
              <span className="h-5 w-5 rounded" style={{ background: l.color }} />
              <span className="flex-1 font-medium">{l.name}</span>
              <span className="text-sm text-muted">0 attributes</span>
              <button className="text-muted hover:text-brand-500"><Pencil className="h-4 w-4" /></button>
              <button className="text-muted hover:text-red-400" onClick={() => setList(list.filter((x) => x !== l))}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
