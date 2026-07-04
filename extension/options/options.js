document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const wahaUrlInput = document.getElementById('wahaUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const toggleApiKeyBtn = document.getElementById('toggleApiKey');
  const autoAttachToggle = document.getElementById('autoAttach');
  const autoRespondToggle = document.getElementById('autoRespond');
  const saveBtn = document.getElementById('saveBtn');
  const saveStatus = document.getElementById('saveStatus');
  const testConnectionBtn = document.getElementById('testConnectionBtn');
  const connectionResult = document.getElementById('connectionResult');

  // Load saved settings
  chrome.storage.local.get({
    wahaUrl: 'https://waha3.whatscorporativo.com',
    apiKey: 'f0608f0cb67560962e65bbb0e1383676',
    autoAttach: true,
    autoRespond: true
  }, (items) => {
    wahaUrlInput.value = items.wahaUrl;
    apiKeyInput.value = items.apiKey;
    autoAttachToggle.checked = items.autoAttach;
    autoRespondToggle.checked = items.autoRespond;
  });

  // Toggle API key visibility
  toggleApiKeyBtn.addEventListener('click', () => {
    const type = apiKeyInput.getAttribute('type') === 'password' ? 'text' : 'password';
    apiKeyInput.setAttribute('type', type);
    
    // Update icon
    if (type === 'text') {
      toggleApiKeyBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      `;
    } else {
      toggleApiKeyBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      `;
    }
  });

  // Save settings
  saveBtn.addEventListener('click', () => {
    const wahaUrl = wahaUrlInput.value.trim().replace(/\/$/, ''); // Remove trailing slash
    const apiKey = apiKeyInput.value.trim();
    const autoAttach = autoAttachToggle.checked;
    const autoRespond = autoRespondToggle.checked;

    chrome.storage.local.set({
      wahaUrl,
      apiKey,
      autoAttach,
      autoRespond
    }, () => {
      // Notify background script about config change
      chrome.runtime.sendMessage({ action: 'configUpdated' });
      
      // Show status
      saveStatus.textContent = 'Settings saved successfully!';
      saveStatus.className = 'status-msg success show';
      setTimeout(() => {
        saveStatus.className = 'status-msg';
      }, 3000);
    });
  });

  // Test Connection
  testConnectionBtn.addEventListener('click', async () => {
    const url = wahaUrlInput.value.trim().replace(/\/$/, '');
    const apiKey = apiKeyInput.value.trim();
    
    if (!url) {
      showTestResult('Please enter a WAHA URL', 'error');
      return;
    }

    testConnectionBtn.disabled = true;
    testConnectionBtn.textContent = 'Testing...';
    connectionResult.style.display = 'none';

    try {
      const headers = {
        'Accept': 'application/json'
      };
      
      if (apiKey) {
        headers['X-Api-Key'] = apiKey;
      }

      // Trying to fetch sessions to test auth and connectivity
      const response = await fetch(`${url}/api/sessions`, {
        method: 'GET',
        headers
      });

      if (response.ok) {
        showTestResult('Connection successful! WAHA API is reachable and authenticated.', 'success');
      } else {
        showTestResult(`Connection failed: HTTP ${response.status} ${response.statusText}`, 'error');
      }
    } catch (error) {
      showTestResult(`Connection failed: ${error.message}`, 'error');
    } finally {
      testConnectionBtn.disabled = false;
      testConnectionBtn.textContent = 'Test Connection';
    }
  });

  function showTestResult(message, type) {
    connectionResult.textContent = message;
    connectionResult.className = `test-result ${type}`;
  }
});
