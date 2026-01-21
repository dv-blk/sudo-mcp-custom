import { CommandQueue, QueuedCommand } from '../queue/command-queue';
import { Blocklist } from '../security/blocklist';
import { openBrowserOnce } from '../utils/browser-opener';
import { logDebug } from '../utils/logger';

/**
 * Sleep utility for polling
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format command result for MCP response
 */
function formatResult(cmd: QueuedCommand): string {
  const { result } = cmd;
  
  if (!result) {
    return `Command: ${cmd.command}\nStatus: ${cmd.status}`;
  }

  let output = `Command: ${cmd.command}\n`;
  output += `Exit Code: ${result.exitCode}\n`;
  output += `Duration: ${result.duration}ms\n`;
  
  if (result.timedOut) {
    output += `Status: TIMED OUT\n`;
  }

  if (result.stdout) {
    output += `\n=== STDOUT ===\n${result.stdout}`;
  }

  if (result.stderr) {
    output += `\n\n=== STDERR ===\n${result.stderr}`;
  }

  return output.trim();
}

/**
 * Handle sudo_exec tool call
 */
export async function handleSudoExec(
  command: string,
  queue: CommandQueue,
  blocklist: Blocklist,
  serverUrl: string,
  useBridge: boolean = false
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  
  // Validate against blocklist
  const validation = blocklist.validate(command);
  if (!validation.allowed) {
    return {
      content: [{
        type: 'text',
        text: `Command blocked: ${validation.reason}`
      }],
      isError: true
    };
  }

  // Add to queue
  const queuedCmd = queue.add(command);
  logDebug(`Command queued: ${queuedCmd.id}`);

  // Open browser on first command (lazy opening) - only if NOT using bridge
  if (!useBridge) {
    const allCommands = queue.getAll();
    if (allCommands.length === 1) {
      await openBrowserOnce(serverUrl);
    }
  }

  // Poll for completion
  while (true) {
    const cmd = queue.getById(queuedCmd.id);
    
    // Command was removed from queue (shouldn't happen, but handle it)
    if (!cmd) {
      return {
        content: [{
          type: 'text',
          text: 'Command was removed from queue unexpectedly'
        }],
        isError: true
      };
    }

    // Command completed successfully or failed
    if (cmd.status === 'completed' || cmd.status === 'failed') {
      const isError = cmd.status === 'failed' || !cmd.result?.success;
      return {
        content: [{
          type: 'text',
          text: formatResult(cmd)
        }],
        isError
      };
    }

    // Command was declined
    if (cmd.status === 'declined') {
      return {
        content: [{
          type: 'text',
          text: `Command declined by user: ${cmd.command}`
        }],
        isError: true
      };
    }

    // Still pending or executing, wait and check again
    await sleep(500);
  }
}

/**
 * Get the MCP tool definition
 */
export function getSudoExecToolDefinition() {
  return {
    name: 'sudo_exec',
    description: 'Execute a command with sudo privileges. Requires user approval via browser UI. The command output will be returned here after the user approves and the command completes.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute with sudo privileges'
        }
      },
      required: ['command']
    }
  };
}
