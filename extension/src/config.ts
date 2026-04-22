import * as vscode from 'vscode';

const SECRET_KEY = 'copilot-remote.authToken';
const SERVER_URL_KEY = 'copilot-remote.serverUrl';

/**
 * Récupère le token d'authentification depuis le stockage sécurisé.
 * Retourne undefined si non défini.
 */
export async function getToken(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get(SECRET_KEY);
}

/**
 * Stocke le token d'authentification dans le stockage sécurisé VS Code.
 */
export async function storeToken(secrets: vscode.SecretStorage, token: string): Promise<void> {
  await secrets.store(SECRET_KEY, token);
}

/**
 * Supprime le token d'authentification du stockage sécurisé.
 */
export async function deleteToken(secrets: vscode.SecretStorage): Promise<void> {
  await secrets.delete(SECRET_KEY);
}

/**
 * Récupère l'URL du serveur relais depuis la configuration VS Code.
 * Valeur par défaut : wss://your-bridge-domain (à configurer dans les settings VS Code)
 */
export function getServerUrl(): string {
  const config = vscode.workspace.getConfiguration('copilot-remote');
  return config.get<string>('serverUrl', 'wss://your-bridge-domain');
}
