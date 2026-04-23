// Mock minimal de l'API vscode pour les tests unitaires (sans instance VS Code).
// Injecté via l'alias de chemin "vscode" dans tsconfig.test.json.

// ---------------------------------------------------------------------------
// Types exposés (utilisés dans config.ts et bridgeClient.ts)
// ---------------------------------------------------------------------------

export interface SecretStorage {
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface OutputChannel {
  appendLine(value: string): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Configuration mockable : permet aux tests de contrôler les valeurs retournées
// ---------------------------------------------------------------------------

let _configValues: Record<string, unknown> = {};

/** Définit une valeur de configuration pour les tests. */
export const __setConfigValue = (key: string, value: unknown): void => {
  _configValues[key] = value;
};

/** Réinitialise toutes les valeurs de configuration. */
export const __clearConfigValues = (): void => {
  _configValues = {};
};

// ---------------------------------------------------------------------------
// Mocks des namespaces vscode utilisés dans le code source
// ---------------------------------------------------------------------------

export const window = {
  setStatusBarMessage: (_message: string, _timeout?: number): void => { /* no-op */ },
  createOutputChannel: (_name: string): OutputChannel => ({
    appendLine: () => { /* no-op */ },
    dispose: () => { /* no-op */ },
  }),
};

export const workspace = {
  getConfiguration: (section?: string) => ({
    get: <T>(key: string, defaultValue?: T): T | undefined => {
      // Cherche d'abord sous la clé complète "section.key", puis sous "key" seul
      const fullKey = section ? `${section}.${key}` : key;
      if (fullKey in _configValues) {
        return _configValues[fullKey] as T;
      }
      if (key in _configValues) {
        return _configValues[key] as T;
      }
      return defaultValue;
    },
  }),
};
