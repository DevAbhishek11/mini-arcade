import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="grid place-items-center py-24 text-center">
      <p className="font-display text-7xl font-bold text-neon-violet neon-text">404</p>
      <h1 className="mt-4 text-2xl font-bold">This cabinet is out of order</h1>
      <p className="mt-2 text-sm text-slate-400">The page you are after does not exist.</p>
      <Link to="/" className="mt-6">
        <Button>Back to the arcade</Button>
      </Link>
    </div>
  );
}
