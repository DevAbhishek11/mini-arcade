import type { ReactNode } from 'react';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { Footer } from './Footer';
import { Header } from './Header';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div aria-hidden className="pointer-events-none fixed inset-0 grid-backdrop" />
      <Header />
      <OfflineBanner />
      <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      <Footer />
    </div>
  );
}
