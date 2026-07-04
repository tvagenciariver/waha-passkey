/* ============================================================
   WAHA Passkey Manager — Application Logic
   ============================================================ */

// ---- Configuration ----
const DEFAULT_CONFIG = {
  wahaUrl: 'https://waha3.whatscorporativo.com',
  apiKey: 'f0608f0cb67560962e65bbb0e1383676',
  engine: 'GOWS',
  refreshInterval: 5, // seconds
  qrRefreshInterval: 15, // seconds
  extensionId: '', // Add extension ID here
};

// ============================================================
//  WahaAPI — REST API Client
// ============================================================
class WahaAPI {
  constructor(config) {
    this.baseUrl = config.wahaUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
  }

  /** Build headers for every request */
  get headers() {
    return {
      'Content-Type': 'application/json',
      'X-Api-Key': this.apiKey,
    };
  }

  /** Generic fetch wrapper with error handling */
  async request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const config = {
      headers: this.headers,
      ...options,
    };

    try {
      const response = await fetch(url, config);
      if (!response.ok) {
        let errorBody = '';
        try { errorBody = await response.text(); } catch {}
        throw new Error(`HTTP ${response.status}: ${errorBody || response.statusText}`);
      }
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await response.json();
      }
      if (contentType.includes('image/')) {
        return await response.blob();
      }
      return await response.text();
    } catch (err) {
      if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
        throw new Error('Network error — unable to reach WAHA server. Check URL and CORS settings.');
      }
      throw err;
    }
  }

  // ---- Server ----
  async getVersion() {
    return this.request('/api/server/version');
  }

  // ---- Sessions ----
  async getSessions() {
    return this.request('/api/sessions');
  }

  async createSession(name, engine = 'GOWS', start = true) {
    return this.request('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ name, config: { engine }, start }),
    });
  }

  async startSession(name) {
    return this.request(`/api/sessions/${encodeURIComponent(name)}/start`, {
      method: 'POST',
    });
  }

  async stopSession(name) {
    return this.request(`/api/sessions/${encodeURIComponent(name)}/stop`, {
      method: 'POST',
    });
  }

  async restartSession(name) {
    return this.request(`/api/sessions/${encodeURIComponent(name)}/restart`, {
      method: 'POST',
    });
  }

  async deleteSession(name) {
    return this.request(`/api/sessions/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  }

  // ---- Auth / QR ----
  getQRUrl(name) {
    return `${this.baseUrl}/api/${encodeURIComponent(name)}/auth/qr?format=image&t=${Date.now()}`;
  }

  getQRHeaders() {
    return { 'X-Api-Key': this.apiKey };
  }

  async getQR(name) {
    const url = `${this.baseUrl}/api/${encodeURIComponent(name)}/auth/qr?format=image&t=${Date.now()}`;
    const res = await fetch(url, { headers: { 'X-Api-Key': this.apiKey } });
    if (!res.ok) throw new Error(`QR fetch failed: ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  async requestCode(name, phone) {
    return this.request(`/api/${encodeURIComponent(name)}/auth/request-code`, {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: phone }),
    });
  }

  // ---- Passkey (WAHA 2026.6.1+) ----
  async getPasskeyChallenge(name) {
    return this.request(`/api/${encodeURIComponent(name)}/auth/passkey`);
  }

  async sendPasskeyAssertion(name, assertion) {
    return this.request(`/api/${encodeURIComponent(name)}/auth/passkey`, {
      method: 'POST',
      body: JSON.stringify(assertion),
    });
  }

  // ---- Screenshot ----
  async getScreenshot(name) {
    const url = `${this.baseUrl}/api/screenshot?session=${encodeURIComponent(name)}&t=${Date.now()}`;
    const res = await fetch(url, { headers: { 'X-Api-Key': this.apiKey } });
    if (!res.ok) throw new Error(`Screenshot failed: ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  /** Update config (used by settings) */
  updateConfig(config) {
    this.baseUrl = config.wahaUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
  }
}

// ============================================================
//  EventLog — Timeline Log Manager
// ============================================================
class EventLog {
  constructor() {
    this.events = [];
    this.maxEvents = 200;
    this.container = document.getElementById('event-timeline');
    this.countEl = document.getElementById('event-count');
  }

  /**
   * Add an event
   * @param {'success'|'error'|'warning'|'info'} type
   * @param {string} message
   */
  add(type, message) {
    const event = {
      type,
      message,
      timestamp: new Date().toISOString(),
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    };
    this.events.unshift(event);
    if (this.events.length > this.maxEvents) this.events.pop();
    this.render();
  }

  clear() {
    this.events = [];
    this.render();
  }

  exportJSON() {
    const blob = new Blob([JSON.stringify(this.events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `waha-events-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  render() {
    this.countEl.textContent = this.events.length;

    if (this.events.length === 0) {
      this.container.innerHTML = '<div class="event-empty"><p>No events yet. Actions will be logged here.</p></div>';
      return;
    }

    const html = this.events.map((e, i) => {
      const time = new Date(e.timestamp);
      const timeStr = time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const showLine = i < this.events.length - 1;
      return `
        <div class="event-item">
          <div class="event-dot-col">
            <span class="event-dot dot-${e.type}"></span>
            ${showLine ? '<span class="event-line"></span>' : ''}
          </div>
          <div class="event-content">
            <p class="event-message">${this.escapeHtml(e.message)}</p>
            <span class="event-time">${timeStr}</span>
          </div>
        </div>`;
    }).join('');

    this.container.innerHTML = html;
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// ============================================================
//  UIManager — DOM Manipulation & Modals & Toasts
// ============================================================
class UIManager {
  constructor() {
    this.activeModal = null;
    this.setupModals();
  }

  // ---- Modals ----
  setupModals() {
    // Close buttons
    document.querySelectorAll('.modal-close, [data-modal]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modalId = e.currentTarget.dataset.modal || e.currentTarget.closest('.modal-overlay')?.id;
        if (modalId) this.closeModal(modalId);
      });
    });

    // Click overlay to close
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeModal(overlay.id);
      });
    });
  }

  openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('active');
    el.setAttribute('aria-hidden', 'false');
    this.activeModal = id;
    document.body.style.overflow = 'hidden';
  }

  closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
    el.setAttribute('aria-hidden', 'true');
    if (this.activeModal === id) {
      this.activeModal = null;
      document.body.style.overflow = '';
    }
  }

  closeAllModals() {
    document.querySelectorAll('.modal-overlay.active').forEach(m => {
      this.closeModal(m.id);
    });
  }

  // ---- Toasts ----
  toast(type, title, message = '', duration = 4000) {
    const container = document.getElementById('toast-container');
    const iconMap = {
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span class="toast-icon toast-${type}">${iconMap[type] || iconMap.info}</span>
      <div class="toast-body">
        <div class="toast-title">${this.escapeHtml(title)}</div>
        ${message ? `<div class="toast-message">${this.escapeHtml(message)}</div>` : ''}
      </div>
      <button class="toast-close" aria-label="Dismiss">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>`;

    toast.querySelector('.toast-close').addEventListener('click', () => this.removeToast(toast));
    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => this.removeToast(toast), duration);
    }

    return toast;
  }

  removeToast(el) {
    if (!el || !el.parentNode) return;
    el.classList.add('removing');
    setTimeout(() => el.remove(), 300);
  }

  // ---- Connection Status ----
  setConnectionStatus(status) {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    dot.className = 'status-dot';

    switch (status) {
      case 'connected':
        dot.classList.add('connected');
        text.textContent = 'Connected';
        break;
      case 'disconnected':
        dot.classList.add('disconnected');
        text.textContent = 'Disconnected';
        break;
      default:
        dot.classList.add('connecting');
        text.textContent = 'Connecting…';
    }
  }

  // ---- Server Stats ----
  setServerStats(data) {
    const setInner = (id, html) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    };

    setInner('stat-status', `<span class="online">● Online</span>`);
    setInner('stat-version', data.version || '—');
    setInner('stat-engine', data.engine || DEFAULT_CONFIG.engine);
    setInner('stat-sessions', typeof data.sessionCount === 'number' ? data.sessionCount : '—');
  }

  setServerOffline() {
    const skeleton = '<span class="offline">● Offline</span>';
    document.getElementById('stat-status').innerHTML = skeleton;
  }

  // ---- Sessions Grid ----
  renderSessions(sessions, handlers) {
    const grid = document.getElementById('sessions-grid');
    const empty = document.getElementById('empty-state');

    // Remove skeletons
    document.querySelectorAll('.skeleton-card').forEach(el => el.remove());

    if (!sessions || sessions.length === 0) {
      grid.innerHTML = '';
      empty.style.display = '';
      grid.appendChild(empty);
      return;
    }

    empty.style.display = 'none';

    // Build cards
    const fragment = document.createDocumentFragment();

    sessions.forEach((session, idx) => {
      const card = document.createElement('div');
      card.className = 'session-card';
      card.style.animationDelay = `${idx * 0.06}s`;
      card.dataset.session = session.name;

      const status = (session.status || 'STOPPED').toUpperCase();
      const badgeClass = this.getStatusBadgeClass(status);
      const engine = session.config?.engine || session.engine || '—';
      const meLabel = session.me?.id ? session.me.id.split('@')[0] : '';

      card.innerHTML = `
        <div class="session-card-header">
          <h3 class="session-name">${this.escapeHtml(session.name)}</h3>
          <span class="status-badge ${badgeClass}">
            <span class="badge-dot"></span>
            ${this.escapeHtml(status.replace('_', ' '))}
          </span>
        </div>
        <div class="session-meta">
          <div class="session-meta-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>
            Engine: <strong>${this.escapeHtml(engine)}</strong>
          </div>
          ${meLabel ? `
          <div class="session-meta-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            ${this.escapeHtml(meLabel)}
          </div>` : ''}
        </div>
        <div class="session-actions">
          ${status === 'STOPPED' || status === 'FAILED' ? `
            <button class="btn-icon btn-success" data-action="start" data-session="${this.escapeAttr(session.name)}" title="Start">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
          ` : ''}
          ${status === 'WORKING' || status === 'SCAN_QR_CODE' ? `
            <button class="btn-icon btn-warning" data-action="restart" data-session="${this.escapeAttr(session.name)}" title="Restart">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            </button>
            <button class="btn-icon btn-error" data-action="stop" data-session="${this.escapeAttr(session.name)}" title="Stop">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
            </button>
          ` : ''}
          <button class="btn-icon btn-error" data-action="delete" data-session="${this.escapeAttr(session.name)}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
          ${status === 'SCAN_QR_CODE' || status === 'WORKING' || status === 'STARTING' ? `
            <button class="btn-link" data-action="link" data-session="${this.escapeAttr(session.name)}" title="Link Device / QR Code">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><line x1="21" y1="14" x2="21" y2="17"/><line x1="14" y1="21" x2="17" y2="21"/></svg>
              Link Device
            </button>
          ` : ''}
        </div>`;

      fragment.appendChild(card);
    });

    grid.innerHTML = '';
    grid.appendChild(fragment);

    // Attach event handlers
    grid.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        const name = e.currentTarget.dataset.session;
        if (handlers[action]) handlers[action](name);
      });
    });
  }

  getStatusBadgeClass(status) {
    const map = {
      WORKING: 'badge-working',
      SCAN_QR_CODE: 'badge-scan',
      STOPPED: 'badge-stopped',
      STARTING: 'badge-starting',
      FAILED: 'badge-failed',
    };
    return map[status] || 'badge-stopped';
  }

  // ---- QR Modal ----
  showQRLoading() {
    document.getElementById('qr-loading').style.display = '';
    document.getElementById('qr-image').style.display = 'none';
    document.getElementById('qr-error').style.display = 'none';
  }

  showQRImage(src) {
    const img = document.getElementById('qr-image');
    img.src = src;
    img.style.display = '';
    document.getElementById('qr-loading').style.display = 'none';
    document.getElementById('qr-error').style.display = 'none';
  }

  showQRError() {
    document.getElementById('qr-error').style.display = '';
    document.getElementById('qr-loading').style.display = 'none';
    document.getElementById('qr-image').style.display = 'none';
  }

  setQRCountdown(seconds, total) {
    document.getElementById('qr-countdown').textContent = seconds;
    const bar = document.getElementById('timer-bar');
    bar.style.width = `${(seconds / total) * 100}%`;
  }

  setPasskeyStatus(text, connected = false) {
    document.getElementById('passkey-text').textContent = text;
    const dot = document.querySelector('.passkey-dot');
    dot.classList.toggle('connected', connected);
  }

  // ---- Utility ----
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}

// ============================================================
//  SessionManager — State & Orchestration
// ============================================================
class SessionManager {
  constructor(api, ui, log) {
    this.api = api;
    this.ui = ui;
    this.log = log;
    this.sessions = [];
    this.refreshTimer = null;
    this.qrTimer = null;
    this.qrCountdownTimer = null;
    this.qrSessionName = null;
    this.qrCountdown = DEFAULT_CONFIG.qrRefreshInterval;
    this.isConnected = false;
    this.pendingConfirm = null;
    this.isSigningPasskey = false; // Prevent overlapping signing attempts
  }

  // ---- Lifecycle ----
  async init() {
    this.ui.setConnectionStatus('connecting');
    this.log.add('info', 'Initializing — connecting to WAHA server…');

    await this.checkConnection();
    await this.loadSessions();
    this.startAutoRefresh();
  }

  startAutoRefresh() {
    this.stopAutoRefresh();
    const interval = (this.getConfig().refreshInterval || DEFAULT_CONFIG.refreshInterval) * 1000;
    this.refreshTimer = setInterval(() => this.loadSessions(true), interval);
  }

  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  getConfig() {
    try {
      const saved = localStorage.getItem('waha-config');
      return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  saveConfig(config) {
    localStorage.setItem('waha-config', JSON.stringify(config));
    this.api.updateConfig(config);
    this.stopAutoRefresh();
    this.startAutoRefresh();
  }

  // ---- Server Connection ----
  async checkConnection() {
    try {
      const version = await this.api.getVersion();
      this.isConnected = true;
      this.ui.setConnectionStatus('connected');
      this.ui.setServerStats({
        version: version.version || version.tier || JSON.stringify(version),
        engine: version.engine || DEFAULT_CONFIG.engine,
        sessionCount: '—',
      });
      this.log.add('success', `Connected to WAHA server (${version.version || 'unknown version'})`);
      return true;
    } catch (err) {
      this.isConnected = false;
      this.ui.setConnectionStatus('disconnected');
      this.ui.setServerOffline();
      this.log.add('error', `Connection failed: ${err.message}`);
      this.ui.toast('error', 'Connection Failed', err.message);
      return false;
    }
  }

  // ---- Sessions ----
  async loadSessions(silent = false) {
    try {
      const sessions = await this.api.getSessions();
      this.sessions = Array.isArray(sessions) ? sessions : [];

      if (!this.isConnected) {
        this.isConnected = true;
        this.ui.setConnectionStatus('connected');
        this.log.add('success', 'Reconnected to WAHA server');
      }

      // Update session count in stats
      const el = document.getElementById('stat-sessions');
      if (el) el.textContent = this.sessions.length;

      this.ui.renderSessions(this.sessions, {
        start: (n) => this.startSession(n),
        stop: (n) => this.stopSession(n),
        restart: (n) => this.restartSession(n),
        delete: (n) => this.confirmDelete(n),
        link: (n) => this.openLinkDevice(n),
      });

      // Check if currently linking and session changed status
      if (this.qrSessionName) {
        const qrSession = this.sessions.find(s => s.name === this.qrSessionName);
        if (qrSession && String(qrSession.status).toUpperCase() === 'WORKING') {
          this.ui.setPasskeyStatus('✓ Connected successfully!', true);
          this.stopQRPolling();
          this.log.add('success', `Session "${this.qrSessionName}" is now WORKING`);
          this.ui.toast('success', 'Session Connected', `${this.qrSessionName} linked successfully!`);
          // Auto-close modal after a moment
          setTimeout(() => this.ui.closeModal('modal-qr'), 2000);
          this.qrSessionName = null;
        }
      }
    } catch (err) {
      if (this.isConnected) {
        this.isConnected = false;
        this.ui.setConnectionStatus('disconnected');
        this.ui.setServerOffline();
        if (!silent) this.log.add('error', `Failed to load sessions: ${err.message}`);
      }
    }
  }

  async createSession(name, engine, start) {
    try {
      this.log.add('info', `Creating session "${name}" (engine: ${engine})…`);
      await this.api.createSession(name, engine, start);
      this.log.add('success', `Session "${name}" created successfully`);
      this.ui.toast('success', 'Session Created', `"${name}" is ready`);
      this.ui.closeModal('modal-create');
      await this.loadSessions();
    } catch (err) {
      this.log.add('error', `Failed to create session: ${err.message}`);
      this.ui.toast('error', 'Create Failed', err.message);
    }
  }

  async startSession(name) {
    try {
      this.log.add('info', `Starting session "${name}"…`);
      await this.api.startSession(name);
      this.log.add('success', `Session "${name}" started`);
      this.ui.toast('success', 'Session Started', name);
      await this.loadSessions();
    } catch (err) {
      this.log.add('error', `Failed to start "${name}": ${err.message}`);
      this.ui.toast('error', 'Start Failed', err.message);
    }
  }

  async stopSession(name) {
    try {
      this.log.add('info', `Stopping session "${name}"…`);
      await this.api.stopSession(name);
      this.log.add('success', `Session "${name}" stopped`);
      this.ui.toast('success', 'Session Stopped', name);
      await this.loadSessions();
    } catch (err) {
      this.log.add('error', `Failed to stop "${name}": ${err.message}`);
      this.ui.toast('error', 'Stop Failed', err.message);
    }
  }

  async restartSession(name) {
    try {
      this.log.add('info', `Restarting session "${name}"…`);
      await this.api.restartSession(name);
      this.log.add('success', `Session "${name}" restarted`);
      this.ui.toast('success', 'Session Restarted', name);
      await this.loadSessions();
    } catch (err) {
      this.log.add('error', `Failed to restart "${name}": ${err.message}`);
      this.ui.toast('error', 'Restart Failed', err.message);
    }
  }

  confirmDelete(name) {
    this.pendingConfirm = { action: 'delete', name };
    document.getElementById('confirm-message').textContent =
      `Are you sure you want to delete session "${name}"? This action cannot be undone.`;
    this.ui.openModal('modal-confirm');
  }

  async executeConfirm() {
    if (!this.pendingConfirm) return;
    const { action, name } = this.pendingConfirm;
    this.pendingConfirm = null;
    this.ui.closeModal('modal-confirm');

    if (action === 'delete') {
      try {
        this.log.add('warning', `Deleting session "${name}"…`);
        await this.api.deleteSession(name);
        this.log.add('success', `Session "${name}" deleted`);
        this.ui.toast('success', 'Session Deleted', name);
        await this.loadSessions();
      } catch (err) {
        this.log.add('error', `Failed to delete "${name}": ${err.message}`);
        this.ui.toast('error', 'Delete Failed', err.message);
      }
    }
  }

  // ---- Link Device / QR ----
  async openLinkDevice(name) {
    this.qrSessionName = name;
    document.getElementById('qr-modal-title').textContent = `Link Device — ${name}`;
    this.ui.setPasskeyStatus('Waiting for scan…', false);
    this.ui.openModal('modal-qr');
    this.log.add('info', `Opening QR code for session "${name}"`);
    await this.fetchQR(name);
    this.startQRPolling(name);
  }

  async fetchQR(name) {
    this.ui.showQRLoading();
    try {
      const url = await this.api.getQR(name);
      this.ui.showQRImage(url);
    } catch (err) {
      this.ui.showQRError();
      this.log.add('error', `QR code failed for "${name}": ${err.message}`);
    }
  }

  startQRPolling(name) {
    this.stopQRPolling();
    const total = DEFAULT_CONFIG.qrRefreshInterval;
    this.qrCountdown = total;
    this.ui.setQRCountdown(this.qrCountdown, total);
    this.isSigningPasskey = false;

    this.qrCountdownTimer = setInterval(async () => {
      // While polling for QR, also check if a passkey challenge is required
      if (!this.isSigningPasskey) {
        try {
          const challenge = await this.api.getPasskeyChallenge(name);
          if (challenge && challenge.challenge) {
            this.handlePasskeyChallenge(name, challenge);
          }
        } catch (err) {
          // Ignore 404s or errors if challenge is not ready
        }
      }

      this.qrCountdown--;
      this.ui.setQRCountdown(this.qrCountdown, total);
      if (this.qrCountdown <= 0) {
        this.qrCountdown = total;
        if (!this.isSigningPasskey) {
          this.fetchQR(name);
        }
      }
    }, 1000);
  }

  stopQRPolling() {
    if (this.qrCountdownTimer) {
      clearInterval(this.qrCountdownTimer);
      this.qrCountdownTimer = null;
    }
  }

  // ---- Passkey Flow ----
  async handlePasskeyChallenge(name, challenge) {
    if (this.isSigningPasskey) return;
    this.isSigningPasskey = true;
    this.ui.setPasskeyStatus('Passkey Required! Check extension...', false);
    this.log.add('warning', `Passkey challenge received for session "${name}"`);

    const extId = this.getConfig().extensionId;
    if (!extId) {
      this.ui.toast('error', 'Missing Extension ID', 'Configure the Passkey Extension ID in settings.');
      this.ui.setPasskeyStatus('Missing Extension ID', false);
      this.isSigningPasskey = false;
      return;
    }

    try {
      this.log.add('info', 'Sending challenge to Passkey Extension...');
      const assertion = await this.signWithExtension(extId, challenge);
      
      this.log.add('success', 'Passkey signed! Sending back to WAHA...');
      this.ui.setPasskeyStatus('Authenticating...', false);

      await this.api.sendPasskeyAssertion(name, assertion);
      this.ui.setPasskeyStatus('Passkey Accepted!', true);
      
    } catch (err) {
      this.log.add('error', `Passkey flow failed: ${err.message}`);
      this.ui.setPasskeyStatus(`Error: ${err.message}`, false);
    } finally {
      this.isSigningPasskey = false;
    }
  }

  signWithExtension(extensionId, challenge) {
    return new Promise((resolve, reject) => {
      if (!window.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
        return reject(new Error('Chrome extension API not available'));
      }
      chrome.runtime.sendMessage(
        extensionId,
        { type: 'waha-passkey-sign', challenge },
        (resp) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!resp?.ok) return reject(new Error(resp?.error || 'Passkey signing failed'));
          resolve(resp.assertion);
        }
      );
    });
  }

  // ---- Screenshot ----
  async openScreenshot(name) {
    document.getElementById('screenshot-title').textContent = `Screenshot — ${name}`;
    this.ui.openModal('modal-screenshot');
    try {
      const url = await this.api.getScreenshot(name);
      document.getElementById('screenshot-image').src = url;
    } catch (err) {
      this.ui.toast('error', 'Screenshot Failed', err.message);
      this.ui.closeModal('modal-screenshot');
    }
  }
}

// ============================================================
//  App Initialization
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Load saved config
  let config = { ...DEFAULT_CONFIG };
  try {
    const saved = localStorage.getItem('waha-config');
    if (saved) config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
  } catch {}

  // Instantiate
  const api = new WahaAPI(config);
  const ui = new UIManager();
  const log = new EventLog();
  const manager = new SessionManager(api, ui, log);

  // ---- Populate settings form from config ----
  document.getElementById('settings-url').value = config.wahaUrl;
  document.getElementById('settings-apikey').value = config.apiKey;
  document.getElementById('settings-refresh').value = config.refreshInterval || DEFAULT_CONFIG.refreshInterval;
  
  const extInput = document.getElementById('settings-extension');
  if (extInput) extInput.value = config.extensionId || '';

  // ---- Event Bindings ----

  // New Session
  const openCreate = () => {
    document.getElementById('input-session-name').value = '';
    ui.openModal('modal-create');
    setTimeout(() => document.getElementById('input-session-name').focus(), 200);
  };

  document.getElementById('btn-new-session').addEventListener('click', openCreate);
  document.getElementById('btn-empty-new')?.addEventListener('click', openCreate);

  // Create session form
  document.getElementById('form-create-session').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('input-session-name').value.trim();
    const engine = document.getElementById('input-engine').value;
    const autoStart = document.getElementById('input-autostart').checked;
    if (!name) return;
    manager.createSession(name, engine, autoStart);
  });

  // Refresh
  document.getElementById('btn-refresh').addEventListener('click', () => {
    manager.loadSessions();
    log.add('info', 'Manual refresh triggered');
  });

  // Settings
  document.getElementById('btn-settings').addEventListener('click', () => {
    ui.openModal('modal-settings');
  });

  document.getElementById('btn-save-settings').addEventListener('click', () => {
    const newConfig = {
      wahaUrl: document.getElementById('settings-url').value.trim() || DEFAULT_CONFIG.wahaUrl,
      apiKey: document.getElementById('settings-apikey').value.trim() || DEFAULT_CONFIG.apiKey,
      refreshInterval: parseInt(document.getElementById('settings-refresh').value) || DEFAULT_CONFIG.refreshInterval,
      extensionId: document.getElementById('settings-extension')?.value.trim() || '',
      engine: DEFAULT_CONFIG.engine,
    };
    manager.saveConfig(newConfig);
    ui.closeModal('modal-settings');
    ui.toast('success', 'Settings Saved', 'Configuration updated');
    log.add('success', 'Settings updated');
    // Re-check connection
    manager.checkConnection().then(() => manager.loadSessions());
  });

  // Confirm action
  document.getElementById('btn-confirm-action').addEventListener('click', () => {
    manager.executeConfirm();
  });

  // Event log toggle
  document.getElementById('event-log-toggle').addEventListener('click', () => {
    document.getElementById('event-log-section').classList.toggle('open');
  });

  // Event log actions
  document.getElementById('btn-clear-log').addEventListener('click', () => {
    log.clear();
    ui.toast('info', 'Log Cleared');
  });

  document.getElementById('btn-export-log').addEventListener('click', () => {
    log.exportJSON();
    ui.toast('success', 'Log Exported', 'Saved as JSON file');
  });

  // QR retry
  document.getElementById('btn-qr-retry').addEventListener('click', () => {
    if (manager.qrSessionName) {
      manager.fetchQR(manager.qrSessionName);
    }
  });

  // Close QR modal → stop polling
  const qrOverlay = document.getElementById('modal-qr');
  const observer = new MutationObserver(() => {
    if (!qrOverlay.classList.contains('active')) {
      manager.stopQRPolling();
    }
  });
  observer.observe(qrOverlay, { attributes: true, attributeFilter: ['class'] });

  // ---- Keyboard Shortcuts ----
  document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    switch (e.key) {
      case 'n':
      case 'N':
        e.preventDefault();
        openCreate();
        break;
      case 'r':
      case 'R':
        e.preventDefault();
        manager.loadSessions();
        log.add('info', 'Manual refresh (keyboard)');
        break;
      case 'Escape':
        e.preventDefault();
        ui.closeAllModals();
        break;
    }
  });

  // ---- Online/Offline Detection ----
  window.addEventListener('online', () => {
    ui.toast('info', 'Back Online');
    log.add('info', 'Network connection restored');
    manager.checkConnection().then(() => manager.loadSessions());
  });

  window.addEventListener('offline', () => {
    ui.setConnectionStatus('disconnected');
    ui.toast('warning', 'Offline', 'No network connection');
    log.add('warning', 'Network connection lost');
  });

  // ---- Start ----
  manager.init();
});
