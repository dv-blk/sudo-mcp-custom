import { CommandQueue } from '../queue/command-queue';
import { SessionManager } from '../auth/session-manager';
import { executeSudoCommand } from '../executor/sudo-executor';
import { logError } from '../utils/logger';

/**
 * Execute a queued command
 */
export async function executeQueuedCommand(
  id: string,
  queue: CommandQueue,
  sessionManager: SessionManager
): Promise<void> {
  const command = queue.getById(id);
  if (!command || command.status !== 'pending') {
    return;
  }

  try {
    // Update status to executing
    queue.updateStatus(id, 'executing');

    // Ensure sudo authentication
    await sessionManager.ensureAuthenticated();

    // Execute command
    const result = await executeSudoCommand(command.command);

    // Update with result
    const finalStatus = result.success ? 'completed' : 'failed';
    queue.updateStatus(id, finalStatus, result);

  } catch (error) {
    logError(`Command execution failed for ${id}`, error as Error);
    queue.updateStatus(id, 'failed', {
      success: false,
      exitCode: -1,
      stdout: '',
      stderr: (error as Error).message,
      timedOut: false,
      duration: 0
    });
  }
}
