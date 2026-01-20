/**
 * Simple logger that outputs to stderr (MCP compatible)
 */

export function log(message: string): void {
  console.error(`[sudo-mcp] ${message}`);
}

export function logError(message: string, error?: Error): void {
  console.error(`[sudo-mcp ERROR] ${message}`);
  if (error) {
    console.error(error.stack || error.message);
  }
}

export function logDebug(message: string): void {
  if (process.env.DEBUG) {
    console.error(`[sudo-mcp DEBUG] ${message}`);
  }
}
