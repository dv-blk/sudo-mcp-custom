import { WebSocketServer, WebSocket } from 'ws';
import { log, logError } from '../utils/logger';

export interface WebSocketServerConfig {
  port: number;
  name: string;
  onConnection: (ws: WebSocket, clientId: string) => void;
  onMessage: (ws: WebSocket, clientId: string, data: any) => void;
  onClose: (clientId: string) => void;
}

export class CustomWebSocketServer {
  private wss: WebSocketServer;
  private clients = new Map<string, WebSocket>();
  private config: WebSocketServerConfig;
  private nextClientId = 1;
  private pingIntervals = new Map<string, NodeJS.Timeout>();
  private readonly PING_INTERVAL = 20000; // 20 seconds

  constructor(config: WebSocketServerConfig) {
    this.config = config;
    this.wss = new WebSocketServer({ port: config.port });
    this.setupServer();
  }

  private setupServer(): void {
    this.wss.on('listening', () => {
      log(`${this.config.name} listening on port ${this.config.port}`);
    });

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = `${this.config.name.toLowerCase()}-${this.nextClientId++}`;
      this.clients.set(clientId, ws);

      log(`${this.config.name}: Client connected (${clientId})`);

      // Start ping interval for this client
      this.startPingInterval(clientId, ws);

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          
          // Handle pong response
          if (message.type === 'pong') {
            // Client is alive, no action needed
            return;
          }
          
          this.config.onMessage(ws, clientId, message);
        } catch (error) {
          logError(`${this.config.name}: Failed to parse message from ${clientId}`, error as Error);
        }
      });

      ws.on('close', () => {
        log(`${this.config.name}: Client disconnected (${clientId})`);
        this.stopPingInterval(clientId);
        this.clients.delete(clientId);
        this.config.onClose(clientId);
      });

      ws.on('error', (error) => {
        logError(`${this.config.name}: WebSocket error for ${clientId}`, error);
      });

      // Handle pong frames (native WebSocket ping/pong)
      ws.on('pong', () => {
        // Client responded to native ping, connection is alive
      });

      this.config.onConnection(ws, clientId);
    });

    this.wss.on('error', (error) => {
      logError(`${this.config.name}: Server error`, error);
    });
  }

  /**
   * Send message to a specific client
   */
  send(clientId: string, message: any): boolean {
    const ws = this.clients.get(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  /**
   * Broadcast message to all clients
   */
  broadcast(message: any): void {
    const data = JSON.stringify(message);
    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get all client IDs
   */
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Start ping interval for a client
   */
  private startPingInterval(clientId: string, ws: WebSocket): void {
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        // Send both native ping and JSON ping for compatibility
        ws.ping(); // Native WebSocket ping
        ws.send(JSON.stringify({ type: 'ping' })); // Application-level ping
      } else {
        this.stopPingInterval(clientId);
      }
    }, this.PING_INTERVAL);
    
    this.pingIntervals.set(clientId, interval);
  }

  /**
   * Stop ping interval for a client
   */
  private stopPingInterval(clientId: string): void {
    const interval = this.pingIntervals.get(clientId);
    if (interval) {
      clearInterval(interval);
      this.pingIntervals.delete(clientId);
    }
  }

  /**
   * Close the server
   */
  async close(): Promise<void> {
    // Stop all ping intervals
    this.pingIntervals.forEach((interval) => clearInterval(interval));
    this.pingIntervals.clear();

    // First, close all active client connections
    this.clients.forEach((ws, clientId) => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    });
    this.clients.clear();

    // Then close the server
    return new Promise((resolve) => {
      this.wss.close(() => {
        log(`${this.config.name} closed`);
        resolve();
      });
    });
  }
}
