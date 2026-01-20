#!/usr/bin/env node

import * as path from 'path';
import { CommandQueue } from './queue/command-queue';
import { SessionManager } from './auth/session-manager';
import { Blocklist } from './security/blocklist';
import { HttpServer } from './server/http-server';
import { McpSudoServer } from './server/mcp-server';
import { cleanupBrowserState } from './utils/browser-opener';
import { log, logError } from './utils/logger';

async function main() {
  // Check for GUI environment
  if (!process.env.DISPLAY) {
    console.error('[sudo-mcp ERROR] No DISPLAY environment variable detected.');
    console.error('[sudo-mcp ERROR] This MCP server requires a GUI environment.');
    console.error('[sudo-mcp ERROR] Please ensure X11 is running and DISPLAY is set.');
    process.exit(1);
  }

  log('Starting Sudo MCP Server...');

  // Initialize components
  const queue = new CommandQueue();
  const sessionManager = new SessionManager();
  
  const blocklistPath = path.join(__dirname, '../config/blocklist.json');
  const blocklist = new Blocklist(blocklistPath);

  let httpServer: HttpServer | null = null;
  let mcpServer: McpSudoServer | null = null;

  try {
    // Start HTTP server
    httpServer = new HttpServer(queue, sessionManager);
    const serverUrl = await httpServer.start(3000);

    // Start MCP server (stdio)
    mcpServer = new McpSudoServer(queue, blocklist, serverUrl);
    await mcpServer.start();

    log('Sudo MCP Server is ready');

  } catch (error) {
    logError('Failed to start server', error as Error);
    process.exit(1);
  }

  // Graceful shutdown
  const cleanup = async () => {
    log('Shutting down...');

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

// Start the server
main().catch((error) => {
  logError('Unhandled error in main', error);
  process.exit(1);
});
