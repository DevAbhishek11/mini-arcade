import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

interface State {
  error: Error | null;
}

/** Keeps a render crash in one game from taking down the whole cabinet. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[mini-arcade] render error', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-24 max-w-md surface p-8 text-center">
        <h2 className="text-xl font-bold">Something glitched</h2>
        <p className="mt-2 text-sm text-slate-400">{this.state.error.message}</p>
        <Button className="mt-6" onClick={() => window.location.reload()}>
          Reload the cabinet
        </Button>
      </div>
    );
  }
}
