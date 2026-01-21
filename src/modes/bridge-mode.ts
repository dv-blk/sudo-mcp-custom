import { CustomWebSocketServer } from '../bridge/websocket-server';
import { MessageRouter } from '../bridge/message-router';
import { log, logError } from '../utils/logger';
import { loadOrGenerateToken, displayTokenInstructions } from '../utils/token/token-manager';

const MCP_PORT = 9999;
const EXTENSION_PORT = 9998;

export class BridgeMode {
  private mcpServer: CustomWebSocketServer | null = null;
  private extensionServer: CustomWebSocketServer | null = null;
  private router: MessageRouter;

  constructor() {
    this.router = new MessageRouter();
  }

  /**
   * Start the bridge in daemon mode
   */
  async start(): Promise<void> {
    log('Starting Sudo MCP Bridge...');

    // Load or generate token
    const token = loadOrGenerateToken();
    
    // Check if this looks like first run (show instructions)
    // We'll show instructions if the token file was just created
    // For simplicity, always show on bridge start
    displayTokenInstructions(token);

    try {
      // Start MCP server (port 9999)
      this.mcpServer = new CustomWebSocketServer({
        port: MCP_PORT,
        name: 'MCP Server',
        onConnection: (ws, clientId) => {
          this.router.handleMCPConnection(ws, clientId);
        },
        onMessage: (ws, clientId, data) => {
          this.router.handleMCPMessage(clientId, data);
        },
        onClose: (clientId) => {
          this.router.handleMCPDisconnection(clientId);
        },
      });

      // Start Extension server (port 9998)
      this.extensionServer = new CustomWebSocketServer({
        port: EXTENSION_PORT,
        name: 'Extension Server',
        onConnection: (ws, clientId) => {
          this.router.handleExtensionConnection(ws);
        },
        onMessage: (ws, clientId, data) => {
          this.router.handleExtensionMessage(data);
        },
        onClose: (clientId) => {
          this.router.handleExtensionDisconnection();
        },
      });

      log('Bridge started successfully');
      log(`MCP connections: ws://localhost:${MCP_PORT}`);
      log(`Extension connection: ws://localhost:${EXTENSION_PORT}`);
      log('Bridge will run until manually stopped (Ctrl+C)');

    } catch (error) {
      logError('Failed to start bridge', error as Error);
      throw error;
    }
  }

  /**
   * Stop the bridge
   */
  async stop(): Promise<void> {
    log('Stopping bridge...');

    const stopPromises: Promise<void>[] = [];

    if (this.mcpServer) {
      stopPromises.push(this.mcpServer.close());
    }

    if (this.extensionServer) {
      stopPromises.push(this.extensionServer.close());
    }

    // Wait for all servers to close with a 3 second timeout
    try {
      await Promise.race([
        Promise.all(stopPromises),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 3000)
        )
      ]);
    } catch (error) {
      // Timeout or error - force exit anyway
    }

    log('Bridge stopped');
    process.exit(0);
  }

  /**
   * Get bridge status
   */
  getStatus(): any {
    const stats = this.router.getStats();
    return {
      running: true,
      token: this.router.getToken().substring(0, 8) + '...',
      mcpPort: MCP_PORT,
      extensionPort: EXTENSION_PORT,
      connections: stats,
    };
  }
}

/**
 * Start bridge mode
 */
export async function start(): Promise<void> {
  const bridge = new BridgeMode();
  
  let isShuttingDown = false;
  
  // Graceful shutdown handlers
  const cleanup = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log('\n'); // New line after ^C
    bridge.stop().catch(console.error);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('SIGHUP', cleanup);

  await bridge.start();
}
