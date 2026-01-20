import express, { Request, Response } from 'express';
import * as path from 'path';
import * as http from 'http';
import { CommandQueue } from '../queue/command-queue';
import { SessionManager } from '../auth/session-manager';
import { executeSudoCommand } from '../executor/sudo-executor';
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

      // Add client to set
      this.sseClients.add(res);

      // Remove client on disconnect
      req.on('close', () => {
        this.sseClients.delete(res);
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
      log(`/execute-all triggered for ${pending.length} commands`);
      res.send(''); // Respond immediately

      // Execute all sequentially in background (for sudo safety)
      // Each command's MCP tool call will return independently when that command finishes
      for (const cmd of pending) {
        log(`Starting execution of command: ${cmd.id}`);
        await this.executeCommand(cmd.id).catch(err => {
          logError(`Failed to execute command ${cmd.id}`, err);
        });
        log(`Finished execution of command: ${cmd.id}`);
      }
      log(`/execute-all completed all ${pending.length} commands`);
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
  }

  /**
   * Execute a command from the queue
   */
  private async executeCommand(id: string): Promise<void> {
    const command = this.queue.getById(id);
    if (!command || command.status !== 'pending') {
      return;
    }

    const startTime = Date.now();
    log(`[${id}] EXECUTION STARTED for: ${command.command}`);

    try {
      // Update status to executing
      this.queue.updateStatus(id, 'executing');
      log(`[${id}] Status changed to EXECUTING at ${Date.now() - startTime}ms`);

      // Ensure sudo authentication
      await this.sessionManager.ensureAuthenticated();
      log(`[${id}] Authentication completed at ${Date.now() - startTime}ms`);

      // Execute command
      const result = await executeSudoCommand(command.command);
      log(`[${id}] Command completed at ${Date.now() - startTime}ms - Exit code: ${result.exitCode}`);

      // Update with result
      const finalStatus = result.success ? 'completed' : 'failed';
      this.queue.updateStatus(id, finalStatus, result);
      log(`[${id}] Status changed to ${finalStatus.toUpperCase()} at ${Date.now() - startTime}ms`);

    } catch (error) {
      logError(`Command execution failed for ${id}`, error as Error);
      this.queue.updateStatus(id, 'failed', {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: (error as Error).message,
        timedOut: false,
        duration: 0
      });
    }
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
    // SSE format requires each line to be prefixed with "data: "
    // Split multi-line data and prefix each line
    const lines = data.split('\n');
    const dataLines = lines.map(line => `data: ${line}`).join('\n');
    const message = `event: ${event}\n${dataLines}\n\n`;
    
    logDebug(`Broadcasting SSE to ${this.sseClients.size} clients`);
    
    for (const client of this.sseClients) {
      try {
        client.write(message);
      } catch (error) {
        // Client disconnected, will be cleaned up by close event
        this.sseClients.delete(client);
      }
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
