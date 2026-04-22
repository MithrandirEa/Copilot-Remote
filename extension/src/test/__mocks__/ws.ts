// Mock du module 'ws' pour les tests unitaires de BridgeClient.
// Injecté via l'alias de chemin "ws" dans tsconfig.test.json.
// Partage la même instance de module (cache Node.js) avec bridgeClient.ts,
// ce qui permet aux tests d'accéder aux instances créées par BridgeClient.

import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Constantes statiques (miroir du module ws)
// ---------------------------------------------------------------------------

export const OPEN = 1;
export const CLOSING = 2;
export const CLOSED = 3;

// ---------------------------------------------------------------------------
// Registre de la dernière instance créée — accessible depuis les tests
// ---------------------------------------------------------------------------

let _lastInstance: MockWebSocket | null = null;

/** Retourne la dernière instance MockWebSocket créée par BridgeClient. */
export function getLastInstance(): MockWebSocket | null {
  return _lastInstance;
}

/** Réinitialise le registre entre les tests. */
export function resetLastInstance(): void {
  _lastInstance = null;
}

// ---------------------------------------------------------------------------
// MockWebSocket
// ---------------------------------------------------------------------------

export class MockWebSocket extends EventEmitter {
  static readonly OPEN = OPEN;
  static readonly CLOSING = CLOSING;
  static readonly CLOSED = CLOSED;

  readyState = OPEN;

  /** Messages envoyés via send(), en ordre chronologique. */
  readonly sent: string[] = [];

  /** Vrai si close() a été appelé (déconnexion côté client). */
  closeCalled = false;
  closeCode?: number;
  closeReason?: string;

  constructor(public readonly url: string) {
    super();
    _lastInstance = this;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  /**
   * Simule la fermeture locale (dispose côté client).
   * NE déclenche PAS l'événement 'close' — comme le WebSocket réel qui attend
   * la confirmation du serveur avant d'émettre 'close'.
   */
  close(code?: number, reason?: string): void {
    this.closeCalled = true;
    this.closeCode = code;
    this.closeReason = reason;
    this.readyState = CLOSED;
  }

  /**
   * Fermeture forcée (terminate).
   * Déclenche immédiatement l'événement 'close' avec le code 1006.
   */
  terminate(): void {
    this.readyState = CLOSED;
    this.emit('close', 1006, Buffer.alloc(0));
  }
}

// Export par défaut pour `import WebSocket from 'ws'`
export default MockWebSocket;
