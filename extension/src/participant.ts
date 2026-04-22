import * as vscode from 'vscode';
import { BridgeClient, type OutgoingMessage } from './bridgeClient';

/**
 * Participant de chat @remote.
 * Reçoit les requêtes du panel Chat VS Code, les relaie à Copilot
 * via vscode.chat.sendRequest(), et streame la réponse vers le serveur.
 */
export function createParticipant(
  context: vscode.ExtensionContext,
  getClient: () => BridgeClient | null
): vscode.ChatParticipant {
  const participant = vscode.chat.createChatParticipant(
    'copilot-remote.remote',
    async (
      request: vscode.ChatRequest,
      chatContext: vscode.ChatContext,
      stream: vscode.ChatResponseStream,
      token: vscode.CancellationToken
    ) => {
      const client = getClient();
      const promptId = request.prompt; // utilisé comme identifiant de corrélation

      // Transmettre la requête à Copilot (modèle par défaut : copilot)
      const models = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
      if (models.length === 0) {
        stream.markdown('⚠️ Aucun modèle Copilot disponible. Assurez-vous que GitHub Copilot est actif.');
        return;
      }

      const model = models[0];

      // Construire les messages à partir de l'historique du chat
      const messages: vscode.LanguageModelChatMessage[] = [
        ...chatContext.history
          .filter(
            (h): h is vscode.ChatRequestTurn | vscode.ChatResponseTurn =>
              h instanceof vscode.ChatRequestTurn || h instanceof vscode.ChatResponseTurn
          )
          .flatMap((h) => {
            if (h instanceof vscode.ChatRequestTurn) {
              return [vscode.LanguageModelChatMessage.User(h.prompt)];
            }
            // ChatResponseTurn — convertir le contenu en texte
            const text = h.response
              .filter((p): p is vscode.ChatResponseMarkdownPart => p instanceof vscode.ChatResponseMarkdownPart)
              .map((p) => p.value.value)
              .join('');
            return text ? [vscode.LanguageModelChatMessage.Assistant(text)] : [];
          }),
        vscode.LanguageModelChatMessage.User(request.prompt),
      ];

      let fullResponse = '';

      try {
        const response = await model.sendRequest(messages, {}, token);

        for await (const chunk of response.text) {
          stream.markdown(chunk);
          fullResponse += chunk;

          // Relayer chaque chunk vers le mobile en temps réel
          if (client !== null) {
            const msg: OutgoingMessage = {
              type: 'response_chunk',
              text: chunk,
              id: promptId,
            };
            client.send(msg);
          }
        }
      } catch (err) {
        if (err instanceof vscode.LanguageModelError) {
          stream.markdown(`⚠️ Erreur Copilot : ${err.message}`);
        } else {
          stream.markdown('⚠️ Une erreur inattendue s\'est produite.');
        }
        // Signaler la fin même en cas d'erreur
        if (client !== null) {
          client.send({ type: 'response_end', id: promptId });
        }
        return;
      }

      // Signaler la fin du streaming au mobile
      if (client !== null) {
        client.send({ type: 'response_end', id: promptId });
      }
    }
  );

  participant.iconPath = new vscode.ThemeIcon('remote');
  context.subscriptions.push(participant);
  return participant;
}
