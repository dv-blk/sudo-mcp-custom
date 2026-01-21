// Popup JavaScript

document.addEventListener('DOMContentLoaded', async () => {
  const bridgeStatusEl = document.getElementById('bridgeStatus');
  const pendingCountEl = document.getElementById('pendingCount');
  const openApprovalBtn = document.getElementById('openApproval');
  const resetTokenLink = document.getElementById('resetToken');
  
  // Get connection status and queue from background
  try {
    const statusResponse = await chrome.runtime.sendMessage({ type: 'get_connection_status' });
    const queueResponse = await chrome.runtime.sendMessage({ type: 'get_queue' });
    
    const pendingCount = queueResponse.commands.filter(c => c.status === 'pending').length;
    pendingCountEl.textContent = pendingCount;
    
    // Update connection status
    if (statusResponse.connected) {
      bridgeStatusEl.textContent = 'Connected';
      bridgeStatusEl.classList.add('connected');
      bridgeStatusEl.classList.remove('disconnected');
    } else {
      bridgeStatusEl.textContent = 'Disconnected';
      bridgeStatusEl.classList.add('disconnected');
      bridgeStatusEl.classList.remove('connected');
    }
  } catch (error) {
    console.error('Failed to get status:', error);
    bridgeStatusEl.textContent = 'Error';
    bridgeStatusEl.classList.add('disconnected');
  }
  
  // Open approval tab
  openApprovalBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('ui/approval.html') });
    window.close();
  });
  
  // Reset token
  resetTokenLink.addEventListener('click', async (e) => {
    e.preventDefault();
    if (confirm('Are you sure you want to reset the token? You will need to re-authenticate.')) {
      await chrome.storage.local.remove('token');
      chrome.tabs.create({ url: chrome.runtime.getURL('ui/setup.html') });
      window.close();
    }
  });
});
