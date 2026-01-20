import * as fs from 'fs';
import * as path from 'path';
import { logError } from '../utils/logger';

export interface BlocklistConfig {
  exactMatches: string[];
  regexPatterns: string[];
  blockedBinaries: string[];
}

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
}

export class Blocklist {
  private config: BlocklistConfig;

  constructor(configPath: string) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      this.config = JSON.parse(configContent);
    } catch (error) {
      logError('Failed to load blocklist config, using empty blocklist', error as Error);
      this.config = {
        exactMatches: [],
        regexPatterns: [],
        blockedBinaries: []
      };
    }
  }

  validate(command: string): ValidationResult {
    const trimmedCommand = command.trim();

    // Check exact matches (case-insensitive)
    for (const blocked of this.config.exactMatches) {
      if (trimmedCommand.toLowerCase() === blocked.toLowerCase()) {
        return {
          allowed: false,
          reason: `Command exactly matches blocked pattern: "${blocked}"`
        };
      }
    }

    // Check regex patterns
    for (const pattern of this.config.regexPatterns) {
      try {
        const regex = new RegExp(pattern);
        if (regex.test(trimmedCommand)) {
          return {
            allowed: false,
            reason: `Command matches blocked regex pattern: ${pattern}`
          };
        }
      } catch (error) {
        logError(`Invalid regex pattern in blocklist: ${pattern}`, error as Error);
      }
    }

    // Check blocked binaries (command starts with binary name)
    const firstWord = trimmedCommand.split(/\s+/)[0];
    const binaryName = path.basename(firstWord);
    
    for (const blocked of this.config.blockedBinaries) {
      if (binaryName === blocked) {
        return {
          allowed: false,
          reason: `Command uses blocked binary: ${blocked}`
        };
      }
    }

    return { allowed: true };
  }
}
