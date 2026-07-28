import { rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const transientWindowsErrors = new Set(['EACCES', 'EBUSY', 'EPERM']);

/**
 * Antivirus and dev-server watchers can hold a Windows file for a few
 * milliseconds. Retrying preserves atomic replacement without deleting the
 * destination or exposing a partially written file.
 */
export async function replaceFile(
  temporaryPath: string,
  destinationPath: string,
  attempts = 8,
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await rename(temporaryPath, destinationPath);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!transientWindowsErrors.has(code ?? '') || attempt === attempts) {
        throw error;
      }
      await delay(attempt * 40);
    }
  }
}
