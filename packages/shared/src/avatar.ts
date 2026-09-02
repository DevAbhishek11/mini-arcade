const PALETTE = ['aurora', 'ember', 'lagoon', 'nebula', 'citrus', 'orchid', 'glacier', 'sunset'] as const;

export type AvatarKey = (typeof PALETTE)[number];

/** Deterministic avatar key derived from a player id, so it is stable everywhere. */
export function avatarFor(seed: string): AvatarKey {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length] as AvatarKey;
}

export const AVATAR_KEYS = PALETTE;
