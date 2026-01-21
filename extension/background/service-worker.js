// Background service worker for Sudo MCP Extension

const BRIDGE_URL = 'ws://localhost:9998';
const RECONNECT_INTERVAL = 5000; // 5 seconds
const PING_TIMEOUT = 35000; // 35 seconds - if no ping received, assume disconnected

let ws = null;
let reconnectTimer = null;
let pingTimeoutTimer = null;
let isAuthenticated = false;
let commandQueue = [];
let approvalTabId = null;
let savedToken = null; // Cache token to avoid repeated storage reads

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Sudo MCP Extension installed');
  checkTokenAndConnect();
});

// Start on startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Sudo MCP Extension starting up');
  checkTokenAndConnect();
});

// IMPORTANT: Also connect when service worker starts (after being idle)
// This ensures we reconnect even if browser wasn't restarted
console.log('Service worker started, checking connection...');
checkTokenAndConnect();

/**
 * Check if token exists and connect to bridge
 */
async function checkTokenAndConnect() {
  const { token } = await chrome.storage.local.get(['token']);
  
  if (!token) {
    console.log('No token found, opening setup page');
    chrome.tabs.create({ url: chrome.runtime.getURL('ui/setup.html') });
    return;
  }
  
  savedToken = token; // Cache the token
  connectToBridge(token);
}

/**
 * Connect to bridge WebSocket server
 */
function connectToBridge(token) {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    console.log('Already connected or connecting');
    return;
  }
  
  console.log('Connecting to bridge at', BRIDGE_URL);
  
  try {
    ws = new WebSocket(BRIDGE_URL);
    
    ws.onopen = () => {
      console.log('Connected to bridge, authenticating...');
      ws.send(JSON.stringify({
        type: 'auth',
        token: token
      }));
      
      // Start ping timeout monitoring
      resetPingTimeout();
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleBridgeMessage(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
      console.log('Disconnected from bridge');
      isAuthenticated = false;
      clearPingTimeout();
      scheduleReconnect(token);
    };
  } catch (error) {
    console.error('Failed to create WebSocket:', error);
    scheduleReconnect(token);
  }
}

/**
 * Schedule reconnection attempt
 */
function scheduleReconnect(token) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  
  reconnectTimer = setTimeout(() => {
    console.log('Attempting to reconnect...');
    connectToBridge(token);
  }, RECONNECT_INTERVAL);
}

/**
 * Reset ping timeout timer
 */
function resetPingTimeout() {
  if (pingTimeoutTimer) {
    clearTimeout(pingTimeoutTimer);
  }
  
  pingTimeoutTimer = setTimeout(() => {
    console.warn('No ping received from bridge for 35s, assuming disconnected');
    if (ws) {
      ws.close();
    }
  }, PING_TIMEOUT);
}

/**
 * Clear ping timeout timer
 */
function clearPingTimeout() {
  if (pingTimeoutTimer) {
    clearTimeout(pingTimeoutTimer);
    pingTimeoutTimer = null;
  }
}

/**
 * Handle messages from bridge
 */
function handleBridgeMessage(message) {
  console.log('Received message:', message.type);
  
  switch (message.type) {
    case 'ping':
      // Respond to ping to keep connection alive
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
      // Reset ping timeout since we received a ping
      resetPingTimeout();
      break;
      
    case 'authenticated':
      isAuthenticated = true;
      console.log('Authenticated with bridge');
      updateBadge();
      break;
      
    case 'error':
      console.error('Bridge error:', message.error);
      if (message.error === 'Invalid token') {
        chrome.storage.local.remove(['token']);
        chrome.tabs.create({ url: chrome.runtime.getURL('ui/setup.html') });
      }
      break;
      
    case 'command_queued':
      handleCommandQueued(message);
      break;
      
    case 'command_status':
      handleCommandStatus(message);
      break;
      
    case 'mcp_disconnected':
      console.log('MCP disconnected:', message.serverId);
      break;
  }
}

/**
 * Handle new command queued
 */
function handleCommandQueued(message) {
  const command = {
    ...message.command,
    meta: message._meta
  };
  
  commandQueue.push(command);
  updateBadge();
  showNotification(command);
  openOrFocusApprovalTab();
  
  // Send to approval tab if open
  if (approvalTabId) {
    chrome.tabs.sendMessage(approvalTabId, {
      type: 'command_added',
      command: command
    }).catch(() => {
      // Tab might not be ready, that's okay
    });
  }
}

