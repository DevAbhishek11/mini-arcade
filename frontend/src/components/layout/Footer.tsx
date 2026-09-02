export function Footer() {
  return (
    <footer className="mt-20 border-t border-white/5 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-xs text-slate-500 sm:flex-row sm:px-6">
        <p>
          Mini Arcade — server authoritative games, Elo ladders, clustered Node.js. Built with TypeScript end to
          end.
        </p>
        <div className="flex items-center gap-4">
          <a
            className="transition-colors hover:text-slate-300"
            href="/api/system"
            target="_blank"
            rel="noreferrer"
          >
            health
          </a>
          <a
            className="transition-colors hover:text-slate-300"
            href="/metrics"
            target="_blank"
            rel="noreferrer"
          >
            metrics
          </a>
        </div>
      </div>
    </footer>
  );
}
