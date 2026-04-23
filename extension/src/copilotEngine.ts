import * as vscode from 'vscode';
import { ConversationStore } from './conversationStore';
import { ConversationPanel } from './webviewPanel';
import { BridgeClient } from './bridgeClient';

export interface PromptContext {
  text: string;
  id: string;
  getClient: () => BridgeClient | null;
  getPanel: () => ConversationPanel | undefined;
  outputChannel: vscode.OutputChannel;
  cancellationToken?: vscode.CancellationToken;
  /** Famille de modèle à utiliser ; si absent, utilise ConversationStore.instance.selectedModel. */
  modelFamily?: string;
}

/**
 * Handle de contrôle pour une génération en cours.
 * Permet d'annuler le streaming depuis l'extension, le WebView ou le mobile.
 */
export interface PromptHandle {
  cancel: () => void;
}

/**
 * Lance le traitement d'un prompt et retourne immédiatement un handle d'annulation.
 * Le travail réel s'effectue dans la promesse retournée.
 *
 * Note : n'utilise pas vscode.chat — cela reste réservé au participant @remote.
 */
export function handlePrompt(ctx: PromptContext): { handle: PromptHandle; promise: Promise<void> } {
  const cts = new vscode.CancellationTokenSource();

  // Lier le token externe si fourni (ex : participant @remote)
  if (ctx.cancellationToken) {
    ctx.cancellationToken.onCancellationRequested(() => cts.cancel());
  }

  const promise = _doHandlePrompt(ctx, cts.token, cts);
  return {
    handle: { cancel: () => cts.cancel() },
    promise,
  };
}

/**
 * Corps asynchrone du traitement — séparé pour permettre l'exposition du handle.
 */
async function _doHandlePrompt(
  ctx: PromptContext,
  token: vscode.CancellationToken,
  cts: vscode.CancellationTokenSource,
): Promise<void> {
  const { text, id, getClient, getPanel, outputChannel } = ctx;

  // 1. Stocker le message utilisateur dans l'historique
  ConversationStore.instance.add({ role: 'user', text, id });

  // 2. Afficher le message utilisateur dans le WebView
  getPanel()?.postMessage({ type: 'message', role: 'user', text, id });

  try {
    // 3. Sélectionner le modèle Copilot depuis le store (ou override via ctx.modelFamily)
    const family = ctx.modelFamily ?? ConversationStore.instance.selectedModel;
    const [model] = await vscode.lm.selectChatModels({ family });
    if (!model) {
      throw new Error(`Aucun modèle Copilot disponible (${family} introuvable)`);
    }

    // 4. Construire les messages depuis l'historique complet
    const messages = ConversationStore.instance.toLmMessages();

    // 5. Envoyer la requête au modèle
    const response = await model.sendRequest(messages, {}, token);

    // 6. Diffuser les chunks vers le WebView et le BridgeClient
    let fullText = '';
    const assistantId = `${id}-response`;
    for await (const chunk of response.text) {
      fullText += chunk;
      getPanel()?.postMessage({ type: 'chunk', text: chunk, id: assistantId });
      getClient()?.send({ type: 'response_chunk', text: chunk, id: assistantId });
    }

    // 7. Stocker la réponse complète et signaler la fin du streaming
    ConversationStore.instance.add({ role: 'assistant', text: fullText, id: assistantId });
    getPanel()?.postMessage({ type: 'response_end', id: assistantId });
    getClient()?.send({ type: 'response_end', id: assistantId });
  } catch (err: unknown) {
    // Annulation propre — envoyer response_end sans message d'erreur
    if (token.isCancellationRequested) {
      const assistantId = `${id}-response`;
      getPanel()?.postMessage({ type: 'response_end', id: assistantId });
      getClient()?.send({ type: 'response_end', id: assistantId });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`[${new Date().toISOString()}] Erreur handlePrompt : ${message}`);
    // Propager l'erreur vers le WebView sous forme de message assistant
    getPanel()?.postMessage({
      type: 'message',
      role: 'assistant',
      text: `⚠️ Erreur : ${message}`,
      id: `${id}-error`,
    });
  } finally {
    cts.dispose();
  }
}
