import { QueuedCommand } from '../queue/command-queue';

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * Render a single command card
 */
export function renderCommandCard(cmd: QueuedCommand): string {
  const escapedCommand = escapeHtml(cmd.command);
  const timestamp = cmd.queuedAt.toLocaleTimeString();

  switch (cmd.status) {
    case 'pending':
      return `
        <div class="command-card pending" id="cmd-${cmd.id}">
          <div class="command-row">
            <div class="command-info">
              <div class="command-meta">
                <span class="timestamp">${timestamp}</span>
                <span class="status-badge pending">Pending</span>
              </div>
              <pre class="command-text">${escapedCommand}</pre>
            </div>
            <div class="command-actions">
              <button class="btn btn-primary" hx-post="/execute/${cmd.id}" hx-swap="none">Execute</button>
              <button class="btn btn-secondary" hx-post="/decline/${cmd.id}" hx-swap="none">Decline</button>
            </div>
          </div>
        </div>
      `;

    case 'executing':
      return `
        <div class="command-card executing" id="cmd-${cmd.id}">
          <div class="command-row">
            <div class="command-info">
              <div class="command-meta">
                <span class="timestamp">${timestamp}</span>
                <span class="status-badge executing">Executing...</span>
              </div>
              <pre class="command-text">${escapedCommand}</pre>
              <div class="spinner">⏳ Running...</div>
            </div>
          </div>
        </div>
      `;

    case 'completed':
    case 'failed': {
      const result = cmd.result;
      const isSuccess = result?.success ?? false;
      const icon = isSuccess ? '✓' : '✗';
      const statusClass = isSuccess ? 'success' : 'error';
      const statusText = isSuccess ? 'Completed' : 'Failed';
      
      return `
        <div class="command-card completed ${statusClass}" id="cmd-${cmd.id}">
          <div class="command-row">
            <div class="command-info">
              <div class="command-meta">
                <span class="timestamp">${timestamp}</span>
                <span class="status-badge ${statusClass}">${icon} ${statusText}</span>
              </div>
              <pre class="command-text">${escapedCommand}</pre>
              <div class="result-summary">
                Exit code: ${result?.exitCode ?? 'unknown'}
                ${result?.duration ? ` | Duration: ${formatDuration(result.duration)}` : ''}
                ${result?.timedOut ? ' | <strong>TIMED OUT</strong>' : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    case 'declined':
      return `
        <div class="command-card declined" id="cmd-${cmd.id}">
          <div class="command-row">
            <div class="command-info">
              <div class="command-meta">
                <span class="timestamp">${timestamp}</span>
                <span class="status-badge declined">Declined</span>
              </div>
              <pre class="command-text">${escapedCommand}</pre>
            </div>
          </div>
        </div>
      `;

    default:
      return '';
  }
}

/**
 * Render the queue (all commands)
 */
export function renderQueue(commands: QueuedCommand[]): string {
  const pending = commands.filter(c => c.status === 'pending');

  let html = '';

  // Show "Execute All" button if there are multiple pending commands
  if (pending.length > 1) {
    html += `
      <div class="batch-actions">
        <button class="btn btn-primary btn-large" hx-post="/execute-all" hx-swap="none">
          Execute All (${pending.length})
        </button>
        <button class="btn btn-secondary btn-large" hx-post="/decline-all" hx-swap="none">
          Decline All
        </button>
      </div>
    `;
  }

  // Render commands in chronological order (keep original order)
  html += commands.map(renderCommandCard).join('');

  // Show empty state if no commands
  if (commands.length === 0) {
    html = '<div class="empty-state">No pending commands. Waiting for requests...</div>';
  }

  return html;
}

/**
 * Render the full page
 */
export function renderFullPage(commands: QueuedCommand[]): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sudo MCP - Command Approval</title>
  <script src="/htmx.min.js"></script>
  <script src="/htmx-sse.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f5f5f5;
      padding: 20px;
      line-height: 1.6;
    }

    h1 {
      color: #333;
      margin-bottom: 20px;
      font-size: 24px;
    }

    #queue {
      max-width: 1200px;
      margin: 0 auto;
    }

    .command-card {
      background: white;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 8px;
      border-left: 4px solid #ccc;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .command-card.pending { border-left-color: #3b82f6; }
    .command-card.executing { border-left-color: #f59e0b; }
    .command-card.completed.success { border-left-color: #10b981; }
    .command-card.completed.error { border-left-color: #ef4444; }
    .command-card.declined { border-left-color: #6b7280; opacity: 0.7; }

    .command-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }

    .command-info {
      flex: 1;
      min-width: 0;
    }

    .command-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }

    .timestamp {
      font-size: 11px;
      color: #6b7280;
      white-space: nowrap;
    }

    .status-badge {
      padding: 2px 10px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }

    .status-badge.pending { background: #dbeafe; color: #1e40af; }
    .status-badge.executing { background: #fef3c7; color: #92400e; }
    .status-badge.success { background: #d1fae5; color: #065f46; }
    .status-badge.error { background: #fee2e2; color: #991b1b; }
    .status-badge.declined { background: #f3f4f6; color: #374151; }

    .command-text {
      background: #f9fafb;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      overflow-x: auto;
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .command-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }

    .btn {
      padding: 6px 14px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .btn:hover { opacity: 0.9; }
    
    .btn-primary {
      background: #3b82f6;
      color: white;
    }

    .btn-secondary {
      background: #6b7280;
      color: white;
    }

    .btn-large {
      padding: 10px 20px;
      font-size: 14px;
    }

    .batch-actions {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }

    .spinner {
      color: #f59e0b;
      font-size: 12px;
      margin-top: 4px;
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .result-summary {
      font-size: 11px;
      color: #6b7280;
      margin-top: 4px;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #9ca3af;
      font-size: 16px;
    }

    .htmx-request .btn {
      opacity: 0.6;
      cursor: wait;
    }
  </style>
</head>
<body>
  <h1>🔐 Sudo Command Approval</h1>
  <div id="queue" hx-ext="sse" sse-connect="/sse" sse-swap="queue">
    ${renderQueue(commands)}
  </div>
</body>
</html>`;
}
