import { WebSocket } from 'ws';
import { log, logError } from '../utils/logger';
import { loadOrGenerateToken } from '../utils/token/token-manager';

export interface MCPConnection {
  ws: WebSocket;
  serverId: string;
  hostname: string;
  pid: number;
  cwd: string;
  isSSH: boolean;
  sshClientIp: string | null;
  authenticated: boolean;
}

export interface ExtensionConnection {
  ws: WebSocket;
  authenticated: boolean;
}

export class MessageRouter {
  private mcpConnections = new Map<string, MCPConnection>();
  private extensionConnection: ExtensionConnection | null = null;
  private token: string;

  constructor() {
    this.token = loadOrGenerateToken();
  }

  /**
   * Get the authentication token
   */
  getToken(): string {
    return this.token;
  }

  /**
   * Validate token
   */
  validateToken(providedToken: string): boolean {
    return providedToken === this.token;
  }

  /**
   * Handle MCP connection
   */
  handleMCPConnection(ws: WebSocket, clientId: string): void {
    const connection: MCPConnection = {
      ws,
      serverId: '',
      hostname: '',
      pid: 0,
      cwd: '',
      isSSH: false,
      sshClientIp: null,
      authenticated: false,
    };
    this.mcpConnections.set(clientId, connection);
  }

  /**
   * Handle extension connection
   */
  handleExtensionConnection(ws: WebSocket): void {
    this.extensionConnection = {
      ws,
      authenticated: false,
    };
  }

  /**
   * Handle MCP message
   */
  handleMCPMessage(clientId: string, message: any): void {
    const connection = this.mcpConnections.get(clientId);
    if (!connection) return;

    // Handle authentication
    if (message.type === 'register') {
      if (!this.validateToken(message.token)) {
        log(`MCP ${clientId}: Invalid token, rejecting connection`);
        connection.ws.send(JSON.stringify({
          type: 'error',
          error: 'Invalid token',
        }));
        connection.ws.close();
        return;
      }

      connection.authenticated = true;
      connection.serverId = message.serverId;
      connection.hostname = message.hostname;
      connection.pid = message.pid;
      connection.cwd = message.cwd;
      connection.isSSH = message.isSSH || false;
      connection.sshClientIp = message.sshClientIp || null;

      log(`MCP ${clientId}: Registered as ${connection.serverId} (${connection.hostname}, PID ${connection.pid})`);

      // Send acknowledgment
      connection.ws.send(JSON.stringify({
        type: 'registered',
        serverId: connection.serverId,
      }));

      return;
    }

    // All other messages require authentication
    if (!connection.authenticated) {
      connection.ws.send(JSON.stringify({
        type: 'error',
        error: 'Not authenticated',
      }));
      return;
    }

    // Forward message to extension
    if (this.extensionConnection && this.extensionConnection.authenticated) {
      this.extensionConnection.ws.send(JSON.stringify({
        ...message,
        _meta: {
          serverId: connection.serverId,
          hostname: connection.hostname,
          pid: connection.pid,
          cwd: connection.cwd,
          isSSH: connection.isSSH,
        },
      }));
    }
  }

  /**
   * Handle extension message
   */
  handleExtensionMessage(message: any): void {
    if (!this.extensionConnection) return;

    // Handle authentication
    if (message.type === 'auth') {
      if (!this.validateToken(message.token)) {
        log('Extension: Invalid token, rejecting connection');
        this.extensionConnection.ws.send(JSON.stringify({
          type: 'error',
          error: 'Invalid token',
        }));
        this.extensionConnection.ws.close();
        return;
      }

      this.extensionConnection.authenticated = true;
      log('Extension: Authenticated successfully');

      // Send acknowledgment with current MCP connections
      const mcpList = Array.from(this.mcpConnections.values())
        .filter(conn => conn.authenticated)
        .map(conn => ({
          serverId: conn.serverId,
          hostname: conn.hostname,
          pid: conn.pid,
          cwd: conn.cwd,
          isSSH: conn.isSSH,
        }));

      this.extensionConnection.ws.send(JSON.stringify({
        type: 'authenticated',
        mcps: mcpList,
      }));

      return;
    }

    // All other messages require authentication
    if (!this.extensionConnection.authenticated) {
      this.extensionConnection.ws.send(JSON.stringify({
        type: 'error',
        error: 'Not authenticated',
      }));
      return;
    }

    // Route message to appropriate MCP
    const targetServerId = message.serverId;
    if (targetServerId) {
      for (const [clientId, conn] of this.mcpConnections.entries()) {
        if (conn.serverId === targetServerId && conn.authenticated) {
          conn.ws.send(JSON.stringify(message));
          break;
        }
      }
    }
  }

  /**
   * Handle MCP disconnection
   */
  handleMCPDisconnection(clientId: string): void {
    const connection = this.mcpConnections.get(clientId);
    if (connection && connection.authenticated) {
      // Notify extension
      if (this.extensionConnection && this.extensionConnection.authenticated) {
        this.extensionConnection.ws.send(JSON.stringify({
          type: 'mcp_disconnected',
          serverId: connection.serverId,
        }));
      }
    }
    this.mcpConnections.delete(clientId);
  }

  /**
   * Handle extension disconnection
   */
  handleExtensionDisconnection(): void {
    this.extensionConnection = null;
  }

  /**
   * Get connection stats
   */
  getStats(): {
    mcpCount: number;
    extensionConnected: boolean;
    mcps: Array<{
      serverId: string;
      hostname: string;
      pid: number;
      cwd: string;
      isSSH: boolean;
    }>;
  } {
    const mcps = Array.from(this.mcpConnections.values())
      .filter(conn => conn.authenticated)
      .map(conn => ({
        serverId: conn.serverId,
        hostname: conn.hostname,
        pid: conn.pid,
        cwd: conn.cwd,
        isSSH: conn.isSSH,
      }));

    return {
      mcpCount: mcps.length,
      extensionConnected: !!(this.extensionConnection && this.extensionConnection.authenticated),
      mcps,
    };
  }
}
