import { CommandQueue, QueuedCommand } from '../queue/command-queue';
import { Blocklist } from '../security/blocklist';
import { SessionManager } from '../auth/session-manager';
import { executeSudoCommand } from '../executor/sudo-executor';
import { log, logDebug } from '../utils/logger';

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
 * Handle sudo_exec - queue command and return immediately asking for approval
 */
export async function handleSudoExec(
  command: string,
  queue: CommandQueue,
  blocklist: Blocklist
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
  logDebug(`[${queuedCmd.id}] Command queued: ${command}`);

  // Return immediately with approval request
  return {
    content: [{
      type: 'text',
      text: `Sudo command queued: "${command}"\n\nCommand ID: ${queuedCmd.id}\n\nTo approve and execute, use: sudo_approve\nTo decline, use: sudo_decline`
    }],
    isError: false
  };
}

/**
 * Handle sudo_approve - execute the pending command
 */
export async function handleSudoApprove(
  queue: CommandQueue,
  sessionManager: SessionManager
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  
  // Get the first pending command
  const pending = queue.getPending();
  
  if (pending.length === 0) {
    return {
      content: [{
        type: 'text',
        text: 'No pending sudo commands to approve.'
      }],
      isError: true
    };
  }

  const cmd = pending[0];
  const startTime = Date.now();
  log(`[${cmd.id}] Executing approved command: ${cmd.command}`);

  try {
    // Update status to executing
    queue.updateStatus(cmd.id, 'executing');

    // Ensure sudo authentication
    await sessionManager.ensureAuthenticated();

    // Execute command
    const result = await executeSudoCommand(cmd.command);

    // Update with result
    const finalStatus = result.success ? 'completed' : 'failed';
    queue.updateStatus(cmd.id, finalStatus, result);

    const isError = !result.success;
    log(`[${cmd.id}] Completed in ${Date.now() - startTime}ms - Status: ${finalStatus}`);

    return {
      content: [{
        type: 'text',
        text: formatResult(cmd)
      }],
      isError
    };

  } catch (error) {
    log(`[${cmd.id}] Execution failed: ${(error as Error).message}`);
    queue.updateStatus(cmd.id, 'failed', {
      success: false,
      exitCode: -1,
      stdout: '',
      stderr: (error as Error).message,
      timedOut: false,
      duration: 0
    });

    return {
      content: [{
        type: 'text',
        text: `Command execution failed: ${(error as Error).message}`
      }],
      isError: true
    };
  }
}

/**
 * Handle sudo_decline - decline the pending command
 */
export async function handleSudoDecline(
  queue: CommandQueue
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  
  // Get the first pending command
  const pending = queue.getPending();
  
  if (pending.length === 0) {
    return {
      content: [{
        type: 'text',
        text: 'No pending sudo commands to decline.'
      }],
      isError: true
    };
  }

  const cmd = pending[0];
  queue.updateStatus(cmd.id, 'declined');
  log(`[${cmd.id}] Command declined: ${cmd.command}`);

  return {
    content: [{
      type: 'text',
      text: `Sudo command declined: "${cmd.command}"`
    }],
    isError: false
  };
}

/**
 * Get MCP tool definitions for interactive mode
 */
export function getInteractiveToolDefinitions() {
  return [
    {
      name: 'sudo_exec',
      description: 'Queue a command to run with sudo privileges. Returns immediately with a command ID. Use sudo_approve to execute or sudo_decline to reject.',
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
    },
    {
      name: 'sudo_approve',
      description: 'Approve and execute the next pending sudo command. Prompts for password if needed, then executes the command and returns the output.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'sudo_decline',
      description: 'Decline the next pending sudo command without executing it.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  ];
}
