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

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.config.onMessage(ws, clientId, message);
        } catch (error) {
          logError(`${this.config.name}: Failed to parse message from ${clientId}`, error as Error);
        }
      });

      ws.on('close', () => {
        log(`${this.config.name}: Client disconnected (${clientId})`);
        this.clients.delete(clientId);
        this.config.onClose(clientId);
      });

      ws.on('error', (error) => {
        logError(`${this.config.name}: WebSocket error for ${clientId}`, error);
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
   * Close the server
   */
  async close(): Promise<void> {
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
