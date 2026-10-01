import { Link } from 'react-router-dom';

export default function Logo() {
  return (
    <Link to="/projects" className="flex items-center justify-center text-4xl font-semibold tracking-tight text-ink">
      <span className="bg-gradient-to-br from-brand-500 to-indigo-500 bg-clip-text text-transparent">s</span>killwala
    </Link>
  );
}
