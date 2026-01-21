#!/usr/bin/env node

import { logError } from './utils/logger';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--bridge')) {
    // Run in bridge mode
    const { start } = await import('./modes/bridge-mode');
    await start();
  } else if (args.includes('--bridge-status')) {
    // Show bridge status (TODO: implement)
    console.log('Bridge status check not yet implemented');
    process.exit(0);
  } else {
    // Run in MCP server mode (default)
    const { start } = await import('./modes/mcp-mode');
    await start();
  }
}

// Start the application
main().catch((error) => {
  logError('Unhandled error in main', error);
  process.exit(1);
});
