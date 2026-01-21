import { spawn } from 'child_process';
import { log, logError, logDebug } from '../utils/logger';

export class SessionManager {
  /**
   * Check if sudo credentials are currently cached
   */
  async checkSudoValid(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('sudo', ['-n', '-v'], {
        stdio: 'ignore'
      });

      proc.on('close', (code) => {
        const valid = code === 0;
        logDebug(`Sudo cache check: ${valid ? 'valid' : 'expired'}`);
        resolve(valid);
      });

      proc.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Authenticate using GUI password dialog
   * Tries kdialog (KDE), zenity (GNOME), or systemd-ask-password
   */
  async authenticate(): Promise<void> {
    log('Requesting sudo password via GUI dialog...');

    // Detect which password dialog tool to use
    const desktop = process.env.XDG_CURRENT_DESKTOP || '';
    const isSSH = !!process.env.SSH_CONNECTION;
    
    let dialogTool: string;
    let dialogArgs: string[];

    // For SSH sessions, try to use X11-compatible tools
    if (isSSH) {
      // Check what's available - prefer zenity/kdialog for X11
      const hasZenity = await this.commandExists('zenity');
      const hasKdialog = await this.commandExists('kdialog');
      
      if (hasZenity) {
        dialogTool = 'zenity';
        dialogArgs = [
          '--password',
          '--title=Sudo Authentication',
          '--text=Sudo password required for MCP server'
        ];
        log('Using zenity for SSH X11 forwarding');
      } else if (hasKdialog) {
        dialogTool = 'kdialog';
        dialogArgs = [
          '--password',
          'Sudo password required for MCP server'
        ];
        log('Using kdialog for SSH X11 forwarding');
      } else {
        throw new Error(
          'No X11-compatible password dialog found. Please install zenity or kdialog on the remote server.'
        );
      }
    } else if (desktop.includes('KDE')) {
      // KDE - use kdialog
      dialogTool = 'kdialog';
      dialogArgs = [
        '--password',
        'Sudo password required for MCP server'
      ];
    } else if (desktop.includes('GNOME') || desktop.includes('Unity')) {
      // GNOME/Unity - use zenity
      dialogTool = 'zenity';
      dialogArgs = [
        '--password',
        '--title=Sudo Authentication',
        '--text=Sudo password required for MCP server'
      ];
    } else {
      // Fallback to systemd-ask-password
      dialogTool = 'systemd-ask-password';
      dialogArgs = [
        '--icon=dialog-password',
        '--timeout=60',
        'Sudo password required for MCP server'
      ];
    }

    logDebug(`Using password dialog: ${dialogTool}`);

    return new Promise((resolve, reject) => {
      const askProc = spawn(dialogTool, dialogArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' }
      });

      let password = '';
      let error = '';

      askProc.stdout?.on('data', (data) => {
        password += data.toString();
      });

      askProc.stderr?.on('data', (data) => {
        error += data.toString();
        logDebug(`${dialogTool} stderr: ${data.toString()}`);
      });

      askProc.on('close', (code) => {
        if (code !== 0) {
          logError(`Password dialog failed with code ${code}. stderr: ${error}`);
          reject(new Error('Password dialog cancelled or timed out'));
          return;
        }

        const trimmedPassword = password.trim();
        if (!trimmedPassword) {
          reject(new Error('No password provided'));
          return;
        }

        // Validate password with sudo
        this.validatePassword(trimmedPassword)
          .then(() => {
            log('Authentication successful');
            resolve();
          })
          .catch((err) => {
            logError('Authentication failed', err);
            reject(err);
          });
      });

      askProc.on('error', (err) => {
        logError(`Failed to launch password dialog (${dialogTool})`, err);
        reject(err);
      });
    });
  }

  /**
   * Check if a command exists in PATH
   */
  private async commandExists(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      spawn('which', [command], { stdio: 'ignore' })
        .on('close', (code) => resolve(code === 0))
        .on('error', () => resolve(false));
    });
  }

  /**
   * Validate password by running sudo -S -v
   */
  private async validatePassword(password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('sudo', ['-S', '-v'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Send password to stdin
      proc.stdin?.write(password + '\n');
      proc.stdin?.end();

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error('Invalid password'));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Ensure sudo credentials are valid, authenticate if needed
   */
  async ensureAuthenticated(): Promise<void> {
    log('Checking sudo credentials...');
    const valid = await this.checkSudoValid();
    if (!valid) {
      log('Sudo credentials expired, requesting authentication...');
      await this.authenticate();
    } else {
      log('Sudo credentials are valid');
    }
  }
}
