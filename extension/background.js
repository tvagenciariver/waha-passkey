// WAHA Passkey Bridge - Background Service Worker

const WHATSAPP_URL = 'https://web.whatsapp.com/';

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'waha-passkey-ping') {
    sendResponse({ ok: true, type: 'waha-passkey-pong', version: chrome.runtime.getManifest().version });
    return false;
  }

  if (message?.type === 'waha-passkey-sign') {
    signPasskey(message.challenge)
      .then((assertion) => sendResponse({ ok: true, assertion }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true; // Keep the message channel open for the async response
  }

  return false;
});

async function signPasskey(challenge) {
  if (!challenge) {
    throw new Error('missing challenge');
  }
  
  const tab = await chrome.tabs.create({ url: WHATSAPP_URL, active: true });
  try {
    await waitForTabComplete(tab.id);
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: runWebAuthnInPage,
      args: [challenge],
    });
    if (result?.error) {
      throw new Error(result.error);
    }
    return result.assertion;
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// Injected into the web.whatsapp.com tab via chrome.scripting.executeScript.
function runWebAuthnInPage(challengeJson) {
  return new Promise((resolve) => {
    const GREEN = '#25D366';
    const GREEN_DARK = '#075E54';
    const SURFACE = '#111b21';
    const TEXT = '#e9edef';
    const MUTED = '#8696a0';
    const DANGER = '#ef4444';

    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;' +
      'background:#0b141a;font-family:system-ui,-apple-system,sans-serif;';

    const card = document.createElement('div');
    card.style.cssText =
      `width:320px;background:${SURFACE};border:1px solid ${GREEN}44;border-radius:16px;` +
      'padding:28px 24px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.5);';

    const iconWrap = document.createElement('div');
    iconWrap.style.cssText =
      `width:64px;height:64px;margin:0 auto 16px;border-radius:50%;background:${GREEN}26;` +
      'display:flex;align-items:center;justify-content:center;font-size:30px;';
    iconWrap.textContent = '🔑';

    const title = document.createElement('div');
    title.style.cssText = `color:${TEXT};font-size:18px;font-weight:600;margin-bottom:8px;`;
    title.textContent = 'Passkey Bridge (WAHA)';

    const subtitle = document.createElement('div');
    subtitle.style.cssText = `color:${MUTED};font-size:14px;line-height:1.5;margin-bottom:20px;`;
    subtitle.textContent =
      'Toque no botão abaixo e confirme sua identidade para conectar a WAHA.';

    const btn = document.createElement('button');
    btn.textContent = '🔑 Confirmar Conexão';
    btn.style.cssText =
      `width:100%;padding:12px 20px;font-size:15px;font-weight:600;background:${GREEN};` +
      `color:${GREEN_DARK};border:0;border-radius:8px;cursor:pointer;transition:0.2s;`;

    btn.onmouseover = () => btn.style.transform = 'scale(1.02)';
    btn.onmouseout = () => btn.style.transform = 'scale(1)';

    card.append(iconWrap, title, subtitle, btn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = 'Conectando...';
      try {
        const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON(challengeJson);
        const cred = await navigator.credentials.get({ publicKey });
        subtitle.textContent = 'Conectado! Fechando...';
        subtitle.style.color = GREEN;
        resolve({ assertion: cred.toJSON() });
      } catch (err) {
        btn.textContent = '❌ Falha na conexão';
        btn.style.background = DANGER;
        btn.style.color = '#fff';
        subtitle.textContent = String(err?.message || err);
        subtitle.style.color = DANGER;
        resolve({ error: String(err?.message || err) });
      }
    };
  });
}
