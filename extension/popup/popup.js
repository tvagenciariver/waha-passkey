document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const settingsBtn = document.getElementById('settingsBtn');
  const wahaStatusBadge = document.getElementById('wahaStatus');
  const bridgeToggle = document.getElementById('bridgeToggle');
  const tabsList = document.getElementById('tabsList');
  const eventLog = document.getElementById('eventLog');
  const clearLogBtn = document.getElementById('clearLogBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const openWaBtn = document.getElementById('openWaBtn');

  // Load state and logs on startup
  refreshState();

  // Event Listeners
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Display Extension ID and Handle Copy
  const extId = chrome.runtime.id;
  const extIdDisplay = document.getElementById('extIdDisplay');
  const copyIdBtn = document.getElementById('copyIdBtn');
  if (extIdDisplay) extIdDisplay.textContent = extId;
  
  if (copyIdBtn) {
    copyIdBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(extId).then(() => {
        const originalHtml = copyIdBtn.innerHTML;
        copyIdBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        setTimeout(() => copyIdBtn.innerHTML = originalHtml, 2000);
      });
    });
  }

  refreshBtn.addEventListener('click', () => {
    refreshState();
  });

  openWaBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://web.whatsapp.com/' });
  });

  bridgeToggle.addEventListener('change', (e) => {
    const isActive = e.target.checked;
    chrome.storage.local.set({ bridgeActive: isActive }, () => {
      chrome.runtime.sendMessage({ action: 'toggleBridge', active: isActive });
    });
  });

  clearLogBtn.addEventListener('click', () => {
    chrome.storage.local.set({ logs: [] }, () => {
      renderLogs([]);
    });
  });

  // Listen for real-time updates from background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'logAdded') {
      addLogEntry(message.log);
    } else if (message.action === 'stateUpdated') {
      refreshState();
    }
  });

  function refreshState() {
    chrome.storage.local.get(['bridgeActive', 'wahaConnected', 'logs', 'activeTabs'], (data) => {
      // Toggle state
      if (data.bridgeActive !== undefined) {
        bridgeToggle.checked = data.bridgeActive;
      }

      // WAHA Status
      updateWahaStatus(data.wahaConnected);

      // Tabs list
      renderTabs(data.activeTabs || {});

      // Logs
      renderLogs(data.logs || []);
    });

    // Also ask background script to do a fresh check
    chrome.runtime.sendMessage({ action: 'checkStatus' });
  }

  function updateWahaStatus(isConnected) {
    const textSpan = wahaStatusBadge.querySelector('.text');
    wahaStatusBadge.className = 'status-badge';
    
    if (isConnected === true) {
      wahaStatusBadge.classList.add('connected');
      textSpan.textContent = 'Connected';
    } else if (isConnected === false) {
      wahaStatusBadge.classList.add('error');
      textSpan.textContent = 'Disconnected';
    } else {
      textSpan.textContent = 'Checking...';
    }
  }

  function renderTabs(tabsObj) {
    const tabIds = Object.keys(tabsObj);
    
    if (tabIds.length === 0) {
      tabsList.innerHTML = '<div class="empty-state">No WhatsApp Web tabs open.</div>';
      return;
    }

    tabsList.innerHTML = '';
    tabIds.forEach(id => {
      const tab = tabsObj[id];
      const tabEl = document.createElement('div');
      tabEl.className = 'tab-item';
      
      const attachedClass = tab.attached ? 'attached' : '';
      const attachedText = tab.attached ? 'CDP Attached' : 'Unattached';
      
      tabEl.innerHTML = `
        <div class="tab-info">
          <img src="../icons/icon16.svg" class="tab-icon" />
          <span class="tab-title">Tab ID: ${id}</span>
        </div>
        <div class="tab-badge ${attachedClass}">${attachedText}</div>
      `;
      tabsList.appendChild(tabEl);
    });
  }

  function renderLogs(logs) {
    eventLog.innerHTML = '';
    logs.slice().reverse().forEach(log => {
      const logEl = createLogElement(log);
      eventLog.appendChild(logEl);
    });
  }

  function addLogEntry(log) {
    const logEl = createLogElement(log);
    eventLog.prepend(logEl);
    
    // Keep max items in UI
    if (eventLog.children.length > 50) {
      eventLog.lastChild.remove();
    }
  }

  function createLogElement(log) {
    const div = document.createElement('div');
    div.className = `log-entry log-${log.level || 'info'}`;
    
    const time = new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
    
    div.innerHTML = `<span class="log-time">[${time}]</span><span class="log-message">${escapeHtml(log.message)}</span>`;
    return div;
  }

  function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }
});
