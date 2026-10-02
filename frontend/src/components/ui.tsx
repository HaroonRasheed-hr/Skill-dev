import { Search, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageHeader({ title, icon: Icon, actions, search, onSearch }: { title: string; icon?: LucideIcon; actions?: ReactNode; search?: string; onSearch?: (v: string) => void }) {
  return (
    <div className="mb-8 flex flex-wrap items-center gap-4">
      {Icon && <Icon className="h-6 w-6 text-brand-500" />}
      <h1 className="text-3xl font-semibold">{title}</h1>
      {onSearch && (
        <div className="relative ml-4 w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
          <input className="input pl-8" placeholder="Search ..." value={search} onChange={(e) => onSearch(e.target.value)} />
        </div>
      )}
      <div className="ml-auto flex gap-2">{actions}</div>
    </div>
  );
}

export function Section({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-7 ${className}`}>
      <div className="flex items-center justify-between border-b border-line pb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      <div className="pt-5">{children}</div>
    </section>
  );
}

const tones: Record<string, string> = {
  annotation: 'bg-blue-500/15 text-blue-300',
  validation: 'bg-amber-500/15 text-amber-300',
  acceptance: 'bg-purple-500/15 text-purple-300',
  completed: 'bg-green-500/15 text-green-300',
  deployed: 'bg-green-500/15 text-green-300',
  trained: 'bg-blue-500/15 text-blue-300',
  running: 'bg-cyan-500/15 text-cyan-300',
  failed: 'bg-red-500/15 text-red-300',
  new: 'bg-slate-500/20 text-slate-300',
  'in progress': 'bg-cyan-500/15 text-cyan-300',
};

export function Badge({ children }: { children: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${tones[children] ?? 'bg-slate-500/20 text-slate-300'}`}>{children}</span>;
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-3">
      <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="card py-16 text-center text-muted">{text}</div>;
}
