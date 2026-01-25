import { createHash } from 'crypto';

/**
 * Compute SHA-256 hash of a buffer
 */
export function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Compute SHA-256 hash of a string
 */
export function hashString(str: string): string {
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

/**
 * Generate a deterministic job ID from platform and poster hash
 */
export function generateJobId(platform: string, posterHash: string): string {
  const input = `${platform}:${posterHash}`;
  return hashString(input).substring(0, 32); // Use first 32 chars as ID
}

