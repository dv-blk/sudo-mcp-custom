import * as path from 'path';
import { CommandQueue, QueuedCommand } from '../queue/command-queue';
import { SessionManager } from '../auth/session-manager';
import { Blocklist } from '../security/blocklist';
import { HttpServer } from '../server/http-server';
import { McpSudoServer } from '../server/mcp-server';
import { cleanupBrowserState } from '../utils/browser-opener';
import { log, logError } from '../utils/logger';
import { BridgeClient } from '../client/bridge-client';
import { isSSHSession } from '../utils/environment';
import { isBridgeRunning, startBridge } from '../utils/bridge-starter';
import { executeQueuedCommand } from '../executor/command-executor';

/**
 * Start MCP server mode with bridge integration
 */
export async function start(): Promise<void> {
  log('Starting Sudo MCP Server...');

  // Initialize components
  const queue = new CommandQueue();
  const sessionManager = new SessionManager();
  
  const blocklistPath = path.join(__dirname, '../../config/blocklist.json');
  const blocklist = new Blocklist(blocklistPath);

  let httpServer: HttpServer | null = null;
  let mcpServer: McpSudoServer | null = null;
  let bridgeClient: BridgeClient | null = null;

  try {
    // Determine if we should use bridge
    const useHttpFallback = process.env.SUDO_MCP_USE_HTTP === 'true';
    const isSSH = isSSHSession();

    if (!useHttpFallback) {
      // Try to connect to bridge
      log(isSSH ? 'SSH session detected' : 'Local session detected');

      // Auto-start bridge if local and not running
      if (!isSSH) {
        const bridgeRunning = await isBridgeRunning();
        if (!bridgeRunning) {
          log('Bridge not running, starting it...');
          await startBridge();
        } else {
          log('Bridge already running');
        }
      }

      // Create bridge client
      bridgeClient = new BridgeClient();

      // Set up approval handlers
      const onApproved = async (commandId: string) => {
        log(`Command approved via bridge: ${commandId}`);
        try {
          await executeQueuedCommand(commandId, queue, sessionManager);
          log(`Command execution completed: ${commandId}`);
        } catch (error) {
          logError(`Command execution error for ${commandId}`, error as Error);
        }
      };

      const onDeclined = (commandId: string) => {
        log(`Command declined via bridge: ${commandId}`);
        queue.decline(commandId);
      };

        // Connect to bridge
        log('Connecting to bridge...');
        try {
          await bridgeClient.connect(onApproved, onDeclined);
          log('Connected to bridge successfully');

          // Listen for queue changes and forward to bridge
          const sentCommands = new Set<string>();
          const client = bridgeClient; // Capture for closure

          queue.onChange((commands: QueuedCommand[]) => {
            if (!client || !client.connected()) return;

            // Process each command
            commands.forEach(cmd => {
              const bridgeCommand = {
                id: cmd.id,
                command: cmd.command,
                status: cmd.status,
                queuedAt: cmd.queuedAt,
                result: cmd.result ? {
                  success: cmd.result.success,
                  exitCode: cmd.result.exitCode,
                  stdout: cmd.result.stdout,
                  stderr: cmd.result.stderr,
                  duration: cmd.result.duration,
                  timedOut: cmd.result.timedOut,
                } : undefined,
              };

              // Send new pending commands
              if (cmd.status === 'pending' && !sentCommands.has(cmd.id)) {
                client.queueCommand(bridgeCommand);
                sentCommands.add(cmd.id);
              }
              // Send status updates for executing/completed/failed
              else if (cmd.status !== 'pending' && sentCommands.has(cmd.id)) {
                client.updateCommandStatus(bridgeCommand);
              }
            });
          });

          log('Bridge integration enabled');
        } catch (error) {
          logError('Failed to connect to bridge, falling back to HTTP server', error as Error);
          bridgeClient = null;
        }
    }

    // Start HTTP server (always, as fallback or primary)
    httpServer = new HttpServer(queue, sessionManager);
    const serverUrl = await httpServer.start(3000);

    // Determine if we're using bridge
    const usingBridge = bridgeClient !== null && bridgeClient.connected();

    // Check for GUI environment only if using HTTP fallback
    if (!usingBridge && !process.env.DISPLAY) {
      console.error('[sudo-mcp ERROR] No DISPLAY environment variable detected.');
      console.error('[sudo-mcp ERROR] HTTP fallback mode requires a GUI environment.');
      console.error('[sudo-mcp ERROR] Please ensure X11 is running and DISPLAY is set.');
      console.error('[sudo-mcp ERROR] Or use bridge mode by ensuring the bridge is accessible.');
      process.exit(1);
    }

    // Start MCP server (stdio)
    mcpServer = new McpSudoServer(queue, blocklist, serverUrl, usingBridge);
    await mcpServer.start();

    if (usingBridge) {
      log('Sudo MCP Server is ready (using bridge)');
    } else {
      log('Sudo MCP Server is ready (using HTTP fallback)');
    }

  } catch (error) {
    logError('Failed to start server', error as Error);
    process.exit(1);
  }

  // Graceful shutdown
  const cleanup = async () => {
    log('Shutting down...');

    if (bridgeClient) {
      bridgeClient.close();
    }

    if (mcpServer) {
      await mcpServer.stop();
    }

    if (httpServer) {
      await httpServer.stop();
    }

    queue.destroy();
    cleanupBrowserState();

    log('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
