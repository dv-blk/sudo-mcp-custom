import * as os from 'os';

/**
 * Detect if running in an SSH session
 */
export function isSSHSession(): boolean {
  return !!(
    process.env.SSH_CONNECTION ||
    process.env.SSH_CLIENT ||
    process.env.SSH_TTY
  );
}

/**
 * Get SSH client IP if in SSH session
 */
export function getSSHClientIP(): string | null {
  const sshConnection = process.env.SSH_CONNECTION;
  if (sshConnection) {
    // Format: "client_ip client_port server_ip server_port"
    const parts = sshConnection.split(' ');
    return parts[0] || null;
  }
  return null;
}

/**
 * Get hostname
 */
export function getHostname(): string {
  return os.hostname();
}

/**
 * Get current process ID
 */
export function getPID(): number {
  return process.pid;
}

/**
 * Get current working directory
 */
export function getCWD(): string {
  return process.cwd();
}

/**
 * Shorten path by replacing home directory with ~
 */
export function shortenPath(fullPath: string): string {
  const homeDir = os.homedir();
  if (fullPath.startsWith(homeDir)) {
    return '~' + fullPath.slice(homeDir.length);
  }
  return fullPath;
}

/**
 * Get environment info for bridge connection
 */
export interface EnvironmentInfo {
  hostname: string;
  pid: number;
  cwd: string;
  isSSH: boolean;
  sshClientIp: string | null;
}

export function getEnvironmentInfo(): EnvironmentInfo {
  return {
    hostname: getHostname(),
    pid: getPID(),
    cwd: shortenPath(getCWD()),
    isSSH: isSSHSession(),
    sshClientIp: getSSHClientIP(),
  };
}
