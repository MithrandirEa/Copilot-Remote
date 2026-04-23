import * as assert from 'assert';
import * as vscode from 'vscode';
import { ConversationStore, ConversationEntry } from '../conversationStore';

describe('ConversationStore', () => {
  // Injecte un mock minimal de vscode.LanguageModelChatMessage,
  // absent du mock statique __mocks__/vscode.ts.
  before(() => {
    (vscode as any).LanguageModelChatMessage = {
      User:      (text: string) => ({ role: 'user',      text }),
      Assistant: (text: string) => ({ role: 'assistant', text }),
    };
  });

  // Remet le store dans un état neutre avant chaque test (option b).
  // Le singleton lui-même n'est pas réinitialisé — seule son état l'est.
  beforeEach(() => {
    ConversationStore.instance.clear();
    ConversationStore.instance.setModel('gpt-4o');
  });

  // -------------------------------------------------------------------------
  describe('instance (singleton)', () => {
    it('retourne toujours la même référence', () => {
      // Act + Assert
      assert.strictEqual(ConversationStore.instance, ConversationStore.instance);
    });
  });

  // -------------------------------------------------------------------------
  describe('add() + getAll()', () => {
    it('stocke les entrées dans l\'ordre d\'ajout', () => {
      // Arrange
      const e1: ConversationEntry = { role: 'user',      text: 'bonjour', id: '1' };
      const e2: ConversationEntry = { role: 'assistant', text: 'salut',   id: '2' };

      // Act
      ConversationStore.instance.add(e1);
      ConversationStore.instance.add(e2);

      // Assert
      const all = ConversationStore.instance.getAll();
      assert.strictEqual(all.length, 2);
      assert.deepStrictEqual(all[0], e1);
      assert.deepStrictEqual(all[1], e2);
    });

    it('retourne un tableau vide si aucune entrée n\'a été ajoutée', () => {
      assert.strictEqual(ConversationStore.instance.getAll().length, 0);
    });

    it('chaque appel à add() incrémente la taille de un', () => {
      // Arrange
      const entry: ConversationEntry = { role: 'user', text: 'test', id: '1' };

      // Act
      ConversationStore.instance.add(entry);

      // Assert
      assert.strictEqual(ConversationStore.instance.getAll().length, 1);
    });
  });

  // -------------------------------------------------------------------------
  describe('clear()', () => {
    it('vide correctement le tableau après des ajouts', () => {
      // Arrange
      ConversationStore.instance.add({ role: 'user',      text: 'a', id: '1' });
      ConversationStore.instance.add({ role: 'assistant', text: 'b', id: '2' });
      assert.strictEqual(ConversationStore.instance.getAll().length, 2);

      // Act
      ConversationStore.instance.clear();

      // Assert
      assert.strictEqual(ConversationStore.instance.getAll().length, 0);
    });

    it('peut être appelé sur un store déjà vide sans lever d\'exception', () => {
      assert.doesNotThrow(() => ConversationStore.instance.clear());
    });

    it('ne modifie pas le modèle sélectionné', () => {
      // Arrange
      ConversationStore.instance.setModel('o1-preview');
      ConversationStore.instance.add({ role: 'user', text: 'x', id: '1' });

      // Act
      ConversationStore.instance.clear();

      // Assert
      assert.strictEqual(ConversationStore.instance.selectedModel, 'o1-preview');
    });
  });

  // -------------------------------------------------------------------------
  describe('selectedModel + setModel()', () => {
    it("retourne 'gpt-4o' par défaut (après reset beforeEach)", () => {
      assert.strictEqual(ConversationStore.instance.selectedModel, 'gpt-4o');
    });

    it('setModel met à jour le modèle sélectionné', () => {
      // Act
      ConversationStore.instance.setModel('gpt-4o-mini');

      // Assert
      assert.strictEqual(ConversationStore.instance.selectedModel, 'gpt-4o-mini');
    });

    it('setModel accepte n\'importe quelle chaîne', () => {
      ConversationStore.instance.setModel('o1-preview');
      assert.strictEqual(ConversationStore.instance.selectedModel, 'o1-preview');
    });
  });

  // -------------------------------------------------------------------------
  describe('toLmMessages()', () => {
    it('retourne un tableau vide pour un historique vide', () => {
      assert.deepStrictEqual(ConversationStore.instance.toLmMessages(), []);
    });

    it('convertit role user en LanguageModelChatMessage.User()', () => {
      // Arrange
      ConversationStore.instance.add({ role: 'user', text: 'question', id: '1' });

      // Act
      const messages = ConversationStore.instance.toLmMessages();

      // Assert
      assert.strictEqual(messages.length, 1);
      assert.deepStrictEqual(messages[0], { role: 'user', text: 'question' });
    });

    it('convertit role assistant en LanguageModelChatMessage.Assistant()', () => {
      // Arrange
      ConversationStore.instance.add({ role: 'assistant', text: 'réponse', id: '2' });

      // Act
      const messages = ConversationStore.instance.toLmMessages();

      // Assert
      assert.strictEqual(messages.length, 1);
      assert.deepStrictEqual(messages[0], { role: 'assistant', text: 'réponse' });
    });

    it('préserve l\'ordre des messages dans une conversation alternée', () => {
      // Arrange
      ConversationStore.instance.add({ role: 'user',      text: 'q1', id: '1' });
      ConversationStore.instance.add({ role: 'assistant', text: 'a1', id: '2' });
      ConversationStore.instance.add({ role: 'user',      text: 'q2', id: '3' });

      // Act
      const messages = ConversationStore.instance.toLmMessages();

      // Assert
      assert.strictEqual(messages.length, 3);
      assert.deepStrictEqual(messages[0], { role: 'user',      text: 'q1' });
      assert.deepStrictEqual(messages[1], { role: 'assistant', text: 'a1' });
      assert.deepStrictEqual(messages[2], { role: 'user',      text: 'q2' });
    });

    it('transmet le texte exact sans transformation', () => {
      // Arrange — texte avec caractères spéciaux
      const text = 'Hello\n"world"\t<br/>';
      ConversationStore.instance.add({ role: 'user', text, id: '1' });

      // Act
      const messages = ConversationStore.instance.toLmMessages();

      // Assert
      assert.strictEqual((messages[0] as any).text, text);
    });
  });
});
