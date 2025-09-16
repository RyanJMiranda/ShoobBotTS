import crypto from 'crypto'; // For checksum calculation

/**
 * Calculates a simple MD5 checksum of a string.
 * This is placed here as a local utility for command data.
 * @param content The string content to hash.
 * @returns The MD5 hash string.
 */
export function calculateChecksum(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}