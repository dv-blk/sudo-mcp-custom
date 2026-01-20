import { spawn } from 'child_process';
import { logDebug, logError } from '../utils/logger';

export interface ExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  duration: number;
}

export async function executeSudoCommand(
  command: string,
  timeout: number = 300000 // 5 minutes default
): Promise<ExecutionResult> {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    logDebug(`Executing: sudo bash -c "${command}"`);

    const proc = spawn('sudo', ['bash', '-c', command], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Set timeout
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      
      // Force kill after 5 seconds if SIGTERM doesn't work
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
      }, 5000);
    }, timeout);

    // Collect stdout
    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    // Collect stderr
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle process completion
    proc.on('close', (code) => {
      clearTimeout(timer);
      const duration = Date.now() - startTime;

      const exitCode = code ?? -1;
      const success = exitCode === 0 && !timedOut;

      logDebug(`Command completed: exit=${exitCode}, duration=${duration}ms, timedOut=${timedOut}`);

      resolve({
        success,
        exitCode,
        stdout,
        stderr,
        timedOut,
        duration
      });
    });

    // Handle process errors
    proc.on('error', (error) => {
      clearTimeout(timer);
      const duration = Date.now() - startTime;
      
      logError('Failed to execute sudo command', error);

      resolve({
        success: false,
        exitCode: -1,
        stdout,
        stderr: stderr + '\n' + error.message,
        timedOut: false,
        duration
      });
    });
  });
}
