import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';

export default function Register() {
  const navigate = useNavigate();
  return (
    <AuthShell title="Create an account">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); navigate('/projects'); }}>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">First name</label><input className="input" required /></div>
          <div><label className="label">Last name</label><input className="input" required /></div>
        </div>
        <div><label className="label">Email</label><input type="email" className="input" required /></div>
        <div><label className="label">Username</label><input className="input" required /></div>
        <div><label className="label">Password</label><input type="password" className="input" required /></div>
        <div><label className="label">Confirm password</label><input type="password" className="input" required /></div>
        <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" required /> I accept the terms of use</label>
        <button className="btn-primary w-full justify-center py-2">Create account</button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">Already have an account? <Link to="/auth/login" className="font-medium text-brand-600">Sign in</Link></p>
    </AuthShell>
  );
}
