import * as argon2 from "argon2";

// OWASP minimum for Argon2id: 19 MiB memory, 2 iterations, 1 thread.
// Kept at the minimum because Render's free plan has little memory.
const options = {
  type: argon2.argon2id,
  memoryCost: 19456, // in KiB = 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, options);
}

export function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  return argon2.verify(hash, password);
}
