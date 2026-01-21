// Approval tab JavaScript

let commands = [];
let originalTitle = 'Sudo MCP - Command Approval';
let titleFlashInterval = null;
let notificationSound = null;

// Create notification sound
function createNotificationSound() {
  // Using Web Audio API to create a beep sound
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = 800; // Frequency in Hz
  oscillator.type = 'sine';
  
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
}

// Flash the page title to grab attention
function flashTitle() {
  if (document.hidden) { // Only flash if tab is not visible
    let isOriginal = true;
    if (titleFlashInterval) clearInterval(titleFlashInterval);
    
    titleFlashInterval = setInterval(() => {
      document.title = isOriginal ? '🔔 NEW SUDO COMMAND!' : originalTitle;
      isOriginal = !isOriginal;
    }, 1000);
    
    // Stop flashing when tab becomes visible
    const stopFlashing = () => {
      if (!document.hidden) {
        clearInterval(titleFlashInterval);
        titleFlashInterval = null;
        document.title = originalTitle;
        document.removeEventListener('visibilitychange', stopFlashing);
      }
    };
    document.addEventListener('visibilitychange', stopFlashing);
  }
}

// Play notification sound
function playNotificationSound() {
  try {
    createNotificationSound();
  } catch (error) {
    console.error('Failed to play notification sound:', error);
  }
}

// DOM elements
const queueEl = document.getElementById('queue');
const batchActionsEl = document.getElementById('batchActions');
const bottomActionsEl = document.getElementById('bottomActions');
const connectionIndicator = document.getElementById('connectionIndicator');
const connectionText = document.getElementById('connectionText');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Load initial queue from background
  try {
    const response = await chrome.runtime.sendMessage({ type: 'get_queue' });
    commands = response.commands || [];
    renderQueue();
    updateConnectionStatus(true);
  } catch (error) {
    console.error('Failed to load queue:', error);
    updateConnectionStatus(false);
  }
  
  // Listen for updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'command_added') {
      commands.push(message.command);
      renderQueue();
      scrollToBottom();
      
      // Grab attention!
      flashTitle();
      playNotificationSound();
      
      // Flash the command card
      setTimeout(() => {
        const card = document.getElementById(`cmd-${message.command.id}`);
        if (card) {
          card.classList.add('new-command-flash');
          setTimeout(() => card.classList.remove('new-command-flash'), 2000);
        }
      }, 100);
    } else if (message.type === 'command_updated') {
      const index = commands.findIndex(c => c.id === message.command.id);
      if (index !== -1) {
        commands[index] = { ...commands[index], ...message.command };
        renderQueue();
      }
    }
  });
  
  // Batch actions
  document.getElementById('executeAll').addEventListener('click', executeAll);
  document.getElementById('declineAll').addEventListener('click', declineAll);
  document.getElementById('clearCompleted').addEventListener('click', clearCompleted);
});

/**
 * Render the entire queue
 */
function renderQueue() {
  const pending = commands.filter(c => c.status === 'pending');
  const completed = commands.filter(c => 
    c.status === 'completed' || c.status === 'failed' || c.status === 'declined'
  );
  
  // Show/hide batch actions
  batchActionsEl.style.display = pending.length > 1 ? 'flex' : 'none';
  const executeAllBtn = document.getElementById('executeAll');
  const declineAllBtn = document.getElementById('declineAll');
  executeAllBtn.textContent = `Execute All (${pending.length})`;
  declineAllBtn.textContent = `Decline All`;
  
  // Show/hide clear button
  bottomActionsEl.style.display = completed.length > 0 ? 'flex' : 'none';
  const clearBtn = document.getElementById('clearCompleted');
  clearBtn.textContent = `Clear Completed (${completed.length})`;
  
  // Render commands
  if (commands.length === 0) {
    queueEl.innerHTML = '<div class="empty-state">Waiting for commands...</div>';
    return;
  }
  
  queueEl.innerHTML = commands.map(renderCommandCard).join('');
  
  // Attach event listeners
  commands.forEach(cmd => {
    const executeBtn = document.getElementById(`execute-${cmd.id}`);
    const declineBtn = document.getElementById(`decline-${cmd.id}`);
    
    if (executeBtn) {
      executeBtn.addEventListener('click', () => executeCommand(cmd.id));
    }
    if (declineBtn) {
      declineBtn.addEventListener('click', () => declineCommand(cmd.id));
    }
  });
}

/**
 * Render a single command card
 */
