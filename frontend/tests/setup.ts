import { vi } from 'vitest';

// React 18/19 needs this flag before act() to avoid noisy warnings.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Nothing in a unit test should reach the network. Anything that tries gets a
// fast, deterministic failure instead of a socket timeout against localhost.
vi.stubGlobal(
  'fetch',
  vi.fn(async () => {
    throw new TypeError('network disabled in tests');
  }),
);