/**
 * Handle command status update
 */
function handleCommandStatus(message) {
  const cmd = commandQueue.find(c => c.id === message.command.id);
  if (cmd) {
    Object.assign(cmd, message.command);
  }
  
  updateBadge();
  
  // Send to approval tab if open
  if (approvalTabId) {
    chrome.tabs.sendMessage(approvalTabId, {
      type: 'command_updated',
      command: message.command
    }).catch(() => {
      // Tab might not be ready
    });
  }
}

/**
 * Update extension badge
 */
function updateBadge() {
  const pendingCount = commandQueue.filter(c => c.status === 'pending').length;
  
  if (pendingCount > 0) {
    chrome.action.setBadgeText({ text: String(pendingCount) });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }); // Red for attention
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

/**
 * Flash badge for attention
 */
let flashTimer = null;
function flashBadge() {
  let count = 0;
  const colors = ['#ef4444', '#f59e0b']; // Red and orange
  
  if (flashTimer) clearInterval(flashTimer);
  
  flashTimer = setInterval(() => {
    chrome.action.setBadgeBackgroundColor({ 
      color: colors[count % colors.length] 
    });
    count++;
    
    if (count > 6) { // Flash 3 times
      clearInterval(flashTimer);
      flashTimer = null;
      updateBadge(); // Reset to normal
    }
  }, 300);
}

/**
 * Show notification for new command
 */
async function showNotification(command) {
  const meta = command.meta || {};
  const title = meta.isSSH ? 
    `🔐 Sudo command (SSH from ${meta.hostname})` : 
    `🔐 Sudo command (PID ${meta.pid})`;
  
  // Always show notification with sound
  chrome.notifications.create(`sudo-cmd-${command.id}`, {
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: title,
    message: command.command,
    priority: 2,
    requireInteraction: true, // Notification stays until dismissed
    silent: false // Enable sound
  });
  
  // Flash the badge
  flashBadge();
}

/**
 * Open or focus approval tab
 */
async function openOrFocusApprovalTab() {
  // Check if approval tab is already open
  if (approvalTabId) {
    try {
      const tab = await chrome.tabs.get(approvalTabId);
      // Focus the window first, then activate the tab
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(approvalTabId, { active: true });
      console.log('Focused existing approval tab');
      return;
    } catch (error) {
      // Tab doesn't exist anymore
      console.log('Approval tab no longer exists, creating new one');
      approvalTabId = null;
    }
  }
  
  // Open new approval tab
  const tab = await chrome.tabs.create({
    url: chrome.runtime.getURL('ui/approval.html'),
    active: true // Make it the active tab
  });
  
  approvalTabId = tab.id;
  
  // Also focus the window
  if (tab.windowId) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
  
  console.log('Created new approval tab:', tab.id);
  
  // Listen for tab close
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === approvalTabId) {
      approvalTabId = null;
    }
  });
}

/**
 * Handle messages from approval tab
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get_queue') {
    sendResponse({ commands: commandQueue });
    return true;
  }
  
  if (message.type === 'get_connection_status') {
    const connected = ws && ws.readyState === WebSocket.OPEN && isAuthenticated;
    sendResponse({ 
      connected: connected,
      readyState: ws ? ws.readyState : null,
      isAuthenticated: isAuthenticated
    });
    return true;
  }
  
  if (message.type === 'approve') {
    approveCommand(message.commandId);
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === 'decline') {
    declineCommand(message.commandId);
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === 'clear_completed') {
    commandQueue = commandQueue.filter(c => 
      c.status === 'pending' || c.status === 'executing'
    );
    updateBadge();
    sendResponse({ success: true });
    return true;
  }
});

/**
 * Approve a command
 */
function approveCommand(commandId) {
  const command = commandQueue.find(c => c.id === commandId);
  if (!command || !command.meta) return;
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'approve',
      serverId: command.meta.serverId,
      commandId: commandId
    }));
  }
}

/**
 * Decline a command
 */
function declineCommand(commandId) {
  const command = commandQueue.find(c => c.id === commandId);
  if (!command || !command.meta) return;
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'decline',
      serverId: command.meta.serverId,
      commandId: commandId
    }));
  }
}

// Handle notification clicks
chrome.notifications.onClicked.addListener(() => {
  openOrFocusApprovalTab();
});
