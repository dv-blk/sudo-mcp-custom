import { spawn } from 'child_process';
import * as net from 'net';
import * as path from 'path';
import { log } from '../utils/logger';

/**
 * Check if a port is listening
 */
export function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(1000);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.connect(port, 'localhost');
  });
}

/**
 * Wait for a port to be listening
 */
export function waitForPort(port: number, options: { timeout?: number; interval?: number } = {}): Promise<void> {
  const timeout = options.timeout || 10000;
  const interval = options.interval || 500;
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const check = async () => {
      const listening = await isPortListening(port);
      
      if (listening) {
        resolve();
        return;
      }
      
      if (Date.now() - startTime >= timeout) {
        reject(new Error(`Timeout waiting for port ${port}`));
        return;
      }
      
      setTimeout(check, interval);
    };
    
    check();
  });
}

/**
 * Start the bridge daemon
 */
export async function startBridge(): Promise<void> {
  log('Starting bridge daemon...');
  
  // Get path to the built index.js
  const indexPath = path.join(__dirname, '../../build/index.js');
  
  // Spawn bridge process (detached, so it continues after parent exits)
  const child = spawn('node', [indexPath, '--bridge'], {
    detached: true,
    stdio: 'ignore', // Don't pipe stdio
  });
  
  // Unreference so parent can exit
  child.unref();
  
  log(`Bridge daemon started (PID ${child.pid})`);
  
  // Wait for bridge to be ready
  try {
    await waitForPort(9999, { timeout: 5000 });
    log('Bridge is ready');
  } catch (error) {
    throw new Error('Bridge failed to start within timeout');
  }
}

/**
 * Check if bridge is running
 */
export async function isBridgeRunning(): Promise<boolean> {
  return await isPortListening(9999);
}
