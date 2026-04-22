import * as vscode from 'vscode';
import { BridgeClient } from './bridgeClient';
import { createParticipant } from './participant';
import { getToken, storeToken, deleteToken, getServerUrl } from './config';

let client: BridgeClient | null = null;
let outputChannel: vscode.OutputChannel | null = null;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('Copilot Remote');
  context.subscriptions.push(outputChannel);

  // Participant @remote — accède au client courant via closure
  createParticipant(context, () => client);

  // Commande : connexion au serveur
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-remote.connect', async () => {
      await commandConnect(context);
    })
  );

  // Commande : déconnexion du serveur
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-remote.disconnect', () => {
      commandDisconnect();
    })
  );

  // Commande : supprimer le token stocké
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-remote.clearToken', async () => {
      await deleteToken(context.secrets);
      vscode.window.showInformationMessage('Copilot Remote: token supprimé.');
    })
  );

  // Reconnexion automatique au démarrage si un token est déjà stocké
  void autoConnect(context);
}

export function deactivate(): void {
  client?.dispose();
  client = null;
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

async function autoConnect(context: vscode.ExtensionContext): Promise<void> {
  const token = await getToken(context.secrets);
  if (token) {
    startClient(token, context);
  }
}

async function commandConnect(context: vscode.ExtensionContext): Promise<void> {
  // Récupérer ou demander le token
  let token = await getToken(context.secrets);
  if (!token) {
    token = await vscode.window.showInputBox({
      prompt: 'Token d\'authentification Copilot Remote',
      password: true,
      placeHolder: 'Collez le AUTH_SECRET_TOKEN défini sur le VPS',
      ignoreFocusOut: true,
    });
    if (!token) {
      return; // annulé
    }
    await storeToken(context.secrets, token);
  }

  if (client !== null) {
    client.dispose();
    client = null;
  }
  startClient(token, context);
}

function commandDisconnect(): void {
  if (client === null) {
    vscode.window.showInformationMessage('Copilot Remote: déjà déconnecté.');
    return;
  }
  client.dispose();
  client = null;
  vscode.window.setStatusBarMessage('$(debug-disconnect) Copilot Remote: déconnecté', 4000);
  outputChannel?.appendLine(`[${new Date().toISOString()}] Déconnexion manuelle`);
}

function startClient(token: string, context: vscode.ExtensionContext): void {
  const serverUrl = getServerUrl();
  client = new BridgeClient(
    serverUrl,
    token,
    // Handler des prompts entrants depuis le mobile :
    // injecter le message dans le chat VS Code en invoquant @remote
    (text: string, _id: string) => {
      // Ouvrir le panel chat avec le message pré-rempli
      void vscode.commands.executeCommand('workbench.action.chat.open', {
        query: `@remote ${text}`,
      });
    },
    outputChannel!
  );
  context.subscriptions.push({ dispose: () => { client?.dispose(); } });
  client.connect();
}

