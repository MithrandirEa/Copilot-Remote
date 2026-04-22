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
}

/**
 * Traite un prompt via vscode.lm (Copilot) et diffuse les chunks
 * vers le WebView et le BridgeClient simultanément.
 *
 * Note : n'utilise pas vscode.chat — cela reste réservé au participant @remote.
 */
export async function handlePrompt(ctx: PromptContext): Promise<void> {
  const { text, id, getClient, getPanel, outputChannel } = ctx;

  // 1. Stocker le message utilisateur dans l'historique
  ConversationStore.instance.add({ role: 'user', text, id });

  // 2. Afficher le message utilisateur dans le WebView
  getPanel()?.postMessage({ type: 'message', role: 'user', text, id });

  // 3. Source d'annulation interne si aucune n'est fournie
  let cts: vscode.CancellationTokenSource | undefined;
  let token: vscode.CancellationToken;
  if (ctx.cancellationToken) {
    token = ctx.cancellationToken;
  } else {
    cts = new vscode.CancellationTokenSource();
    token = cts.token;
  }

  try {
    // 4. Sélectionner le modèle Copilot (gpt-4o — sera remplacé Phase 5)
    const [model] = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
    if (!model) {
      throw new Error('Aucun modèle Copilot disponible (gpt-4o introuvable)');
    }

    // 5. Construire les messages depuis l'historique complet
    const messages = ConversationStore.instance.toLmMessages();

    // 6. Envoyer la requête au modèle
    const response = await model.sendRequest(messages, {}, token);

    // 7. Diffuser les chunks vers le WebView et le BridgeClient
    let fullText = '';
    const assistantId = `${id}-response`;
    for await (const chunk of response.text) {
      fullText += chunk;
      getPanel()?.postMessage({ type: 'chunk', text: chunk, id: assistantId });
      getClient()?.send({ type: 'response_chunk', text: chunk, id: assistantId });
    }

    // 8. Stocker la réponse complète et signaler la fin du streaming
    ConversationStore.instance.add({ role: 'assistant', text: fullText, id: assistantId });
    getPanel()?.postMessage({ type: 'response_end', id: assistantId });
    getClient()?.send({ type: 'response_end', id: assistantId });
  } catch (err: unknown) {
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
    cts?.dispose();
  }
}
