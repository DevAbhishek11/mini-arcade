import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/** promisify() drops the options overload, so wrap it explicitly. */
const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derived) =>
      error ? reject(error) : resolve(derived),
    );
  });

/**
 * Password hashing with scrypt from Node's own crypto module — memory hard,
 * no native dependency to build, and the parameters travel with the hash so
 * they can be raised later without invalidating existing accounts.
 */
const FORMAT = 'scrypt';
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/** ~100ms on a modern core; raise `N` as hardware improves. */
const PARAMS = { N: 16_384, r: 8, p: 1 } as const;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: 64 * 1024 * 1024,
  });

  return [FORMAT, PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), derived.toString('base64')].join('$');
}

/**
 * Constant-time verification. Returns false for malformed hashes rather than
 * throwing, so a corrupted row can never crash a login request.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== FORMAT) return false;

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts as [string, string, string, string, string, string];
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(rawHash, 'base64');
    const derived = await scrypt(password.normalize('NFKC'), Buffer.from(rawSalt, 'base64'), expected.length, {
      N,
      r,
      p,
      maxmem: 64 * 1024 * 1024,
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Normalised form used for unique lookups, so casing never splits accounts. */
export const emailKey = (email: string): string => email.trim().toLowerCase();

export function describePasswordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  if (password.length > PASSWORD_MAX_LENGTH) return 'Password is too long';
  if (!/[a-zA-Z]/.test(password)) return 'Password must contain at least one letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return null;
}
