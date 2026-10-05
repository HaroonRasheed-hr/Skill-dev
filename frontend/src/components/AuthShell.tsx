import type { ReactNode } from 'react';
import Logo from './Logo';

export default function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-panel-3 to-brand-700 p-10 text-white lg:flex">
        <Logo to="/auth/login" />
        <div>
          <h2 className="text-4xl font-bold leading-tight">Annotate, train and test<br />computer vision models.</h2>
          <p className="mt-4 max-w-md text-muted">Skillwala brings data labeling, model training and evaluation together in one workspace.</p>
        </div>
        <p className="text-sm text-muted">© 2026 Skillwala</p>
      </div>
      <div className="flex items-center justify-center bg-panel-2 p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo to="/auth/login" /></div>
          <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}
