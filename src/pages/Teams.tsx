import { Plus, Users } from 'lucide-react';
import { PageHeader, Section } from '../components/ui';

const members = [
  { name: 'Haroon', email: 'haroon@skillwala.com', role: 'Owner' },
  { name: 'Ayesha', email: 'ayesha@skillwala.com', role: 'Maintainer' },
  { name: 'Ali', email: 'ali@skillwala.com', role: 'Annotator' },
  { name: 'Sara', email: 'sara@skillwala.com', role: 'Reviewer' },
  { name: 'Bilal', email: 'bilal@skillwala.com', role: 'Annotator' },
];

export default function Teams() {
  return (
    <>
      <PageHeader title="Teams" icon={Users} />
      <Section title="Members" action={<button className="btn-primary"><Plus className="h-4 w-4" />Invite member</button>}>
        <div className="divide-y divide-line">
          {members.map((m) => (
            <div key={m.email} className="flex items-center gap-4 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-indigo-500 text-sm font-bold text-white">{m.name[0]}</span>
              <div className="flex-1"><p className="font-medium">{m.name}</p><p className="text-xs text-muted">{m.email}</p></div>
              <select className="input w-40" defaultValue={m.role}><option>Owner</option><option>Maintainer</option><option>Reviewer</option><option>Annotator</option></select>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
