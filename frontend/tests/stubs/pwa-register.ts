/** Stand-in for `virtual:pwa-register/react`, which only exists under Vite. */
export function useRegisterSW() {
  return {
    needRefresh: [false, () => undefined] as [boolean, (value: boolean) => void],
    offlineReady: [false, () => undefined] as [boolean, (value: boolean) => void],
    updateServiceWorker: async () => undefined,
  };
}
