const ADJECTIVES = [
  'Neon',
  'Turbo',
  'Pixel',
  'Cosmic',
  'Quantum',
  'Retro',
  'Hyper',
  'Lunar',
  'Vector',
  'Chrome',
  'Solar',
  'Astro',
  'Nitro',
  'Ultra',
  'Glitch',
  'Cyber',
  'Prism',
  'Volt',
  'Rogue',
  'Zen',
];

const NOUNS = [
  'Falcon',
  'Comet',
  'Bishop',
  'Panther',
  'Wizard',
  'Raptor',
  'Nomad',
  'Phoenix',
  'Otter',
  'Samurai',
  'Drifter',
  'Sparrow',
  'Titan',
  'Koala',
  'Ronin',
  'Vandal',
  'Meerkat',
  'Warden',
  'Badger',
  'Specter',
];

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T;

export function randomNickname(): string {
  return `${pick(ADJECTIVES)}${pick(NOUNS)}${Math.floor(Math.random() * 90 + 10)}`;
}

export const NICKNAME_PATTERN = /^[A-Za-z0-9_.-]{3,18}$/;

export function sanitizeNickname(input: string): string {
  return input.trim().replace(/\s+/g, '_').slice(0, 18);
}
