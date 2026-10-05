import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';

export default function Login() {
  const navigate = useNavigate();
  return (
    <AuthShell title="Sign in">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); navigate('/projects'); }}>
        <div><label className="label">Email or username</label><input className="input" required /></div>
        <div>
          <div className="flex justify-between"><label className="label">Password</label><a className="text-sm text-brand-600" href="#">Forgot password?</a></div>
          <input type="password" className="input" required />
        </div>
        <button className="btn-primary w-full justify-center py-2">Sign in</button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">New to Skillwala? <Link to="/auth/register" className="font-medium text-brand-600">Create an account</Link></p>
    </AuthShell>
  );
}
