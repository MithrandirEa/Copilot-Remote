import * as assert from 'assert';
import * as vscode from 'vscode';
import sinon from 'sinon';
import { BridgeClient } from '../bridgeClient';
import { getLastInstance, resetLastInstance, MockWebSocket } from './__mocks__/ws';

// Le module 'ws' est redirigé vers __mocks__/ws.ts via tsconfig.test.json.
// Le cache CommonJS garantit que BridgeClient et ces tests partagent la même
// instance de module — les instances créées par BridgeClient sont donc visibles
// via getLastInstance().

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Crée un BridgeClient avec des dépendances mockées. */
function createClient(onPrompt?: (text: string, id: string) => void): BridgeClient {
  return new BridgeClient(
    'wss://test.example.com',
    'test-token-xyz',
    onPrompt ?? (() => {}),
    { appendLine: () => {}, dispose: () => {} } as unknown as vscode.OutputChannel,
  );
}

/** Simule l'ouverture de la connexion WebSocket (événement 'open'). */
function openConnection(ws: MockWebSocket): void {
  ws.emit('open');
}

/** Simule la réception d'un message JSON depuis le serveur. */
function receiveMessage(ws: MockWebSocket, payload: unknown): void {
  ws.emit('message', JSON.stringify(payload));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BridgeClient', () => {
  beforeEach(() => {
    resetLastInstance();
  });

  afterEach(() => {
    // Restaure les faux timers sinon et tous les stubs/spies créés dans le test.
    sinon.restore();
  });

  // -------------------------------------------------------------------------
  describe('connect()', () => {
    it("envoie le message d'auth à l'ouverture de la connexion", () => {
      // Arrange
      const client = createClient();

      // Act
      client.connect();
      const ws = getLastInstance()!;
      assert.ok(ws, 'un WebSocket doit être créé');
      assert.strictEqual(ws.url, 'wss://test.example.com');
      openConnection(ws);

      // Assert
      assert.strictEqual(ws.sent.length, 1, 'un seul message doit être envoyé à l\'ouverture');
      const msg = JSON.parse(ws.sent[0]);
      assert.strictEqual(msg.type, 'auth');
      assert.strictEqual(msg.token, 'test-token-xyz');

      client.dispose();
    });
  });

  // -------------------------------------------------------------------------
  describe("réception 'auth_ok'", () => {
    it("remet reconnectDelay à zéro et ne déclenche pas onPrompt", () => {
      // Arrange
      let promptCallCount = 0;
      const client = createClient(() => { promptCallCount++; });
      client.connect();
      const ws = getLastInstance()!;
      openConnection(ws);

      // Act
      receiveMessage(ws, { type: 'auth_ok' });

      // Assert
      assert.strictEqual(promptCallCount, 0, 'onPrompt ne doit pas être appelé pour auth_ok');

      client.dispose();
    });
  });

  // -------------------------------------------------------------------------
  describe("réception 'prompt'", () => {
    it('appelle onPrompt avec text et id corrects', () => {
      // Arrange
      let capturedText = '';
      let capturedId = '';
      let callCount = 0;
      const client = createClient((text, id) => {
        capturedText = text;
        capturedId = id;
        callCount++;
      });
      client.connect();
      const ws = getLastInstance()!;
      openConnection(ws);
      receiveMessage(ws, { type: 'auth_ok' });

      // Act
      receiveMessage(ws, { type: 'prompt', text: 'hello world', id: '42' });

      // Assert
      assert.strictEqual(callCount, 1, 'onPrompt doit être appelé exactement une fois');
      assert.strictEqual(capturedText, 'hello world');
      assert.strictEqual(capturedId, '42');

      client.dispose();
    });
  });

  // -------------------------------------------------------------------------
  describe("réception 'error'", () => {
    it("logge le message d'erreur et ne lève pas d'exception", () => {
      // Arrange
      const logLines: string[] = [];
      const outputChannel = { appendLine: (line: string) => { logLines.push(line); }, dispose: () => {} } as unknown as vscode.OutputChannel;
      const client = new BridgeClient('wss://test.example.com', 'token', () => {}, outputChannel);
      client.connect();
      const ws = getLastInstance()!;
      openConnection(ws);

      // Act + Assert (pas d'exception)
      assert.doesNotThrow(() => {
        receiveMessage(ws, { type: 'error', message: 'Internal server error' });
      });
      const errorLogged = logLines.some((line) => line.includes('Internal server error'));
      assert.ok(errorLogged, "le message d'erreur doit apparaître dans les logs");

      client.dispose();
    });
  });

  // -------------------------------------------------------------------------
  describe('JSON malformé', () => {
    it("est ignoré silencieusement sans lever d'exception", () => {
      // Arrange
      const client = createClient();
      client.connect();
      const ws = getLastInstance()!;
      openConnection(ws);

      // Act + Assert
      assert.doesNotThrow(() => {
        ws.emit('message', '{ invalid ::: json }');
      });

      client.dispose();
    });
  });

  // -------------------------------------------------------------------------
  describe('fermeture du WebSocket', () => {
    it('programme une reconnexion automatique après le délai', () => {
      // Arrange
      const clock = sinon.useFakeTimers();
      const client = createClient();
      client.connect();
      const ws1 = getLastInstance()!;
      openConnection(ws1);
      receiveMessage(ws1, { type: 'auth_ok' });

      // Act : simule une déconnexion côté serveur
      ws1.emit('close', 1001, Buffer.alloc(0));

      // Assert : pas encore reconnecté (timer en attente)
      assert.strictEqual(getLastInstance(), ws1, 'aucune nouvelle connexion avant le délai');

      // Act : avance le temps au-delà du délai de reconnexion (2000 ms par défaut)
      clock.tick(2001);

      // Assert : une nouvelle connexion a été tentée
      const ws2 = getLastInstance();
      assert.ok(ws2 !== null, 'une nouvelle instance WebSocket doit exister');
      assert.notStrictEqual(ws2, ws1, 'la nouvelle instance doit être différente de la précédente');

      client.dispose();
    });
  });

  // -------------------------------------------------------------------------
  describe('dispose()', () => {
    it('ferme le WebSocket, annule la reconnexion programmée et empêche de nouvelles connexions', () => {
      // Arrange
      const clock = sinon.useFakeTimers();
      const client = createClient();
      client.connect();
      const ws1 = getLastInstance()!;
      openConnection(ws1);
      receiveMessage(ws1, { type: 'auth_ok' });

      // Provoque une déconnexion → reconnexion planifiée
      ws1.emit('close', 1001, Buffer.alloc(0));
      assert.strictEqual(getLastInstance(), ws1, 'pas encore reconnecté avant dispose');

      // Act
      client.dispose();

      // Assert : le WebSocket a été fermé explicitement
      assert.ok(ws1.closeCalled, 'close() doit avoir été appelé sur le WebSocket');

      // Assert : avancer le temps ne déclenche pas de nouvelle connexion
      clock.tick(5000);
      assert.strictEqual(getLastInstance(), ws1, 'aucune nouvelle connexion après dispose()');
    });

    it("ferme le WebSocket proprement et n'établit pas de reconnexion même sans event 'close' préalable", () => {
      // Arrange
      const clock = sinon.useFakeTimers();
      const client = createClient();
      client.connect();
      const ws1 = getLastInstance()!;
      openConnection(ws1);

      // Act : dispose direct, sans déconnexion serveur préalable
      client.dispose();

      // Assert
      assert.ok(ws1.closeCalled, 'close() doit être appelé lors du dispose');
      clock.tick(5000);
      assert.strictEqual(getLastInstance(), ws1, 'pas de reconnexion après dispose() propre');
    });
  });
});
