import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { api, saveTokens } from '../lib/api';

const empty = { first_name: '', last_name: '', email: '', username: '', password: '', confirm_password: '' };

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const field = (k: keyof typeof empty) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api<{ tokens: { access: string; refresh: string } }>('/auth/register/', { method: 'POST', json: { ...form, accept_terms: accept } });
      saveTokens(res.tokens);
      navigate('/projects');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create an account">
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">First name</label><input className="input" required {...field('first_name')} /></div>
          <div><label className="label">Last name</label><input className="input" required {...field('last_name')} /></div>
        </div>
        <div><label className="label">Email</label><input type="email" className="input" required {...field('email')} /></div>
        <div><label className="label">Username</label><input className="input" required {...field('username')} /></div>
        <div><label className="label">Password</label><input type="password" className="input" required {...field('password')} /></div>
        <div><label className="label">Confirm password</label><input type="password" className="input" required {...field('confirm_password')} /></div>
        <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" required checked={accept} onChange={(e) => setAccept(e.target.checked)} /> I accept the terms of use</label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full justify-center py-2" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">Already have an account? <Link to="/auth/login" className="font-medium text-brand-600">Sign in</Link></p>
    </AuthShell>
  );
}
