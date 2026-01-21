import express, { Request, Response } from 'express';
import * as path from 'path';
import * as http from 'http';
import { CommandQueue } from '../queue/command-queue';
import { SessionManager } from '../auth/session-manager';
import { executeQueuedCommand } from '../executor/command-executor';
import { renderFullPage, renderQueue } from './html-renderer';
import { log, logError, logDebug } from '../utils/logger';

export class HttpServer {
  private app: express.Application;
  private server: http.Server | null = null;
  private port: number = 0;
  private queue: CommandQueue;
  private sessionManager: SessionManager;
  private sseClients: Set<Response> = new Set();

  constructor(queue: CommandQueue, sessionManager: SessionManager) {
    this.queue = queue;
    this.sessionManager = sessionManager;
    this.app = express();

    this.setupRoutes();
    this.setupQueueListener();
  }

  private setupRoutes(): void {
    // Serve main page
    this.app.get('/', (req, res) => {
      const commands = this.queue.getAll();
      res.send(renderFullPage(commands));
    });

    // Serve HTMX library
    this.app.get('/htmx.min.js', (req, res) => {
      res.sendFile(path.join(__dirname, '../../public/htmx.min.js'));
    });

    // Serve HTMX SSE extension
    this.app.get('/htmx-sse.js', (req, res) => {
      res.sendFile(path.join(__dirname, '../../public/htmx-sse.js'));
    });

    // SSE endpoint
    this.app.get('/sse', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Send initial connection message
      res.write('event: connected\ndata: connected\n\n');

      // Add client to set
      this.sseClients.add(res);
      log(`SSE client connected. Total clients: ${this.sseClients.size}`);

      // Send current queue state immediately
      const commands = this.queue.getAll();
      const html = renderQueue(commands);
      const lines = html.split('\n');
      const dataLines = lines.map(line => `data: ${line}`).join('\n');
      res.write(`event: queue\n${dataLines}\n\n`);

      // Keep-alive heartbeat every 15 seconds
      const heartbeat = setInterval(() => {
        try {
          res.write(': heartbeat\n\n');
        } catch (err) {
          clearInterval(heartbeat);
        }
      }, 15000);

      // Remove client on disconnect
      req.on('close', () => {
        clearInterval(heartbeat);
        this.sseClients.delete(res);
        log(`SSE client disconnected. Total clients: ${this.sseClients.size}`);
      });
    });

    // Execute single command
    this.app.post('/execute/:id', async (req, res) => {
      const { id } = req.params;
      res.send(''); // Respond immediately, SSE will update UI

      // Execute in background
      this.executeCommand(id).catch(err => {
        logError(`Failed to execute command ${id}`, err);
      });
    });

    // Execute all pending commands  
    this.app.post('/execute-all', async (req, res) => {
      const pending = this.queue.getPending();
      res.send(''); // Respond immediately

      // Execute all sequentially in background (for sudo safety)
      // Each command's MCP tool call will return independently when that command finishes
      for (const cmd of pending) {
        await this.executeCommand(cmd.id).catch(err => {
          logError(`Failed to execute command ${cmd.id}`, err);
        });
      }
    });

    // Decline single command
    this.app.post('/decline/:id', (req, res) => {
      const { id } = req.params;
      this.queue.decline(id);
      res.send('');
    });

    // Decline all pending commands
    this.app.post('/decline-all', (req, res) => {
      this.queue.declineAll();
      res.send('');
    });

    // Clear completed/declined/failed commands
    this.app.post('/clear-completed', (req, res) => {
      this.queue.clearCompleted();
      res.send('');
    });
  }

  /**
   * Execute a command from the queue
   */
  private async executeCommand(id: string): Promise<void> {
    await executeQueuedCommand(id, this.queue, this.sessionManager);
  }

  /**
   * Setup queue change listener to broadcast via SSE
   */
  private setupQueueListener(): void {
    this.queue.onChange((commands) => {
      const html = renderQueue(commands);
      this.broadcastSSE('queue', html);
    });
  }

  /**
   * Broadcast message to all SSE clients
   */
  private broadcastSSE(event: string, data: string): void {
    if (this.sseClients.size === 0) {
      logDebug('No SSE clients connected, skipping broadcast');
      return;
    }

    // SSE format requires each line to be prefixed with "data: "
    // Split multi-line data and prefix each line
    const lines = data.split('\n');
    const dataLines = lines.map(line => `data: ${line}`).join('\n');
    const message = `event: ${event}\n${dataLines}\n\n`;
    
    log(`Broadcasting SSE to ${this.sseClients.size} client(s)`);
    
    const deadClients = new Set<express.Response>();
    
    for (const client of this.sseClients) {
      try {
        client.write(message);
      } catch (error) {
        // Client disconnected, mark for removal
        logDebug('Failed to write to SSE client, marking for removal');
        deadClients.add(client);
      }
    }
    
    // Remove dead clients
    for (const client of deadClients) {
      this.sseClients.delete(client);
    }
  }

  /**
   * Find an available port starting from the given port
   */
  private async findAvailablePort(startPort: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const testServer = http.createServer();
      
      testServer.listen(startPort, () => {
        const port = (testServer.address() as any).port;
        testServer.close(() => resolve(port));
      });

      testServer.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          // Port in use, try next one
          resolve(this.findAvailablePort(startPort + 1));
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * Start the HTTP server
   */
  async start(preferredPort: number = 3000): Promise<string> {
    this.port = await this.findAvailablePort(preferredPort);

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        const url = `http://localhost:${this.port}`;
        log(`HTTP server started at ${url}`);
        resolve(url);
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          log('HTTP server stopped');
          resolve();
        });
      });
    }
  }
}
