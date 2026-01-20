/**
 * Simple logger that outputs to stderr (MCP compatible) and to file
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = '/tmp/sudo-mcp-server.log';

function writeLog(level: string, message: string, error?: Error): void {
  const timestamp = new Date().toISOString();
  let logLine = `${timestamp} [${level}] ${message}\n`;
  
  if (error) {
    logLine += `${timestamp} [${level}] ${error.stack || error.message}\n`;
  }
  
  // Write to stderr (for MCP)
  console.error(`[sudo-mcp] ${message}`);
  if (error) {
    console.error(error.stack || error.message);
  }
  
  // Write to file
  try {
    fs.appendFileSync(LOG_FILE, logLine);
  } catch (e) {
    // Ignore file write errors
  }
}

export function log(message: string): void {
  writeLog('INFO', message);
}

export function logError(message: string, error?: Error): void {
  writeLog('ERROR', message, error);
}

export function logDebug(message: string): void {
  writeLog('DEBUG', message);
}
