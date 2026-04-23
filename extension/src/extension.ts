import * as vscode from 'vscode';
import { BridgeClient } from './bridgeClient';
import { createParticipant } from './participant';
import { getToken, storeToken, deleteToken, getServerUrl } from './config';
import { ConversationPanel } from './webviewPanel';
import { handlePrompt, PromptHandle } from './copilotEngine';
import { ConversationStore } from './conversationStore';

let client: BridgeClient | null = null;
let outputChannel: vscode.OutputChannel | null = null;
let activePromptHandle: PromptHandle | null = null;

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
        const { handle, promise } = handlePrompt({
          text, id,
          getClient: () => client,
          getPanel: () => ConversationPanel.currentPanel,
          outputChannel: outputChannel!,
        });
        activePromptHandle = handle;
        void promise.finally(() => { activePromptHandle = null; });
      };
      // Vider l'historique depuis le WebView
      panel.onHistoryClear = () => {
        ConversationStore.instance.clear();
        client?.send({ type: 'history_clear' });
        sendStatusFull();
      };
      // Annuler le streaming depuis le WebView
      panel.onStop = () => { activePromptHandle?.cancel(); };
      // Changer le modèle depuis le WebView
      panel.onModelChange = (model: string) => {
        ConversationStore.instance.setModel(model);
        client?.send({ type: 'model_change', model });
        sendStatusFull();
      };
      // Envoyer la liste des modèles disponibles et le modèle actif au WebView
      void fetchAvailableModels().then(models => {
        panel.postMessage({ type: 'models_list', models });
        panel.postMessage({ type: 'model_change', model: ConversationStore.instance.selectedModel });
      });
    })
  );

  // Commande : annuler la génération en cours
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-remote.stopGeneration', () => {
      activePromptHandle?.cancel();
    })
  );

  // Reconnexion automatique au démarrage si un token est déjà stocké
  void autoConnect(context);
}

export function deactivate(): void {
  client?.dispose();
  client = null;
  // Réinitialiser le singleton pour éviter la persistance d'historique entre rechargements
  (ConversationStore as unknown as { _instance: undefined })._instance = undefined;
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

async function autoConnect(context: vscode.ExtensionContext): Promise<void> {
  // Guard : évite une double instanciation si autoConnect est appelé plusieurs fois
  if (client !== null) { return; }
  const token = await getToken(context.secrets);
  if (!token) { return; }
  // Vérification après l'await car une connexion manuelle peut avoir eu lieu entretemps
  if (client !== null) { return; }
  startClient(token, getServerUrl(), context);
}

async function commandConnect(context: vscode.ExtensionContext): Promise<void> {
  // Demander l'URL (pré-remplie avec la valeur actuelle)
  const currentUrl = getServerUrl();
  const serverUrl = await vscode.window.showInputBox({
    prompt: 'URL WSS du serveur relais',
    value: currentUrl === 'wss://your-bridge-domain' ? '' : currentUrl,
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
      // Câbler les handlers sur le panel si ce dernier vient d'être créé
      panel.onPrompt = (webviewText: string) => {
        const webviewId = Date.now().toString();
        const { handle, promise } = handlePrompt({
          text: webviewText, id: webviewId,
          getClient: () => client,
          getPanel: () => ConversationPanel.currentPanel,
          outputChannel: outputChannel!,
        });
        activePromptHandle = handle;
        void promise.finally(() => { activePromptHandle = null; });
      };
      panel.onHistoryClear = () => {
        ConversationStore.instance.clear();
        client?.send({ type: 'history_clear' });
        sendStatusFull();
      };
      panel.onStop = () => { activePromptHandle?.cancel(); };
      panel.onModelChange = (model: string) => {
        ConversationStore.instance.setModel(model);
        client?.send({ type: 'model_change', model });
        sendStatusFull();
      };
      const { handle, promise } = handlePrompt({
        text, id,
        getClient: () => client,
        getPanel: () => ConversationPanel.currentPanel,
        outputChannel: outputChannel!,
      });
      activePromptHandle = handle;
      void promise.finally(() => { activePromptHandle = null; });
    },
    outputChannel!,
    // mobile_connected → envoyer l'historique au mobile via le bridge + statut enrichi
    () => {
      const history = ConversationStore.instance.getAll();
      client?.send({ type: 'history_sync', messages: [...history] });
      sendStatusFull();
    },
    // history_clear depuis le mobile → vider le store + notifier WebView + écho mobile
    () => {
      ConversationStore.instance.clear();
      ConversationPanel.currentPanel?.postMessage({ type: 'history_clear' });
      client?.send({ type: 'history_clear' });
      sendStatusFull();
    },
    // stop depuis le mobile → annuler le streaming en cours
    () => { activePromptHandle?.cancel(); },
    // model_change depuis le mobile → mettre à jour le store + notifier WebView + statut
    (model: string) => {
      ConversationStore.instance.setModel(model);
      ConversationPanel.currentPanel?.postMessage({ type: 'model_change', model });
      sendStatusFull();
    },
    // auth_ok → envoyer le statut enrichi initial au mobile et au WebView
    () => { sendStatusFull(); },
  );
  context.subscriptions.push({ dispose: () => { client?.dispose(); } });
  client.connect();
}

// ---------------------------------------------------------------------------
// Fonctions utilitaires
// ---------------------------------------------------------------------------

/**
 * Retourne la liste dédoublonnée des familles de modèles LLM disponibles via vscode.lm.
 * Utilisée pour alimenter le dropdown de sélection de modèle.
 */
async function fetchAvailableModels(): Promise<string[]> {
  const models = await vscode.lm.selectChatModels({});
  const families = [...new Set(models.map(m => m.family))];
  return families.length > 0 ? families : ['gpt-4o'];
}

/**
 * Envoie un status_full au WebView et au bridge avec l'état complet du système.
 * Appelé après chaque changement d'état significatif (modèle, historique, connexion).
 */
function sendStatusFull(): void {
  const payload = {
    type: 'status_full' as const,
    model: ConversationStore.instance.selectedModel,
    messageCount: ConversationStore.instance.getAll().length,
    mobileConnected: client?.isConnected() ?? false,
  };
  ConversationPanel.currentPanel?.postMessage(payload);
  client?.send(payload);
}
