/**
 * Copilot Remote — Client mobile
 *
 * Protocole JSON attendu du serveur :
 *   ← { type: 'auth_ok' }
 *   ← { type: 'status',         vscode_connected: boolean }
 *   ← { type: 'response_chunk', text: string, id: string }
 *   ← { type: 'response_end',   id: string }
 *   ← { type: 'error',          message: string }
 *   → { type: 'auth',           token: string }
 *   → { type: 'prompt',         text: string, id: string }
 */

'use strict';

// ---------------------------------------------------------------------------
// Configuration (persistée en localStorage — survit à la fermeture de l'onglet)
// ---------------------------------------------------------------------------
const CONFIG_KEY = 'copilot_remote_config';

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveConfig(serverUrl, token) {
  // Stockage dans localStorage (persisté entre sessions sur appareil personnel)
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ serverUrl, token }));
}

function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

// ---------------------------------------------------------------------------
// État global
// ---------------------------------------------------------------------------
let ws = null;
let reconnectTimer = null;
let reconnectDelay = 2000;
const MAX_RECONNECT_DELAY = 30_000;

// Réponse Copilot en cours de streaming
let streamingMessageEl = null;
let streamingText = '';
let currentStreamId = null;

// Config active
let activeConfig = null;

// ---------------------------------------------------------------------------
// Références DOM
// ---------------------------------------------------------------------------
const setupScreen     = document.getElementById('setup-screen');
const chatScreen      = document.getElementById('chat-screen');
const statusBadge     = document.getElementById('status-badge');
const chatLog         = document.getElementById('chat-log');
const chatForm        = document.getElementById('chat-form');
const messageInput    = document.getElementById('message-input');
const sendBtn         = document.getElementById('send-btn');
const settingsBtn     = document.getElementById('settings-btn');
const saveConfigBtn   = document.getElementById('save-config-btn');
const cancelConfigBtn = document.getElementById('cancel-config-btn');
const serverUrlInput  = document.getElementById('server-url-input');
const tokenInput      = document.getElementById('token-input');
const setupError      = document.getElementById('setup-error');

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
(function init() {
  let config = loadConfig();
  if (config?.serverUrl && config?.token) {
    // Migration : anciens configs sans chemin /ws/mobile
    if (!config.serverUrl.includes('/ws/')) {
      config.serverUrl = config.serverUrl.replace(/\/+$/, '') + '/ws/mobile';
      saveConfig(config.serverUrl, config.token);
    }
    activeConfig = config;
    showChatScreen();
    connect();
  } else {
    showSetupScreen();
  }

  // Auto-resize du textarea
  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
  });

  // Envoi via Entrée (Shift+Entrée = saut de ligne)
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  });

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitMessage();
  });

  saveConfigBtn.addEventListener('click', onSaveConfig);

  settingsBtn.addEventListener('click', () => {
    showSetupScreen();
  });

  cancelConfigBtn.addEventListener('click', () => {
    showChatScreen();
  });
})();

// ---------------------------------------------------------------------------
// Écrans
// ---------------------------------------------------------------------------
function showSetupScreen() {
  setupScreen.removeAttribute('hidden');
  chatScreen.setAttribute('hidden', '');
  setupError.textContent = '';
  // Afficher le bouton Annuler uniquement si une session existait déjà
  if (activeConfig) {
    cancelConfigBtn.removeAttribute('hidden');
  } else {
    cancelConfigBtn.setAttribute('hidden', '');
  }

  const config = loadConfig();
  if (config?.serverUrl) serverUrlInput.value = config.serverUrl;
  if (config?.token) tokenInput.value = config.token;
}

function showChatScreen() {
  setupScreen.setAttribute('hidden', '');
  chatScreen.removeAttribute('hidden');
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
function onSaveConfig() {
  const serverUrl = serverUrlInput.value.trim();
  const token = tokenInput.value.trim();

  if (!serverUrl.startsWith('wss://')) {
    setupError.textContent = "L'URL doit commencer par wss://";
    return;
  }
  if (!token) {
    setupError.textContent = 'Le token ne peut pas être vide.';
    return;
  }

  // Auto-correction : ajoute /ws/mobile si le chemin WebSocket est absent
  const wsUrl = serverUrl.includes('/ws/') ? serverUrl : serverUrl.replace(/\/+$/, '') + '/ws/mobile';

  disconnectWs();
  saveConfig(wsUrl, token);
  activeConfig = { serverUrl: wsUrl, token };
  showChatScreen();
  connect();
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------
function connect() {
  if (!activeConfig) return;
  setStatus('connecting');

  const socket = new WebSocket(activeConfig.serverUrl);
  ws = socket;

  socket.addEventListener('open', () => {
    // Premier message : authentification (canal chiffré par WSS/TLS)
    socket.send(JSON.stringify({ type: 'auth', token: activeConfig.token }));
  });

  socket.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return; // JSON invalide ignoré
    }
    handleMessage(msg);
  });

  socket.addEventListener('close', (event) => {
    ws = null;
    setStatus('disconnected');
    // Ne pas reconnecter si fermeture volontaire (code 1000) ou token invalide (1008)
    if (event.code !== 1000 && event.code !== 1008 && activeConfig) {
      scheduleReconnect();
    } else if (event.code === 1008) {
      appendSystemMessage('Token invalide — vérifiez la configuration.');
      clearConfig();
      activeConfig = null;
      showSetupScreen();
    }
  });

  socket.addEventListener('error', () => {
    // L'événement 'close' suit toujours un 'error' — pas d'action supplémentaire
  });
}

