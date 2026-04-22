import * as vscode from 'vscode';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Types des messages échangés entre le WebView et l'extension
// ---------------------------------------------------------------------------

/** Messages reçus depuis le WebView (postMessage côté JS). */
type WebviewMessage =
  | { type: 'ready' }
  | { type: 'prompt'; text: string }
  | { type: 'save_config'; serverUrl: string };

/** Messages envoyés vers le WebView (postMessage côté extension). */
export type ExtensionMessage =
  | { type: 'message'; role: 'user' | 'assistant'; text: string; id: string }
  | { type: 'chunk'; text: string; id: string }
  | { type: 'response_end'; id: string }
  | { type: 'status'; connected: boolean };

// ---------------------------------------------------------------------------
// Panel WebView (singleton)
// ---------------------------------------------------------------------------

/**
 * Panel WebView affichant la conversation Copilot Remote.
 * Une seule instance peut exister à la fois (pattern singleton).
 */
export class ConversationPanel {
  /** Instance courante, ou undefined si aucun panel n'est ouvert. */
  public static currentPanel: ConversationPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private readonly _disposables: vscode.Disposable[] = [];

  /** Callback déclenché à la réception d'un prompt depuis le WebView. */
  public onPrompt: ((text: string) => void) | undefined;

  // ---------------------------------------------------------------------------
  // Fabrique statique (singleton)
  // ---------------------------------------------------------------------------

  /**
   * Créer le panel ou révéler l'instance existante.
   * Retourne toujours l'instance courante.
   */
  public static createOrShow(context: vscode.ExtensionContext): ConversationPanel {
    const column = vscode.window.activeTextEditor?.viewColumn;

    // Réutiliser le panel existant s'il est déjà ouvert
    if (ConversationPanel.currentPanel) {
      ConversationPanel.currentPanel._panel.reveal(column);
      return ConversationPanel.currentPanel;
    }

    // Racines autorisées pour les ressources locales du WebView :
    // le répertoire de l'extension + le répertoire shared/ partagé
    const sharedUri = vscode.Uri.joinPath(context.extensionUri, '..', 'shared');

    const panel = vscode.window.createWebviewPanel(
      'copilot-remote',
      'Copilot Remote',
      column ?? vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [context.extensionUri, sharedUri],
      }
    );

    ConversationPanel.currentPanel = new ConversationPanel(panel, context);
    return ConversationPanel.currentPanel;
  }

  // ---------------------------------------------------------------------------
  // Constructeur privé
  // ---------------------------------------------------------------------------

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._context = context;

    // Injecter le contenu HTML avec les URIs et la nonce CSP résolus
    this._panel.webview.html = this._buildHtml();

    // Nettoyer les ressources lors de la fermeture du panel
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Écouter les messages entrants depuis le WebView
    this._panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => {
        switch (message.type) {
          case 'prompt':
            // Transmettre le prompt à l'extension (traitement Copilot)
            this.onPrompt?.(message.text);
            break;

          case 'save_config':
            // Persister l'URL du serveur dans les paramètres VS Code
            void vscode.workspace
              .getConfiguration('copilot-remote')
              .update('serverUrl', message.serverUrl, vscode.ConfigurationTarget.Global);
            break;

          case 'ready':
            // WebView initialisé — rien à faire ici pour l'instant
            break;
        }
      },
      null,
      this._disposables
    );
  }

  // ---------------------------------------------------------------------------
  // API publique
  // ---------------------------------------------------------------------------

  /** Envoyer un message au WebView. */
  public postMessage(message: ExtensionMessage): void {
    void this._panel.webview.postMessage(message);
  }

  /** Libérer toutes les ressources associées au panel. */
  public dispose(): void {
    ConversationPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
    this._disposables.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Construction du HTML
  // ---------------------------------------------------------------------------

  /**
   * Lire le template panel.html et remplacer tous les placeholders
   * par les URIs WebView résolus et la nonce CSP unique générée.
   */
  private _buildHtml(): string {
    const webview = this._panel.webview;
    const extensionUri = this._context.extensionUri;

    // Nonce aléatoire par instanciation — empêche l'injection de scripts non autorisés
    const nonce = randomUUID().replace(/-/g, '');

    // URIs des feuilles de style (shared/ est en dehors de l'extension)
    const themeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, '..', 'shared', 'theme.css')
    );
    const componentsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, '..', 'shared', 'components.css')
    );
    const panelCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'webview', 'panel.css')
    );

    // URIs des scripts (tous locaux dans extension/webview/)
    const domPurifyUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'webview', 'purify.min.js')
    );
    const markedUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'webview', 'marked.min.js')
    );
    const appJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'webview', 'panelApp.js')
    );

    // Lire le template HTML depuis le disque
    const htmlPath = vscode.Uri.joinPath(extensionUri, 'webview', 'panel.html');
    let html = fs.readFileSync(htmlPath.fsPath, 'utf-8');

    // Remplacer tous les placeholders ({{CSP_NONCE}} apparaît plusieurs fois)
    html = html
      .replace(/\{\{CSP_NONCE\}\}/g, nonce)
      .replace('{{THEME_URI}}', themeUri.toString())
      .replace('{{COMPONENTS_URI}}', componentsUri.toString())
      .replace('{{PANEL_CSS_URI}}', panelCssUri.toString())
      .replace('{{DOMPURIFY_URI}}', domPurifyUri.toString())
      .replace('{{MARKED_URI}}', markedUri.toString())
      .replace('{{APP_JS_URI}}', appJsUri.toString());

    return html;
  }
}
