import { v4 as uuidv4 } from 'uuid';
import { ExecutionResult } from '../executor/sudo-executor';
import { logDebug } from '../utils/logger';

export type CommandStatus = 'pending' | 'executing' | 'completed' | 'declined' | 'failed';

export interface QueuedCommand {
  id: string;
  command: string;
  status: CommandStatus;
  queuedAt: Date;
  completedAt?: Date;
  result?: ExecutionResult;
}

type ChangeListener = (commands: QueuedCommand[]) => void;

export class CommandQueue {
  private commands: Map<string, QueuedCommand> = new Map();
  private changeListeners: ChangeListener[] = [];

  /**
   * Add a command to the queue
   */
  add(command: string): QueuedCommand {
    const queuedCommand: QueuedCommand = {
      id: uuidv4(),
      command,
      status: 'pending',
      queuedAt: new Date()
    };

    this.commands.set(queuedCommand.id, queuedCommand);
    logDebug(`Added command to queue: ${queuedCommand.id}`);
    
    this.notifyListeners();
    
    return queuedCommand;
  }

  /**
   * Update command status
   */
  updateStatus(id: string, status: CommandStatus, result?: ExecutionResult): void {
    const command = this.commands.get(id);
    if (!command) return;

    command.status = status;
    if (result) {
      command.result = result;
    }
    if (status === 'completed' || status === 'declined' || status === 'failed') {
      command.completedAt = new Date();
    }

    logDebug(`Updated command ${id}: status=${status}`);
    
    this.notifyListeners();
  }

  /**
   * Decline a command
   */
  decline(id: string): void {
    this.updateStatus(id, 'declined');
  }

  /**
   * Decline all pending commands
   */
  declineAll(): void {
    const pending = this.getPending();
    pending.forEach(cmd => this.decline(cmd.id));
  }

  /**
   * Get command by ID
   */
  getById(id: string): QueuedCommand | undefined {
    return this.commands.get(id);
  }

  /**
   * Get all commands
   */
  getAll(): QueuedCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get pending commands
   */
  getPending(): QueuedCommand[] {
    return this.getAll().filter(cmd => cmd.status === 'pending');
  }

  /**
   * Check if there are any active commands (pending or executing)
   */
  hasActiveCommands(): boolean {
    return this.getAll().some(cmd => 
      cmd.status === 'pending' || cmd.status === 'executing'
    );
  }

  /**
   * Clear all completed/declined/failed commands (manual)
   */
  clearCompleted(): void {
    const before = this.commands.size;
    
    for (const [id, cmd] of this.commands.entries()) {
      if (cmd.status === 'completed' || cmd.status === 'declined' || cmd.status === 'failed') {
        this.commands.delete(id);
      }
    }

    const after = this.commands.size;
    if (before !== after) {
      logDebug(`Cleared ${before - after} completed commands from queue`);
      this.notifyListeners();
    }
  }

  /**
   * Register a change listener
   */
  onChange(callback: ChangeListener): void {
    this.changeListeners.push(callback);
  }

  /**
   * Unregister a change listener
   */
  offChange(callback: ChangeListener): void {
    this.changeListeners = this.changeListeners.filter(cb => cb !== callback);
  }

  /**
   * Notify all listeners of queue changes
   */
  private notifyListeners(): void {
    const commands = this.getAll();
    logDebug(`Notifying ${this.changeListeners.length} listeners of queue change (${commands.length} commands)`);
    this.changeListeners.forEach(listener => {
      try {
        listener(commands);
      } catch (error) {
        // Ignore listener errors
      }
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.changeListeners = [];
  }
}
