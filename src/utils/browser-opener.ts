import { spawn } from 'child_process';
import * as fs from 'fs';
import { log, logError } from './logger';

const STATE_FILE = '/tmp/.sudo-mcp-browser-opened';

/**
 * Open browser once (on first command request)
 * Always logs URL to stderr for visibility in OpenCode
 */
export async function openBrowserOnce(url: string): Promise<void> {
  // Always log URL to stderr
  log(`Approval UI available at: ${url}`);

  // Check if browser already opened
  if (fs.existsSync(STATE_FILE)) {
    return;
  }

  try {
    // Open browser using xdg-open
    const proc = spawn('xdg-open', [url], {
      stdio: 'ignore',
      detached: true
    });

    proc.unref();

    // Mark as opened
    fs.writeFileSync(STATE_FILE, url);
    log('Browser opened for approval UI');

  } catch (error) {
    logError('Failed to open browser', error as Error);
    log('Please manually open the URL above');
  }
}

/**
 * Clean up browser state file (called on shutdown)
 */
export function cleanupBrowserState(): void {
  if (fs.existsSync(STATE_FILE)) {
    try {
      fs.unlinkSync(STATE_FILE);
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}
