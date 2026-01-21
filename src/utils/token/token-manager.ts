import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'sudo-mcp');
const TOKEN_FILE = path.join(CONFIG_DIR, 'bridge-token');

/**
 * Generate a random 32-character hex token
 */
export function generateToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Save token to file
 */
export function saveToken(token: string): void {
  ensureConfigDir();
  fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
}

/**
 * Load token from file, or generate and save a new one
 */
export function loadOrGenerateToken(): string {
  ensureConfigDir();
  
  if (fs.existsSync(TOKEN_FILE)) {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  }
  
  const token = generateToken();
  saveToken(token);
  return token;
}

/**
 * Display token setup instructions
 */
export function displayTokenInstructions(token: string): void {
  console.log('\n' + '='.repeat(70));
  console.log('FIRST-TIME SETUP: Chrome Extension Token');
  console.log('='.repeat(70));
  console.log('\nYour authentication token:');
  console.log('\n  ' + token);
  console.log('\nPlease copy this token and paste it into the Chrome extension');
  console.log('when prompted. This is a one-time setup.');
  console.log('\nToken saved to: ' + TOKEN_FILE);
  console.log('='.repeat(70) + '\n');
}

/**
 * Get the token file path
 */
export function getTokenFilePath(): string {
  return TOKEN_FILE;
}
