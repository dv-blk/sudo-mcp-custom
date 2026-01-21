import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { log, logError } from '../utils/logger';
import { loadOrGenerateToken } from '../utils/token/token-manager';
import { getEnvironmentInfo } from '../utils/environment';

const BRIDGE_URL = 'ws://localhost:9999';
const MAX_RETRY_TIME = 2 * 60 * 1000; // 2 minutes
const RETRY_INTERVAL = 5000; // 5 seconds

export interface BridgeCommand {
  id: string;
  command: string;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'declined';
  queuedAt: Date;
  result?: {
    success: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
    timedOut?: boolean;
  };
}

export type CommandApprovalHandler = (commandId: string) => Promise<void>;
export type CommandDeclinedHandler = (commandId: string) => void;

export class BridgeClient {
  private ws: WebSocket | null = null;
  private serverId: string;
  private token: string;
  private isConnected: boolean = false;
  private reconnecting: boolean = false;
  private onApproved: CommandApprovalHandler | null = null;
  private onDeclined: CommandDeclinedHandler | null = null;
  private sentCommands: Set<string> = new Set(); // Track sent commands
  private lastCommandStatus: Map<string, string> = new Map(); // Track last sent status

  constructor() {
    this.serverId = uuidv4();
    this.token = loadOrGenerateToken();
  }

  /**
   * Connect to bridge with retry logic
   */
  async connect(onApproved: CommandApprovalHandler, onDeclined: CommandDeclinedHandler): Promise<void> {
    this.onApproved = onApproved;
    this.onDeclined = onDeclined;

    const startTime = Date.now();
    let lastError: Error | null = null;

    while (Date.now() - startTime < MAX_RETRY_TIME) {
      try {
        await this.attemptConnection();
        log('Connected to bridge successfully');
        return;
      } catch (error) {
        lastError = error as Error;
        const elapsed = Date.now() - startTime;
        const remaining = MAX_RETRY_TIME - elapsed;

        if (remaining <= 0) break;

        log(`Failed to connect to bridge, retrying in ${RETRY_INTERVAL / 1000}s... (${Math.floor(remaining / 1000)}s remaining)`);
        await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
      }
    }

    // Failed to connect after retries
    throw new Error(
      `Failed to connect to bridge after ${MAX_RETRY_TIME / 1000}s. ` +
      `Is the bridge running? Start it with: npm run bridge\n` +
      `Last error: ${lastError?.message}`
    );
  }

  /**
   * Attempt a single connection
   */
  private attemptConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(BRIDGE_URL);

        const timeout = setTimeout(() => {
          if (this.ws) {
            this.ws.close();
          }
          reject(new Error('Connection timeout'));
        }, 5000);

        this.ws.on('open', () => {
          clearTimeout(timeout);
          log('WebSocket connection opened, sending registration...');

          const env = getEnvironmentInfo();
          this.ws!.send(JSON.stringify({
            type: 'register',
            serverId: this.serverId,
            token: this.token,
            hostname: env.hostname,
            pid: env.pid,
            cwd: env.cwd,
            isSSH: env.isSSH,
            sshClientIp: env.sshClientIp,
          }));
        });

        this.ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message, resolve, reject);
          } catch (error) {
            logError('Failed to parse message from bridge', error as Error);
          }
        });

        this.ws.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });

        this.ws.on('close', () => {
          clearTimeout(timeout);
          this.isConnected = false;
          log('Disconnected from bridge');
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle message from bridge
   */
  private handleMessage(message: any, connectResolve?: (value: void) => void, connectReject?: (error: Error) => void): void {
    switch (message.type) {
      case 'registered':
        this.isConnected = true;
        log(`Registered with bridge as ${this.serverId}`);
        if (connectResolve) {
          connectResolve();
        }
        break;

      case 'error':
        logError('Bridge error', new Error(message.error));
        if (connectReject) {
          connectReject(new Error(message.error));
        }
        break;

      case 'approve':
        if (this.onApproved) {
          this.onApproved(message.commandId);
        }
        break;

      case 'decline':
        if (this.onDeclined) {
          this.onDeclined(message.commandId);
        }
        break;
    }
  }

  /**
   * Queue a new command
   */
  queueCommand(command: BridgeCommand): void {
    if (!this.isConnected || !this.ws) {
      logError('Cannot queue command: not connected to bridge', new Error('Not connected'));
      return;
    }

    // Only send if not already sent
    if (this.sentCommands.has(command.id)) {
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'command_queued',
      command: {
        id: command.id,
        command: command.command,
        status: command.status,
        queuedAt: command.queuedAt.toISOString(),
      },
    }));

    this.sentCommands.add(command.id);
    this.lastCommandStatus.set(command.id, command.status);
  }

  /**
   * Update command status
   */
  updateCommandStatus(command: BridgeCommand): void {
    if (!this.isConnected || !this.ws) {
      return;
    }

    // Only send if status changed
    const lastStatus = this.lastCommandStatus.get(command.id);
    if (lastStatus === command.status) {
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'command_status',
      command: {
        id: command.id,
        status: command.status,
        result: command.result,
      },
    }));

    this.lastCommandStatus.set(command.id, command.status);
  }

  /**
   * Check if connected
   */
  connected(): boolean {
    return this.isConnected;
  }

  /**
   * Close connection
   */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}
