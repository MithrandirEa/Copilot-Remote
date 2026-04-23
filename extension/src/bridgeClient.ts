import * as vscode from 'vscode';
import WebSocket from 'ws';

// Types des messages JSON du protocole
export type IncomingMessage =
  | { type: 'prompt'; text: string; id: string }
  | { type: 'status'; vscode_connected: boolean }
  | { type: 'auth_ok' }
  | { type: 'error'; message: string }
  | { type: 'mobile_connected' }    // serveur notifie VS Code que le mobile vient de se connecter
  | { type: 'history_clear' }       // mobile demande la suppression de l'historique
  | { type: 'stop' };               // mobile demande l'annulation du streaming en cours

export type OutgoingMessage =
  | { type: 'auth'; token: string }
  | { type: 'response_chunk'; text: string; id: string }
  | { type: 'response_end'; id: string }
  | { type: 'history_sync'; messages: Array<{ role: 'user' | 'assistant'; text: string; id: string }> }
  | { type: 'history_clear' };      // propagation ou confirmation de suppression d'historique

type PromptHandler = (text: string, id: string) => void;

/**
 * Client WebSocket vers le serveur relais VPS.
 * Gère l'authentification initiale, la reconnexion automatique
 * et l'exposition de callbacks pour les messages entrants.
 */
export class BridgeClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly onMobileConnected: (() => void) | undefined;
  private readonly onHistoryClear: (() => void) | undefined;
  private readonly onStop: (() => void) | undefined;

  // Délai de reconnexion en ms (exponentiel plafonné à 30s)
  private reconnectDelay = 2000;
  private static readonly MAX_RECONNECT_DELAY = 30_000;
  // Timeout d'authentification côté client (légèrement inférieur au serveur)
  private static readonly AUTH_TIMEOUT_MS = 4_500;

  constructor(
    private readonly serverUrl: string,
    private readonly token: string,
    private readonly onPrompt: PromptHandler,
    outputChannel: vscode.OutputChannel,
    onMobileConnected?: () => void,
    onHistoryClear?: () => void,
    onStop?: () => void,
  ) {
    this.outputChannel = outputChannel;
    this.onMobileConnected = onMobileConnected;
    this.onHistoryClear = onHistoryClear;
    this.onStop = onStop;
  }

  /** Établit la connexion WebSocket. */
  connect(): void {
    if (this.disposed) {
      return;
    }
    this.log(`Connexion vers ${this.serverUrl}…`);
    const ws = new WebSocket(this.serverUrl);
    this.ws = ws;

    // Timer d'authentification côté client
    let authTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      this.log('Timeout authentification — fermeture de la connexion');
      ws.terminate();
    }, BridgeClient.AUTH_TIMEOUT_MS);

    const clearAuthTimer = (): void => {
      if (authTimer !== null) {
        clearTimeout(authTimer);
        authTimer = null;
      }
    };

    ws.on('open', () => {
      this.log('Connexion ouverte — envoi du token d\'authentification');
      // Envoi du token en premier message (chiffré par WSS/TLS)
      const authMsg: OutgoingMessage = { type: 'auth', token: this.token };
      ws.send(JSON.stringify(authMsg));
    });

    ws.on('message', (data: WebSocket.RawData) => {
      let msg: IncomingMessage;
      try {
        msg = JSON.parse(data.toString()) as IncomingMessage;
      } catch {
        this.log('Message JSON invalide reçu — ignoré');
        return;
      }

      if (msg.type === 'auth_ok') {
        clearAuthTimer();
        this.reconnectDelay = 2000; // reset après succès
        this.log('Authentifié — relais actif');
        vscode.window.setStatusBarMessage('$(plug) Copilot Remote: connecté', 5000);
        return;
      }

      if (msg.type === 'prompt') {
        this.onPrompt(msg.text, msg.id);
        return;
      }

      if (msg.type === 'mobile_connected') {
        // Le serveur signale qu'un client mobile vient de se connecter
        this.onMobileConnected?.();
        return;
      }

      if (msg.type === 'history_clear') {
        // Le mobile demande la suppression de l'historique
        this.onHistoryClear?.();
        return;
      }

      if (msg.type === 'stop') {
        // Le mobile demande l'annulation du streaming en cours
        this.onStop?.();
        return;
      }

      if (msg.type === 'error') {
        this.log(`Erreur serveur : ${msg.message}`);
        return;
      }
    });

    ws.on('close', (code, reason) => {
      clearAuthTimer();
      this.log(`Connexion fermée (code ${code}${reason.length ? ` — ${reason}` : ''})`);
      if (!this.disposed) {
        this.scheduleReconnect();
      }
    });

    ws.on('error', (err: Error) => {
      clearAuthTimer();
      // Le message d'erreur ne doit pas contenir le token
      // replaceAll : couvre toutes les occurrences du token dans le message d'erreur (Mihawk — Faible)
      this.log(`Erreur WebSocket : ${err.message.replaceAll(this.token, '[REDACTED]')}`);
    });
  }

  /** Envoie un message au serveur si la connexion est ouverte. */
  send(msg: OutgoingMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** Ferme la connexion proprement et annule la reconnexion automatique. */
  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws !== null) {
      this.ws.close(1000, 'Déconnexion volontaire');
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    this.log(`Reconnexion dans ${this.reconnectDelay / 1000}s…`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    // Backoff exponentiel plafonné
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, BridgeClient.MAX_RECONNECT_DELAY);
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }
}
