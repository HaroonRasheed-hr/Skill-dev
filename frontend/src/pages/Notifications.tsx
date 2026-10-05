import { Bell } from 'lucide-react';
import { PageHeader, Section } from '../components/ui';

const items = [
  { text: 'Training run run-42 reached epoch 37/100', time: '5 min ago', unread: true },
  { text: 'sara completed Job #1002 in Lahore downtown - batch 1', time: '5 hours ago', unread: true },
  { text: 'You were assigned to Job #1001', time: 'yesterday', unread: false },
  { text: 'Evaluation eval-17 finished: mAP@50 0.71', time: 'Sep 30', unread: false },
];

export default function Notifications() {
  return (
    <>
      <PageHeader title="Notifications" icon={Bell} />
      <Section title="All notifications" action={<button className="text-sm font-medium text-brand-500">Mark all as read</button>}>
        <div className="divide-y divide-line">
          {items.map((n) => (
            <div key={n.text} className="flex items-center gap-3 py-4">
              <span className={`h-2 w-2 rounded-full ${n.unread ? 'bg-brand-500' : 'bg-transparent'}`} />
              <p className={`flex-1 ${n.unread ? '' : 'text-muted'}`}>{n.text}</p>
              <span className="text-sm text-muted">{n.time}</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
