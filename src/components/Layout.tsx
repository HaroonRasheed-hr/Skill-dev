import { NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { Bell, FileText, Search, Settings, User, Users } from 'lucide-react';
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
  `flex h-14 shrink-0 items-center rounded-xl px-6 text-[15px] font-semibold transition ${
    active ? 'bg-brand-500 text-[#04121c]' : 'bg-panel-2 text-muted hover:text-ink'
  }`;

export default function Layout() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const projectMatch = useMatch('/projects/:id/*');
  // Project tabs only apply inside an existing project, not on /projects/create
  const project = projectMatch && projectMatch.params.id !== 'create' ? projectMatch : null;
  const isHome = useMatch('/projects') !== null;
  // The annotation workspace fills the screen instead of scrolling like other pages
  const workspace = useMatch('/projects/:id/annotation') !== null;

  return (
    <div className={`flex gap-4 p-3 xl:gap-6 xl:p-5 ${workspace ? 'h-screen' : 'min-h-screen'}`}>
      <aside className="sticky top-3 flex h-[calc(100vh-1.5rem)] w-60 shrink-0 flex-col rounded-2xl border border-line bg-panel px-4 py-5 xl:top-5 xl:h-[calc(100vh-2.5rem)] xl:w-72 xl:px-6">
        <div className="mb-8 mt-1"><Logo /></div>
        <nav className="space-y-3">
          {globalNav.map(({ name, to, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => item(isActive)}>
              <Icon className="h-5 w-5 shrink-0" />
              <span className="ml-12">{name}</span>
            </NavLink>
          ))}
        </nav>
        {project && (
          <>
            <hr className="mx-6 my-5 border-line" />
            <nav className="no-scrollbar min-h-0 space-y-3 overflow-y-auto">
              {projectNav.map(([name, path]) => (
                <NavLink key={path} to={`/projects/${project.params.id}/${path}`} className={({ isActive }) => item(isActive)}>
                  {name}
                </NavLink>
              ))}
            </nav>
          </>
        )}
        <button className="mt-auto flex shrink-0 items-center justify-center gap-4 pt-5 text-[15px] font-semibold text-ink">
          <Settings className="h-5 w-5" />
          Settings
        </button>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 xl:gap-6">
        <header className="flex shrink-0 gap-4 xl:gap-6">
          {!isHome && (
            <button onClick={() => navigate(-1)} className="flex h-12 items-center gap-3 rounded-xl border border-line bg-panel-2 px-5 font-semibold xl:h-14">
              Back
            </button>
          )}
          <div className="flex h-12 flex-1 items-center gap-3 xl:h-14 rounded-xl border border-line bg-panel-2 px-5">
            <Search className="h-5 w-5 text-muted" />
            <input className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted" placeholder="Search projects, tasks..." />
            <div className="relative">
              <button onClick={() => setOpen(!open)} className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-indigo-500">
                <User className="h-5 w-5 text-white" />
              </button>
              {open && (
                <div className="card absolute right-0 z-30 mt-2 w-44 py-1 text-sm shadow-xl" onMouseLeave={() => setOpen(false)}>
                  <button className="flex w-full items-center gap-2 px-3 py-2 hover:bg-panel-3">Profile</button>
                  <button className="flex w-full items-center gap-2 px-3 py-2 hover:bg-panel-3">Settings</button>
                  <button onClick={() => navigate('/auth/login')} className="flex w-full items-center gap-2 px-3 py-2 text-red-400 hover:bg-panel-3">Logout</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className={`min-h-0 flex-1 rounded-2xl border border-line bg-panel ${workspace ? 'p-2 xl:p-3' : 'p-6 xl:p-10'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
