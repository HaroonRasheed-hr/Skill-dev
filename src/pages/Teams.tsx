import { useEffect, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { Modal, PageHeader } from '../components/ui';

type Role = 'Admin' | 'Maintainer' | 'Reviewer' | 'Annotator';
type Status = 'Active' | 'Invited' | 'Disabled';
type Org = { id: string; name: string; description: string; createdAt: string };
type Member = { id: string; name: string; email: string; orgId: string; role: Role; status: Status };

const ROLES: Role[] = ['Admin', 'Maintainer', 'Reviewer', 'Annotator'];
const STATUSES: Status[] = ['Active', 'Invited', 'Disabled'];
const CURRENT_USER = { name: 'Haroon', email: 'haroon@skillwala.com' };
const STORAGE_KEY = 'teams-state';

const statusTone: Record<Status, string> = {
  Active: 'bg-green-600 text-white',
  Invited: 'bg-amber-500/20 text-amber-300',
  Disabled: 'bg-slate-500/20 text-slate-300',
};

const uid = () => Math.random().toString(36).slice(2, 10);

function loadState(): { orgs: Org[]; members: Member[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { orgs: [], members: [] };
}

export default function Teams() {
  const [tab, setTab] = useState<'users' | 'org'>('users');
  const [{ orgs, members }, setState] = useState(loadState);
  const [orgId, setOrgId] = useState<string>(() => loadState().orgs[0]?.id ?? '');
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ orgs, members })); } catch { /* ignore */ }
  }, [orgs, members]);

  const org = orgs.find((o) => o.id === orgId);
  const orgMembers = members.filter((m) => m.orgId === orgId);
  const activeCount = orgMembers.filter((m) => m.status === 'Active').length;

  const createOrg = (name: string, description: string) => {
    const newOrg: Org = { id: uid(), name, description, createdAt: new Date().toISOString() };
    // The creator becomes the org's first admin.
    const owner: Member = { id: uid(), ...CURRENT_USER, orgId: newOrg.id, role: 'Admin', status: 'Active' };
    setState((s) => ({ orgs: [...s.orgs, newOrg], members: [...s.members, owner] }));
    setOrgId(newOrg.id);
    setShowCreateOrg(false);
    setTab('users');
  };

  const deleteOrg = (id: string) => {
    setState((s) => ({ orgs: s.orgs.filter((o) => o.id !== id), members: s.members.filter((m) => m.orgId !== id) }));
    if (id === orgId) setOrgId(orgs.find((o) => o.id !== id)?.id ?? '');
  };

  const inviteUsers = (emails: string[], role: Role) => {
    const existing = new Set(orgMembers.map((m) => m.email.toLowerCase()));
    const added = emails
      .filter((e) => !existing.has(e.toLowerCase()))
      .map<Member>((email) => ({ id: uid(), name: email.split('@')[0], email, orgId, role, status: 'Invited' }));
    setState((s) => ({ ...s, members: [...s.members, ...added] }));
    setShowInvite(false);
  };

  const saveMember = (m: Member) => {
    setState((s) => ({ ...s, members: s.members.map((x) => (x.id === m.id ? m : x)) }));
    setEditing(null);
  };

  const removeMember = (id: string) => {
    setState((s) => ({ ...s, members: s.members.filter((x) => x.id !== id) }));
    setEditing(null);
  };

  return (
    <>
      <PageHeader title="Teams" icon={Users} />

      <div className="flex gap-1">
        {([['users', 'Users'], ['org', 'Organization']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-t-lg border border-b-0 border-line px-8 py-3 text-sm transition ${tab === key ? 'bg-panel-2 font-medium text-ink' : 'text-muted hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-b-xl rounded-tr-xl bg-panel-2 p-7">
        {tab === 'users' ? (
          orgs.length === 0 ? (
            <NoOrg onCreate={() => setShowCreateOrg(true)} />
          ) : (
            <>
              <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-xl font-semibold">Users</h2>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative">
                    <select className="input appearance-none py-3 pr-10 font-semibold" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                      {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  </div>
                  <div className="rounded-lg border border-line px-4 py-3 text-sm text-muted">
                    Active users: <span className="font-semibold text-ink">{activeCount}</span>
                  </div>
                  <button className="btn-primary py-3" onClick={() => setShowInvite(true)}>
                    <Plus className="h-4 w-4" />Invite users<ChevronRight className="ml-2 h-4 w-4 border-l border-black/20 pl-1" />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-panel-3 text-left font-semibold">
                    <tr>
                      <th className="px-7 py-4">Name</th>
                      <th className="px-4 py-4 text-center">Organization</th>
                      <th className="px-4 py-4 text-center">Role</th>
                      <th className="px-4 py-4 text-center">Status</th>
                      <th className="px-4 py-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {orgMembers.map((m) => (
                      <tr key={m.id}>
                        <td className="px-7 py-5">
                          <p>{m.name}</p>
                          <p className="text-xs text-muted">{m.email}</p>
                        </td>
                        <td className="px-4 py-5 text-center">{org?.name}</td>
                        <td className="px-4 py-5 text-center">{m.role}</td>
                        <td className="px-4 py-5 text-center">
                          <span className={`inline-block min-w-24 rounded-full px-4 py-1 text-xs font-semibold ${statusTone[m.status]}`}>{m.status}</span>
                        </td>
                        <td className="px-4 py-5 text-center">
                          <button className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-brand-500 text-ink hover:bg-brand-500/10" onClick={() => setEditing(m)} aria-label={`Edit ${m.name}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        ) : (
          <>
            <div className="mb-8 flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Organization</h2>
              <button className="btn-primary py-3" onClick={() => setShowCreateOrg(true)}><Plus className="h-4 w-4" />Create organization</button>
            </div>
            {orgs.length === 0 ? (
              <NoOrg onCreate={() => setShowCreateOrg(true)} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {orgs.map((o) => (
                  <div key={o.id} className={`rounded-xl border p-5 ${o.id === orgId ? 'border-brand-500' : 'border-line'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-500"><Building2 className="h-5 w-5" /></span>
                        <div>
                          <p className="font-semibold">{o.name}</p>
                          <p className="text-xs text-muted">{members.filter((m) => m.orgId === o.id).length} members</p>
                        </div>
                      </div>
                      <button className="text-muted hover:text-red-400" onClick={() => deleteOrg(o.id)} aria-label={`Delete ${o.name}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                    {o.description && <p className="mt-3 text-sm text-muted">{o.description}</p>}
                    <button className="btn-ghost mt-4 w-full" onClick={() => { setOrgId(o.id); setTab('users'); }}>Manage users</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showCreateOrg && <CreateOrgModal onClose={() => setShowCreateOrg(false)} onCreate={createOrg} taken={orgs.map((o) => o.name.toLowerCase())} />}
      {showInvite && org && <InviteModal orgName={org.name} onClose={() => setShowInvite(false)} onInvite={inviteUsers} />}
      {editing && <EditMemberModal member={editing} onClose={() => setEditing(null)} onSave={saveMember} onRemove={removeMember} />}
    </>
  );
}

function NoOrg({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="py-14 text-center">
      <Building2 className="mx-auto mb-4 h-10 w-10 text-muted" />
      <p className="font-semibold">No organization yet</p>
      <p className="mb-6 mt-1 text-sm text-muted">Create an organization first, then invite users to it.</p>
      <button className="btn-primary" onClick={onCreate}><Plus className="h-4 w-4" />Create organization</button>
    </div>
  );
}

function CreateOrgModal({ onClose, onCreate, taken }: { onClose: () => void; onCreate: (name: string, description: string) => void; taken: string[] }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const trimmed = name.trim();
  const error = taken.includes(trimmed.toLowerCase()) ? 'An organization with this name already exists.' : '';

  return (
    <Modal title="Create organization" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (trimmed && !error) onCreate(trimmed, description.trim()); }}>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Name</span>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. xis" />
          {error && <span className="mt-1 block text-xs text-red-400">{error}</span>}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Description (optional)</span>
          <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!trimmed || !!error}>Create</button>
        </div>
      </form>
    </Modal>
  );
}

function InviteModal({ orgName, onClose, onInvite }: { orgName: string; onClose: () => void; onInvite: (emails: string[], role: Role) => void }) {
  const [raw, setRaw] = useState('');
  const [role, setRole] = useState<Role>('Annotator');
  const emails = raw.split(/[\s,;]+/).filter(Boolean);
  const invalid = emails.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  return (
    <Modal title={`Invite users to ${orgName}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (emails.length && !invalid.length) onInvite(emails, role); }}>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Emails (comma or newline separated)</span>
          <textarea className="input" rows={3} autoFocus value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="ali@example.com, sara@example.com" />
          {invalid.length > 0 && <span className="mt-1 block text-xs text-red-400">Invalid: {invalid.join(', ')}</span>}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Role</span>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!emails.length || invalid.length > 0}>Send invite{emails.length > 1 ? 's' : ''}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditMemberModal({ member, onClose, onSave, onRemove }: { member: Member; onClose: () => void; onSave: (m: Member) => void; onRemove: (id: string) => void }) {
  const [draft, setDraft] = useState(member);
  return (
    <Modal title={`Edit ${member.name}`} onClose={onClose}>
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Name</span>
          <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Role</span>
          <select className="input" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Status</span>
          <select className="input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <div className="flex justify-between gap-2">
          <button className="btn-ghost hover:!border-red-400 hover:!text-red-400" onClick={() => onRemove(member.id)}><Trash2 className="h-4 w-4" />Remove</button>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={!draft.name.trim()} onClick={() => onSave({ ...draft, name: draft.name.trim() })}>Save</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