function disconnectWs() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectDelay = 2000;
  if (ws !== null) {
    ws.close(1000, 'Déconnexion volontaire');
    ws = null;
  }
}

function scheduleReconnect() {
  appendSystemMessage(`Reconnexion dans ${reconnectDelay / 1000}s…`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
}

// ---------------------------------------------------------------------------
// Gestion des messages entrants
// ---------------------------------------------------------------------------
function handleMessage(msg) {
  switch (msg.type) {
    case 'auth_ok':
      reconnectDelay = 2000;
      setStatus('connected');
      break;

    case 'status':
      if (!msg.vscode_connected) {
        appendSystemMessage('VS Code déconnecté.');
      } else {
        appendSystemMessage('VS Code connecté.');
      }
      break;

    case 'response_chunk':
      if (msg.id !== currentStreamId) {
        // Nouvelle réponse — créer une bulle de streaming
        currentStreamId = msg.id;
        streamingText = '';
        streamingMessageEl = appendMessage('copilot', '', true);
      }
      streamingText += msg.text;
      updateStreamingMessage(streamingText);
      break;

    case 'response_end':
      if (streamingMessageEl) {
        finalizeStreamingMessage(streamingText);
        streamingMessageEl = null;
        streamingText = '';
        currentStreamId = null;
      }
      break;

    case 'error':
      appendSystemMessage(`Erreur : ${msg.message}`);
      break;
  }
}

// ---------------------------------------------------------------------------
// Envoi d'un prompt
// ---------------------------------------------------------------------------
function submitMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    appendSystemMessage('Non connecté — message non envoyé.');
    return;
  }

  appendMessage('user', text);
  messageInput.value = '';
  messageInput.style.height = 'auto';

  const id = crypto.randomUUID();
  ws.send(JSON.stringify({ type: 'prompt', text, id }));
}

// ---------------------------------------------------------------------------
// Affichage des messages
// ---------------------------------------------------------------------------
function appendMessage(role, text, streaming = false) {
  const el = document.createElement('div');
  el.className = `message ${role}${streaming ? ' streaming' : ''}`;

  if (role === 'copilot') {
    el.innerHTML = renderMarkdown(text);
  } else {
    el.textContent = text;
  }

  chatLog.appendChild(el);
  scrollToBottom();
  return el;
}

function appendSystemMessage(text) {
  const el = document.createElement('div');
  el.className = 'message system';
  el.textContent = text;
  chatLog.appendChild(el);
  scrollToBottom();
}

function updateStreamingMessage(text) {
  if (!streamingMessageEl) return;
  streamingMessageEl.innerHTML = renderMarkdown(text);
  scrollToBottom();
}

function finalizeStreamingMessage(text) {
  if (!streamingMessageEl) return;
  streamingMessageEl.classList.remove('streaming');
  streamingMessageEl.innerHTML = renderMarkdown(text);
  scrollToBottom();
}

function scrollToBottom() {
  chatLog.scrollTop = chatLog.scrollHeight;
}

// ---------------------------------------------------------------------------
// Rendu Markdown (via marked.js)
// ---------------------------------------------------------------------------
function renderMarkdown(text) {
  if (typeof marked !== 'undefined') {
    // marked v5+ : marked.parse() est synchrone par défaut
    const raw = marked.parse(text, { breaks: true, gfm: true });
    // Sanitisation DOMPurify obligatoire avant innerHTML (Mihawk — Haute)
    return typeof DOMPurify !== 'undefined'
      ? DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
      : raw;
  }
  // Fallback si marked non disponible : échapper le HTML
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// ---------------------------------------------------------------------------
// Statut de connexion
// ---------------------------------------------------------------------------
function setStatus(state) {
  const labels = { connected: 'Connecté', disconnected: 'Déconnecté', connecting: 'Connexion…' };
  statusBadge.textContent = labels[state] ?? state;
  statusBadge.className = `badge ${state}`;
}
