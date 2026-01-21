// Popup JavaScript

document.addEventListener('DOMContentLoaded', async () => {
  const bridgeStatusEl = document.getElementById('bridgeStatus');
  const pendingCountEl = document.getElementById('pendingCount');
  const openApprovalBtn = document.getElementById('openApproval');
  const resetTokenLink = document.getElementById('resetToken');
  
  // Get queue from background
  try {
    const response = await chrome.runtime.sendMessage({ type: 'get_queue' });
    const pendingCount = response.commands.filter(c => c.status === 'pending').length;
    pendingCountEl.textContent = pendingCount;
    
    // Assume connected if we have commands or badge set
    bridgeStatusEl.textContent = 'Connected';
    bridgeStatusEl.classList.add('connected');
  } catch (error) {
    bridgeStatusEl.textContent = 'Disconnected';
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