function renderCommandCard(cmd) {
  const escapedCommand = escapeHtml(cmd.command);
  const timestamp = new Date(cmd.queuedAt).toLocaleTimeString();
  const meta = cmd.meta || {};
  
  // Build source info string
  let sourceInfo = '';
  if (meta.pid && meta.cwd) {
    sourceInfo = `PID ${meta.pid} • ${meta.cwd}`;
    if (meta.isSSH) {
      sourceInfo += ' <span class="ssh-tag">SSH</span>';
    }
  }
  
  switch (cmd.status) {
    case 'pending':
      return `
        <div class="command-card pending" id="cmd-${cmd.id}">
          <div class="command-row">
            <div class="command-info">
              <div class="command-meta">
                <span class="timestamp">${timestamp}</span>
                ${sourceInfo ? `<span class="source-info">${sourceInfo}</span>` : ''}
                <span class="status-badge pending">Pending</span>
              </div>
              <pre class="command-text">${escapedCommand}</pre>
            </div>
            <div class="command-actions">
              <button class="btn btn-success" id="execute-${cmd.id}">Execute</button>
              <button class="btn btn-danger" id="decline-${cmd.id}">Decline</button>
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
                ${sourceInfo ? `<span class="source-info">${sourceInfo}</span>` : ''}
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
      const result = cmd.result || {};
      const isSuccess = result.success ?? false;
      const icon = isSuccess ? '✓' : '✗';
      const statusClass = isSuccess ? 'success' : 'error';
      const statusText = isSuccess ? 'Completed' : 'Failed';
      
      let outputHtml = '';
      if (result.stdout) {
        outputHtml += `
          <div class="output-section">
            <div class="output-label">STDOUT:</div>
            <pre class="output-text stdout">${escapeHtml(result.stdout)}</pre>
          </div>
        `;
      }
      if (result.stderr) {
        outputHtml += `
          <div class="output-section">
            <div class="output-label">STDERR:</div>
            <pre class="output-text stderr">${escapeHtml(result.stderr)}</pre>
          </div>
        `;
      }
      
      return `
        <div class="command-card completed ${statusClass}" id="cmd-${cmd.id}">
          <div class="command-row">
            <div class="command-info">
              <div class="command-meta">
                <span class="timestamp">${timestamp}</span>
                ${sourceInfo ? `<span class="source-info">${sourceInfo}</span>` : ''}
                <span class="status-badge ${statusClass}">${icon} ${statusText}</span>
              </div>
              <pre class="command-text">${escapedCommand}</pre>
              <div class="result-summary">
                Exit code: ${result.exitCode ?? 'unknown'}
                ${result.duration ? ` | Duration: ${formatDuration(result.duration)}` : ''}
                ${result.timedOut ? ' | <strong>TIMED OUT</strong>' : ''}
              </div>
              ${outputHtml}
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
                ${sourceInfo ? `<span class="source-info">${sourceInfo}</span>` : ''}
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
 * Execute a command
 */
async function executeCommand(commandId) {
  await chrome.runtime.sendMessage({
    type: 'approve',
    commandId
  });
  
  // Update local state
  const cmd = commands.find(c => c.id === commandId);
  if (cmd) {
    cmd.status = 'executing';
    renderQueue();
  }
}

/**
 * Decline a command
 */
async function declineCommand(commandId) {
  await chrome.runtime.sendMessage({
    type: 'decline',
    commandId
  });
  
  // Update local state
  const cmd = commands.find(c => c.id === commandId);
  if (cmd) {
    cmd.status = 'declined';
    renderQueue();
  }
}

/**
 * Execute all pending commands
 */
async function executeAll() {
  const pending = commands.filter(c => c.status === 'pending');
  for (const cmd of pending) {
    await executeCommand(cmd.id);
  }
}

/**
 * Decline all pending commands
 */
async function declineAll() {
  const pending = commands.filter(c => c.status === 'pending');
  for (const cmd of pending) {
    await declineCommand(cmd.id);
  }
}

/**
 * Clear completed commands
 */
async function clearCompleted() {
  await chrome.runtime.sendMessage({
    type: 'clear_completed'
  });
  
  commands = commands.filter(c => 
    c.status === 'pending' || c.status === 'executing'
  );
  renderQueue();
}

/**
 * Update connection status indicator
 */
function updateConnectionStatus(connected) {
  if (connected) {
    connectionIndicator.classList.add('connected');
    connectionText.textContent = 'Connected to Bridge';
  } else {
    connectionIndicator.classList.remove('connected');
    connectionText.textContent = 'Disconnected';
  }
}

/**
 * Scroll to bottom
 */
function scrollToBottom() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
      });
    });
  });
}

/**
 * Escape HTML
 */
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Format duration
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}
