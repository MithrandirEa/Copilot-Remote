import * as assert from 'assert';
import { getToken, storeToken, deleteToken, getServerUrl } from '../config';
import { __setConfigValue, __clearConfigValues } from './__mocks__/vscode';

// Le module 'vscode' est redirigé vers __mocks__/vscode.ts via tsconfig.test.json.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Crée un mock de SecretStorage avec des callbacks observables. */
function makeSecrets(overrides: {
  get?: (key: string) => Promise<string | undefined>;
  store?: (key: string, value: string) => Promise<void>;
  delete?: (key: string) => Promise<void>;
}) {
  return {
    get: overrides.get ?? (async () => undefined),
    store: overrides.store ?? (async () => {}),
    delete: overrides.delete ?? (async () => {}),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('config.ts', () => {
  afterEach(() => {
    __clearConfigValues();
  });

  // -------------------------------------------------------------------------
  describe('getToken()', () => {
    it('délègue à secrets.get avec la clé correcte et retourne la valeur', async () => {
      let capturedKey = '';
      const secrets = makeSecrets({
        get: async (key) => { capturedKey = key; return 'mon-token'; },
      });

      const result = await getToken(secrets as any);

      assert.strictEqual(capturedKey, 'copilot-remote.authToken');
      assert.strictEqual(result, 'mon-token');
    });

    it('retourne undefined si le secret est absent', async () => {
      const secrets = makeSecrets({ get: async () => undefined });

      const result = await getToken(secrets as any);

      assert.strictEqual(result, undefined);
    });
  });

  // -------------------------------------------------------------------------
  describe('storeToken()', () => {
    it('délègue à secrets.store avec la clé et la valeur correctes', async () => {
      let capturedKey = '';
      let capturedValue = '';
      const secrets = makeSecrets({
        store: async (key, value) => { capturedKey = key; capturedValue = value; },
      });

      await storeToken(secrets as any, 'super-secret-token');

      assert.strictEqual(capturedKey, 'copilot-remote.authToken');
      assert.strictEqual(capturedValue, 'super-secret-token');
    });
  });

  // -------------------------------------------------------------------------
  describe('deleteToken()', () => {
    it('délègue à secrets.delete avec la clé correcte', async () => {
      let capturedKey = '';
      const secrets = makeSecrets({
        delete: async (key) => { capturedKey = key; },
      });

      await deleteToken(secrets as any);

      assert.strictEqual(capturedKey, 'copilot-remote.authToken');
    });
  });

  // -------------------------------------------------------------------------
  describe('getServerUrl()', () => {
    it("retourne la valeur par défaut si aucune configuration n'est définie", () => {
      const url = getServerUrl();

      assert.strictEqual(url, 'wss://copilot.mithrandirea.info');
    });

    it('retourne la valeur configurée si elle est définie', () => {
      __setConfigValue('copilot-remote.serverUrl', 'wss://custom.example.com');

      const url = getServerUrl();

      assert.strictEqual(url, 'wss://custom.example.com');
    });
  });
});
