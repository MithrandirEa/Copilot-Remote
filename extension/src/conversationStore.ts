import * as vscode from 'vscode';

export interface ConversationEntry {
  role: 'user' | 'assistant';
  text: string;
  id: string;
}

/**
 * Stockage en mémoire de l'historique de conversation.
 * Singleton accessible globalement dans l'extension.
 * Pas de persistance sur disque (V1).
 */
export class ConversationStore {
  private static _instance: ConversationStore | undefined;
  private _entries: ConversationEntry[] = [];
  private _selectedModel: string = 'gpt-4o';

  private constructor() {}

  /** Instance unique du store. */
  public static get instance(): ConversationStore {
    if (!ConversationStore._instance) {
      ConversationStore._instance = new ConversationStore();
    }
    return ConversationStore._instance;
  }

  /** Ajouter une entrée à l'historique. */
  public add(entry: ConversationEntry): void {
    this._entries.push(entry);
  }

  /** Retourner tout l'historique (lecture seule). */
  public getAll(): readonly ConversationEntry[] {
    return this._entries;
  }

  /** Vider l'historique. */
  public clear(): void {
    this._entries = [];
  }

  /** Modèle LLM actif. */
  public get selectedModel(): string { return this._selectedModel; }

  /** Mettre à jour le modèle LLM actif. */
  public setModel(model: string): void { this._selectedModel = model; }

  /**
   * Convertit l'historique en messages vscode.LanguageModelChatMessage[]
   * pour l'API vscode.lm.
   */
  public toLmMessages(): vscode.LanguageModelChatMessage[] {
    return this._entries.map((entry) =>
      entry.role === 'user'
        ? vscode.LanguageModelChatMessage.User(entry.text)
        : vscode.LanguageModelChatMessage.Assistant(entry.text)
    );
  }
}
