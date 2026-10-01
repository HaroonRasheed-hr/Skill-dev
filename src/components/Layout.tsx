import { NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, FileText, LogOut, Search, Settings, User, Users } from 'lucide-react';
import { useState } from 'react';
import Logo from './Logo';

const globalNav = [
  { name: 'Projects', to: '/projects', icon: FileText, end: true },
  { name: 'Notifications', to: '/notifications', icon: Bell },
  { name: 'Teams', to: '/teams', icon: Users },
];

const projectNav = [
  ['Overview', 'overview'],
  ['Label', 'label'],
  ['Annotation', 'annotation'],
  ['Train', 'train'],
  ['Model', 'model'],
  ['Test', 'test'],
];

const item = (active: boolean) =>
  `flex h-14 items-center rounded-xl px-6 text-[15px] font-semibold transition ${
    active ? 'bg-brand-500 text-[#04121c]' : 'bg-panel-2 text-muted hover:text-ink'
  }`;

export default function Layout() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const project = useMatch('/projects/:id/*');
  const isHome = useMatch('/projects') !== null;

  return (
    <div className="flex min-h-screen gap-6 p-5">
      <aside className="sticky top-5 flex h-[calc(100vh-2.5rem)] w-72 shrink-0 flex-col rounded-2xl border border-line bg-panel px-6 py-6">
        <div className="mb-10 mt-2"><Logo /></div>
        <nav className="space-y-3">
          {globalNav.map(({ name, to, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => item(isActive)}>
              <Icon className="h-5 w-5" />
              <span className="flex-1 text-center">{name}</span>
            </NavLink>
          ))}
        </nav>
        {project && (
          <>
            <hr className="mx-6 my-6 border-line" />
            <nav className="space-y-3 overflow-y-auto">
              {projectNav.map(([name, path]) => (
                <NavLink key={path} to={`/projects/${project.params.id}/${path}`} className={({ isActive }) => item(isActive)}>
                  {name}
                </NavLink>
              ))}
            </nav>
          </>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <header className="flex gap-6">
          {!isHome && (
            <button onClick={() => navigate(-1)} className="flex h-14 items-center gap-3 rounded-xl border border-line bg-panel-2 px-6 font-semibold">
              <ArrowLeft className="h-5 w-5" />Back
            </button>
          )}
          <div className="flex h-14 flex-1 items-center gap-3 rounded-xl border border-line bg-panel-2 px-5">
            <Search className="h-5 w-5 text-muted" />
            <input className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted" placeholder="Search projects, tasks..." />
            <div className="relative">
              <button onClick={() => setOpen(!open)} className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-indigo-500">
                <User className="h-5 w-5 text-white" />
              </button>
              {open && (
                <div className="card absolute right-0 z-30 mt-2 w-44 py-1 text-sm shadow-xl" onMouseLeave={() => setOpen(false)}>
                  <button className="flex w-full items-center gap-2 px-3 py-2 hover:bg-panel-3"><User className="h-4 w-4" />Profile</button>
                  <button className="flex w-full items-center gap-2 px-3 py-2 hover:bg-panel-3"><Settings className="h-4 w-4" />Settings</button>
                  <button onClick={() => navigate('/auth/login')} className="flex w-full items-center gap-2 px-3 py-2 text-red-400 hover:bg-panel-3"><LogOut className="h-4 w-4" />Logout</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 rounded-2xl border border-line bg-panel p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
