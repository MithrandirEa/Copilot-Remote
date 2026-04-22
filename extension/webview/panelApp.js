/**
 * Copilot Remote — Script WebView VS Code
 *
 * Protocole JSON Extension → WebView (window.addEventListener 'message') :
 *   ← { type: 'message',      role: 'user'|'assistant', text: string, id: string }
 *   ← { type: 'chunk',        text: string, id: string }
 *   ← { type: 'response_end', id: string }
 *   ← { type: 'status',       connected: boolean }
 *
 * Protocole JSON WebView → Extension (vscode.postMessage) :
 *   → { type: 'ready' }
 *   → { type: 'prompt',      text: string }
 *   → { type: 'save_config', serverUrl: string }
 */

'use strict';

// API VS Code — doit être appelé une seule fois par instance de WebView
const vscode = acquireVsCodeApi();

// ---------------------------------------------------------------------------
// État global
// ---------------------------------------------------------------------------

// Bulle de réponse assistante en cours de streaming
let streamingMessageEl = null;
let streamingText = '';
let currentStreamId = null;

// ---------------------------------------------------------------------------
// Références DOM
// ---------------------------------------------------------------------------

const setupScreen    = document.getElementById('setup-screen');
const chatScreen     = document.getElementById('chat-screen');
const statusBadge    = document.getElementById('status-badge');
const chatLog        = document.getElementById('chat-log');
const chatForm       = document.getElementById('chat-form');
const messageInput   = document.getElementById('message-input');
const settingsBtn    = document.getElementById('settings-btn');
const saveConfigBtn  = document.getElementById('save-config-btn');
const serverUrlInput = document.getElementById('server-url-input');
const setupError     = document.getElementById('setup-error');

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

(function init() {
  // Signaler à l'extension que le WebView est prêt à recevoir des messages
  vscode.postMessage({ type: 'ready' });

  // Auto-resize du textarea de saisie
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

  settingsBtn.addEventListener('click', () => {
    showSetupScreen();
  });

  saveConfigBtn.addEventListener('click', onSaveConfig);
})();

// ---------------------------------------------------------------------------
// Messages entrants depuis l'extension
// ---------------------------------------------------------------------------

window.addEventListener('message', (event) => {
  const message = event.data;

  switch (message.type) {
    case 'message':
      // Message complet (non-streaming) — utilisateur ou assistant
      appendMessage(message.role, message.text);
      break;

    case 'chunk':
      // Morceau de réponse en streaming
      if (message.id !== currentStreamId) {
        // Nouvelle réponse : créer une bulle de streaming vide
        currentStreamId = message.id;
        streamingText = '';
        streamingMessageEl = appendMessage('assistant', '', true);
      }
      streamingText += message.text;
      updateStreamingMessage(streamingText);
      break;

    case 'response_end':
      // Fin du streaming : finaliser la bulle
      if (streamingMessageEl) {
        finalizeStreamingMessage(streamingText);
        streamingMessageEl = null;
        streamingText = '';
        currentStreamId = null;
      }
      break;

    case 'status':
      // Mise à jour de l'état de connexion au serveur
      setStatus(message.connected ? 'connected' : 'disconnected');
      break;

    case 'history_sync':
      // Restaurer l'historique de conversation (reconnexion WebView ou mobile)
      chatLog.innerHTML = '';
      for (const entry of message.messages) {
        appendMessage(entry.role, entry.text);
      }
      break;
  }
});

// ---------------------------------------------------------------------------
// Envoi d'un prompt
// ---------------------------------------------------------------------------

function submitMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  // Afficher le message utilisateur localement dans le chat
  appendMessage('user', text);
  messageInput.value = '';
  messageInput.style.height = 'auto';

  // Transmettre le prompt à l'extension pour traitement Copilot
  vscode.postMessage({ type: 'prompt', text });
}

// ---------------------------------------------------------------------------
// Gestion des écrans
// ---------------------------------------------------------------------------

function showSetupScreen() {
  setupScreen.removeAttribute('hidden');
  chatScreen.setAttribute('hidden', '');
  if (setupError) {
    setupError.textContent = '';
  }
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

  if (!serverUrl.startsWith('wss://')) {
    if (setupError) {
      setupError.textContent = "L'URL doit commencer par wss://";
    }
    return;
  }

  // Déléguer la persistance à l'extension (pas de localStorage dans le WebView)
  vscode.postMessage({ type: 'save_config', serverUrl });
  showChatScreen();
}

// ---------------------------------------------------------------------------
// Affichage des messages dans le chat log
// ---------------------------------------------------------------------------

/**
 * Ajouter une bulle de message dans le chat log.
 * @param {string} role - 'user', 'assistant', ou 'system'
 * @param {string} text - Contenu du message
 * @param {boolean} streaming - Si true, la bulle sera mise à jour progressivement
 * @returns {HTMLElement} L'élément créé
 */
function appendMessage(role, text, streaming = false) {
  const el = document.createElement('div');
  el.className = `message ${role}${streaming ? ' streaming' : ''}`;

  if (role === 'assistant') {
    // Rendu Markdown avec sanitisation pour les messages Copilot
    el.innerHTML = renderMarkdown(text);
  } else {
    // Messages utilisateur en texte brut (pas de Markdown)
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

/** Mettre à jour le contenu d'une bulle de streaming en cours. */
function updateStreamingMessage(text) {
  if (!streamingMessageEl) return;
  streamingMessageEl.innerHTML = renderMarkdown(text);
  scrollToBottom();
}

/** Finaliser une bulle de streaming (retirer la classe 'streaming'). */
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
// Rendu Markdown (via marked.js + DOMPurify)
// ---------------------------------------------------------------------------

/**
 * Convertir du Markdown en HTML sécurisé.
 * Utilise marked.js pour le parsing et DOMPurify pour la sanitisation.
 * Fallback en texte échappé si les librairies ne sont pas disponibles.
 */
function renderMarkdown(text) {
  if (typeof marked !== 'undefined') {
    // marked v5+ : marked.parse() est synchrone par défaut
    const raw = marked.parse(text, { breaks: true, gfm: true });
    // Sanitisation obligatoire avant injection dans innerHTML
    return typeof DOMPurify !== 'undefined'
      ? DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
      : raw;
  }
  // Fallback : échapper le HTML si marked non chargé
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
  const labels = {
    connected: 'Connecté',
    disconnected: 'Déconnecté',
    connecting: 'Connexion…',
  };
  statusBadge.textContent = labels[state] ?? state;
  statusBadge.className = `badge ${state}`;
}
