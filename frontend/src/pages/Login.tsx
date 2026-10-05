import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { api, saveTokens } from '../lib/api';

export default function Login() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api<{ tokens: { access: string; refresh: string } }>('/auth/login/', { method: 'POST', json: { identifier, password } });
      saveTokens(res.tokens);
      navigate('/projects');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Sign in">
      <form className="space-y-4" onSubmit={submit}>
        <div><label className="label">Email or username</label><input className="input" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} /></div>
        <div>
          <div className="flex justify-between"><label className="label">Password</label><a className="text-sm text-brand-600" href="#">Forgot password?</a></div>
          <input type="password" className="input" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full justify-center py-2" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">New to Skillwala? <Link to="/auth/register" className="font-medium text-brand-600">Create an account</Link></p>
    </AuthShell>
  );
}
