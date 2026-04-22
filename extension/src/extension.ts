import * as vscode from 'vscode';
import { BridgeClient } from './bridgeClient';
import { createParticipant } from './participant';
import { getToken, storeToken, deleteToken, getServerUrl } from './config';
import { ConversationPanel } from './webviewPanel';
import { handlePrompt } from './copilotEngine';
import { ConversationStore } from './conversationStore';

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

  // Commande : ouvrir le panel WebView de conversation
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-remote.openPanel', () => {
      const panel = ConversationPanel.createOrShow(context);
      // Câbler le handler de prompts WebView → Copilot
      panel.onPrompt = (text: string) => {
        const id = Date.now().toString();
        void handlePrompt({
          text, id,
          getClient: () => client,
          getPanel: () => ConversationPanel.currentPanel,
          outputChannel: outputChannel!,
        });
      };
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
    startClient(token, getServerUrl(), context);
  }
}

async function commandConnect(context: vscode.ExtensionContext): Promise<void> {
  // Demander l'URL (pré-remplie avec la valeur actuelle)
  const currentUrl = getServerUrl();
  const serverUrl = await vscode.window.showInputBox({
    prompt: 'URL WSS du serveur relais',
    value: currentUrl === 'wss://your-bridge-domain' ? 'wss://copilot.mithrandirea.info/ws/vscode' : currentUrl,
    placeHolder: 'wss://votre-domaine/ws/vscode',
    ignoreFocusOut: true,
    validateInput: (v) => v.startsWith('wss://') ? null : "L'URL doit commencer par wss://",
  });
  if (!serverUrl) {
    return; // annulé
  }

  // Mettre à jour le setting si l'URL a changé
  if (serverUrl !== currentUrl) {
    await vscode.workspace.getConfiguration('copilot-remote').update('serverUrl', serverUrl, vscode.ConfigurationTarget.Global);
  }

  // Demander le token (masqué, vide = garder l'existant)
  const storedToken = await getToken(context.secrets);
  const tokenInput = await vscode.window.showInputBox({
    prompt: storedToken
      ? 'Token d\'authentification (laisser vide pour conserver l\'actuel)'
      : 'Token d\'authentification',
    password: true,
    placeHolder: storedToken ? '(token existant conservé si vide)' : 'Collez le AUTH_SECRET_TOKEN défini sur le VPS',
    ignoreFocusOut: true,
  });
  if (tokenInput === undefined) {
    return; // annulé (Échap)
  }
  const token = tokenInput.trim() || storedToken;
  if (!token) {
    vscode.window.showErrorMessage('Copilot Remote: token requis.');
    return;
  }
  if (tokenInput.trim()) {
    await storeToken(context.secrets, token);
  }

  if (client !== null) {
    client.dispose();
    client = null;
  }
  startClient(token, serverUrl, context);
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

function startClient(token: string, serverUrl: string, context: vscode.ExtensionContext): void {
  client = new BridgeClient(
    serverUrl,
    token,
    // Prompt entrant depuis le mobile — ouvrir le panel et traiter via Copilot
    (text: string, id: string) => {
      const panel = ConversationPanel.createOrShow(context);
      // Câbler onPrompt sur le panel si ce dernier vient d'être créé
      panel.onPrompt = (webviewText: string) => {
        const webviewId = Date.now().toString();
        void handlePrompt({
          text: webviewText, id: webviewId,
          getClient: () => client,
          getPanel: () => ConversationPanel.currentPanel,
          outputChannel: outputChannel!,
        });
      };
      void handlePrompt({
        text, id,
        getClient: () => client,
        getPanel: () => ConversationPanel.currentPanel,
        outputChannel: outputChannel!,
      });
    },
    outputChannel!,
    // mobile_connected → envoyer l'historique au mobile via le bridge
    () => {
      const history = ConversationStore.instance.getAll();
      client?.send({ type: 'history_sync', messages: [...history] });
    }
  );
  context.subscriptions.push({ dispose: () => { client?.dispose(); } });
  client.connect();
}

