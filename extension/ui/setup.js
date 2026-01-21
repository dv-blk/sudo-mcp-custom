// Setup page JavaScript

const form = document.getElementById('setupForm');
const tokenInput = document.getElementById('token');
const errorDiv = document.getElementById('error');
const successDiv = document.getElementById('success');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const token = tokenInput.value.trim();
  
  if (!token) {
    showError('Please enter a token');
    return;
  }
  
  if (token.length !== 32) {
    showError('Invalid token format (should be 32 characters)');
    return;
  }
  
  // Save token
  await chrome.storage.local.set({ token });
  
  // Show success
  showSuccess();
  
  // Close this tab and let background script connect
  setTimeout(() => {
    window.close();
  }, 1500);
});

function showError(message) {
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
  successDiv.style.display = 'none';
}

function showSuccess() {
  successDiv.style.display = 'block';
  errorDiv.style.display = 'none';
}
