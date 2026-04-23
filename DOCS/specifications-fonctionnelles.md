# Spécifications Fonctionnelles — Copilot-Remote v2

> **Version** : 1.0  
> **Date** : 22 avril 2026  
> **Projet** : Copilot-Remote  
> **Auteur** : Punk-04 (GitHub Copilot)  
> **Statut** : Brouillon

---

## Table des matières

1. [Vision v2](#1-vision-v2)
2. [Périmètre et hors-périmètre](#2-périmètre-et-hors-périmètre)
3. [Acteurs et rôles](#3-acteurs-et-rôles)
4. [Spécifications fonctionnelles](#4-spécifications-fonctionnelles)
   - [F1 — WebView Panel VS Code](#f1--webview-panel-vs-code-critique)
   - [F2 — Synchronisation bidirectionnelle](#f2--synchronisation-bidirectionnelle)
   - [F3 — Sélection du modèle LLM](#f3--sélection-du-modèle-llm)
   - [F4 — Historique de conversation](#f4--historique-de-conversation)
   - [F5 — Arrêt de génération](#f5--arrêt-de-génération)
   - [F6 — Thème partagé (design system)](#f6--thème-partagé-design-system)
   - [F7 — Indicateurs de statut enrichis](#f7--indicateurs-de-statut-enrichis)
5. [Protocole de messages v2](#5-protocole-de-messages-v2)
6. [Architecture v2](#6-architecture-v2)
7. [Priorisation MoSCoW](#7-priorisation-moscow)
8. [Points ouverts](#8-points-ouverts)

---

## 1. Vision v2

### 1.1 Problème identifié en v1

En v1, l'utilisateur interagit avec Copilot via le participant `@remote` dans le **panel Chat intégré de VS Code** (géré nativement par l'extension GitHub Copilot). Ce choix implique deux limitations fondamentales :

1. **Absence de contrôle visuel** : l'apparence du panel Chat VS Code est entièrement dictée par VS Code et GitHub Copilot. L'utilisateur ne peut modifier ni le rendu, ni la typographie, ni la disposition.
2. **Incohérence entre les interfaces** : le client mobile (HTML/CSS/JS maîtrisé) et le panel VS Code (natif, non modifiable) ont des UX radicalement différentes, rendant l'expérience fragmentée.

### 1.2 Solution v2 : WebView personnalisé

La réponse architecturale est de **remplacer le panel Chat intégré par un `vscode.WebviewPanel` custom** embarqué dans l'extension. Ce WebView :

- Charge les **mêmes fichiers HTML/CSS** que le client mobile (source unique partagée).
- Est rendu dans un panneau VS Code standard (onglet, colonne, etc.) accessible via commande ou raccourci clavier.
- Communique avec le reste de l'extension via l'API de messages WebView (`webview.postMessage` / `onDidReceiveMessage`).
- Permet un **contrôle total** de l'apparence, des composants et de l'UX.

### 1.3 Principe de cohérence

Les deux interfaces — **Client mobile** et **WebView VS Code** — doivent être perçues comme une seule et même application. Elles partagent :

- Le même fichier `style.css` (variables CSS centralisées).
- La même structure HTML (`index.html` adapté via un léger paramétrage d'environnement).
- Le même fichier `app.js` de logique d'interface, avec une détection de contexte (`window.IS_VSCODE_WEBVIEW`).

---

## 2. Périmètre et hors-périmètre

### Dans le périmètre v2

| # | Élément |
|---|---------|
| P1 | WebView Panel VS Code remplaçant le participant `@remote` |
| P2 | Synchronisation bidirectionnelle mobile ↔ VS Code WebView |
| P3 | Sélection du modèle LLM depuis les deux interfaces |
| P4 | Historique de conversation partagé + effacement |
| P5 | Bouton "Stop" pour interrompre une génération |
| P6 | Design system CSS partagé entre client mobile et WebView |
| P7 | Indicateurs de statut enrichis dans les deux interfaces |
| P8 | Nouveaux types de messages JSON dans le protocole bridge |

### Hors périmètre v2

| # | Élément | Raison |
|---|---------|--------|
| HP1 | Persistance des messages en base de données | Hors V2, mémoire uniquement |
| HP2 | Authentification OAuth / SSO | Token partagé maintenu |
| HP3 | Support multi-utilisateurs simultanés | Architecture mono-client maintenue |
| HP4 | Application mobile native (iOS/Android) | Web App maintenue |
| HP5 | Historique persistant entre sessions | Mémoire uniquement |

---

## 3. Acteurs et rôles

| Acteur | Description | Interface principale |
|--------|-------------|----------------------|
| **Utilisateur mobile** | Pilote Copilot depuis un smartphone via navigateur | Client mobile (HTML/JS) |
| **Utilisateur VS Code** | Consulte et interagit avec Copilot dans l'éditeur | WebView Panel VS Code |
| *(Note : il s'agit du même utilisateur physique sur deux écrans)* | | |
| **Extension VS Code** | Composant technique qui relaie les prompts à `vscode.lm` et gère le WebView | — |
| **Bridge FastAPI (VPS)** | Serveur relais WebSocket hub entre mobile et extension | — |
| **GitHub Copilot LLM** | Modèle de langage invoqué via `vscode.lm.selectChatModels()` | — |

---

## 4. Spécifications Fonctionnelles

---

### F1 — WebView Panel VS Code (CRITIQUE)

#### Description

L'extension VS Code ouvre un panneau `vscode.WebviewPanel` qui affiche une interface de chat identique visuellement au client mobile. Ce WebView remplace intégralement le participant `@remote` comme surface d'interaction principale côté VS Code.

#### Comportement attendu

| ID | Comportement |
|----|-------------|
| F1-01 | Une commande `copilot-remote.openPanel` ouvre le WebView dans une colonne adjacente (colonne 2 par défaut). |
| F1-02 | Un raccourci clavier configurable (ex. `Ctrl+Shift+R`) déclenche la même commande. |
| F1-03 | Le WebView charge `index.html` depuis les ressources locales de l'extension (via `webview.asWebviewUri`). |
| F1-04 | Si le panel est déjà ouvert, la commande le remet au premier plan sans en créer un second. |
| F1-05 | Le WebView détecte son contexte via la variable globale `window.IS_VSCODE_WEBVIEW = true` injectée dans le HTML. |
| F1-06 | En contexte WebView, le champ de configuration d'URL et de token est masqué (connexion gérée par l'extension). |
| F1-07 | La communication entre le WebView et l'extension se fait exclusivement via `webview.postMessage()` et `window.addEventListener('message', ...)`. |
| F1-08 | Le participant `@remote` existant est maintenu en v2 pour compatibilité descendante mais marqué comme déprécié. |

#### Contraintes techniques

- L'extension doit déclarer les ressources locales dans `localResourceRoots` pour les charger dans le WebView.
- La Content Security Policy (CSP) du WebView doit autoriser uniquement les ressources locales (`vscode-resource:`). Les connexions WebSocket externes (WSS vers le VPS) sont gérées par l'extension elle-même, **pas** directement depuis le WebView.
- Le WebView communique avec l'extension via messages structurés (pas d'accès direct à `vscode` API depuis le HTML).
- Le participant `@remote` dans `participant.ts` voit son rôle réduit : il n'affiche plus la réponse dans le panel Chat natif, mais délègue au WebView.

#### Cas limites

- **WebView déchargé** (l'onglet VS Code n'est pas visible) : l'extension doit mettre les messages en file d'attente et les transmettre au WebView lors de sa réactivation (`onDidChangeViewState`).
- **Extension non connectée au bridge** : le WebView affiche un état "Déconnecté" avec un bouton de reconnexion.

---

### F2 — Synchronisation bidirectionnelle

#### Description

La conversation est un état partagé entre le client mobile et le WebView VS Code. Tout message envoyé ou reçu depuis l'une des interfaces est immédiatement visible dans l'autre.

#### Comportement attendu

| ID | Comportement |
|----|-------------|
| F2-01 | Un prompt envoyé depuis le mobile apparaît dans le WebView VS Code (bulle utilisateur). |
| F2-02 | Un prompt envoyé depuis le WebView VS Code est relayé au bridge et apparaît sur le mobile. |
| F2-03 | Chaque `response_chunk` reçu par l'extension est transmis simultanément au WebView et au bridge (→ mobile). |
| F2-04 | Le `response_end` marque la fin du streaming dans les deux interfaces. |
| F2-05 | Lors de la connexion d'un nouveau client (mobile ou WebView), le bridge envoie un `history_sync` avec les messages en mémoire. |
| F2-06 | Si le mobile envoie un prompt pendant que le WebView est déconnecté, l'échange est stocké en mémoire par l'extension et synchronisé à la reconnexion du WebView. |

#### Contraintes techniques

- L'extension VS Code est le **point de vérité** pour l'historique de conversation (tableau en mémoire).
- Le bridge ne stocke **aucun** historique : il relaie uniquement en temps réel.
- Les identifiants de message (`id`) sont des UUID v4 générés côté émetteur du prompt.

---

### F3 — Sélection du modèle LLM

#### Description

Un menu déroulant dans chaque interface permet de choisir le modèle Copilot actif. Le modèle sélectionné est synchronisé entre les deux interfaces et utilisé pour les requêtes suivantes.

#### Comportement attendu

| ID | Comportement |
|----|-------------|
| F3-01 | Un `<select>` (dropdown) est affiché dans la barre de statut ou le header des deux interfaces. |
| F3-02 | La liste des modèles disponibles est fournie par l'extension via un message `models_list` envoyé au WebView et au mobile lors de la connexion. |
| F3-03 | Lorsque l'utilisateur change de modèle, un message `model_change` est émis vers le bridge. |
| F3-04 | L'extension reçoit `model_change`, met à jour le modèle actif en mémoire, et diffuse un `status_full` aux deux interfaces. |
| F3-05 | Le modèle actif est affiché visuellement dans les deux interfaces (badge ou label). |
| F3-06 | Si le modèle demandé n'est pas disponible (ex. : `vscode.lm.selectChatModels` renvoie tableau vide), l'extension émet un message `error` avec un libellé explicite. |

#### Contraintes techniques

- Les modèles disponibles sont énumérés via `vscode.lm.selectChatModels({ vendor: 'copilot' })` sans filtre `family` (liste complète).
- Le modèle par défaut est `gpt-4o` (comportement v1 conservé).
- La sélection de modèle persiste en mémoire uniquement pendant la session de l'extension.

#### Cas limites

- **Modèle indisponible en cours de session** (ex. : quota épuisé) : l'extension retombe sur `gpt-4o` et notifie les interfaces via `error`.
- **Mobile déconnecté lors d'un changement de modèle** : le `status_full` est mis en file d'attente et envoyé à la reconnexion.

---

### F4 — Historique de conversation

#### Description

Les deux interfaces affichent l'intégralité de la conversation en cours. Un bouton permet de vider l'historique depuis l'une ou l'autre interface.

#### Comportement attendu

| ID | Comportement |
|----|-------------|
| F4-01 | L'historique est stocké en mémoire dans l'extension sous forme de tableau ordonné `ConversationMessage[]`. |
| F4-02 | Chaque entrée contient : `id` (UUID), `role` (`user` \| `assistant`), `text` (contenu complet), `timestamp` (ISO 8601), `model` (modèle utilisé). |
| F4-03 | Lors de la connexion d'un nouveau client, l'extension émet un `history_sync` contenant le tableau complet. |
| F4-04 | Un bouton "Vider" dans les deux interfaces émet un message `history_clear`. |
| F4-05 | À réception de `history_clear`, l'extension vide son tableau en mémoire et diffuse `history_clear` aux deux interfaces. |
| F4-06 | Les deux interfaces vidant leur affichage à réception de `history_clear`. |
| F4-07 | L'historique de contexte transmis à `vscode.lm` (messages précédents) est également réinitialisé à `history_clear`. |

#### Contraintes techniques

- Taille maximale de l'historique en mémoire : **200 messages** (protection mémoire). Au-delà, les messages les plus anciens sont supprimés (FIFO).
- L'historique n'est **pas** persisté entre sessions d'extension VS Code.
- Le `history_sync` ne doit pas dépasser la limite de `MAX_MESSAGE_BYTES` (64 Ko définie côté bridge). Si l'historique est trop volumineux, envoyer les N derniers messages qui tiennent dans la limite.

---

### F5 — Arrêt de génération

#### Description

Pendant le streaming d'une réponse Copilot, un bouton "Stop" est visible dans les deux interfaces. L'appui sur ce bouton annule la génération en cours.

#### Comportement attendu

| ID | Comportement |
|----|-------------|
| F5-01 | Pendant le streaming (entre le premier `response_chunk` et `response_end`), un bouton "Stop" remplace ou complète le bouton "Envoyer" dans les deux interfaces. |
| F5-02 | L'appui sur "Stop" émet un message `stop` (avec l'`id` du prompt en cours) vers le bridge. |
| F5-03 | Le bridge relaie `stop` à l'extension VS Code. |
| F5-04 | L'extension déclenche l'annulation via le `CancellationTokenSource` associé à la requête `vscode.lm`. |
| F5-05 | L'extension émet un `response_end` avec un champ `cancelled: true` pour notifier les deux interfaces. |
| F5-06 | Les deux interfaces masquent le bouton "Stop" et restituent le bouton "Envoyer". |
| F5-07 | Le texte partiellement généré est conservé dans l'historique et dans l'affichage. |

#### Contraintes techniques

- L'extension doit associer chaque requête en cours à un `vscode.CancellationTokenSource` stocké dans un `Map<id, CancellationTokenSource>`.
- Si un message `stop` arrive alors qu'aucune génération n'est en cours (race condition), il est ignoré silencieusement.
- Une seule génération peut être active simultanément (architecture mono-client).

#### Cas limites

- **Stop envoyé depuis le mobile alors que le WebView a déjà reçu `response_end`** : le bridge ignore `stop` (génération déjà terminée).
- **Déconnexion de l'extension pendant le streaming** : les interfaces doivent détecter l'absence de `response_end` et afficher le texte partiel avec un indicateur d'interruption.

---

### F6 — Thème partagé (design system)

#### Description

Un système de variables CSS centralisé garantit la cohérence visuelle entre le client mobile et le WebView VS Code. Les paramètres visuels sont personnalisables via les settings VS Code.

#### Comportement attendu

| ID | Comportement |
|----|-------------|
| F6-01 | Toutes les couleurs, espacements et typographies sont définis comme variables CSS dans `:root` dans `style.css`. |
| F6-02 | Le WebView VS Code injecte les valeurs du thème VS Code actif (via `vscode.window.activeColorTheme`) dans les variables CSS à l'ouverture du panel. |
| F6-03 | Un changement de thème VS Code (`vscode.window.onDidChangeActiveColorTheme`) déclenche une mise à jour des variables CSS dans le WebView (message `theme_update`). |
| F6-04 | Le setting `copilot-remote.theme` accepte les valeurs `auto` (suit VS Code), `dark` (forcé sombre), `light` (forcé clair). Valeur par défaut : `auto`. |
| F6-05 | Une couleur d'accent est configurable via `copilot-remote.accentColor` (valeur CSS, ex. `#f78166`). Par défaut : couleur GitHub (`#f78166`). |
| F6-06 | Le client mobile utilise `style.css` tel quel, avec le thème sombre GitHub comme défaut statique. |

#### Variables CSS obligatoires

```css
:root {
  --cr-bg-primary      /* fond principal */
  --cr-bg-secondary    /* fond secondaire (bulles assistant) */
  --cr-bg-user         /* fond bulle utilisateur */
  --cr-text-primary    /* texte principal */
  --cr-text-secondary  /* texte secondaire / métadonnées */
  --cr-accent          /* couleur d'accent (boutons, liens) */
  --cr-border          /* couleur des bordures */
  --cr-font-size-base  /* taille de police de base */
  --cr-radius          /* rayon de bordure global */
}
```

#### Contraintes techniques

- Les fichiers `index.html` et `style.css` du client mobile sont la **source principale** ; le WebView les charge via `webview.asWebviewUri`. Toute modification du design system doit être faite dans ces fichiers.
- La CSP du WebView n'autorise pas les styles inline (`style-src 'self'` sans `'unsafe-inline'`). Les variables CSS sont injectées via un `<style>` généré dynamiquement avec un nonce CSP.
- Le thème ne doit pas être re-rendu entièrement lors d'un changement ; seules les variables CSS sont mises à jour (pas de rechargement du WebView).

---

### F7 — Indicateurs de statut enrichis

#### Description

Les deux interfaces affichent en temps réel l'état complet du système : statut de connexion de chaque composant, modèle actif et latence réseau.

#### Comportement attendu

| ID | Comportement |
|----|-------------|
| F7-01 | La barre de statut affiche trois indicateurs distincts : **Mobile**, **VS Code** et **Bridge**. |
| F7-02 | Chaque indicateur prend l'un des états : `connected` (vert), `disconnected` (rouge), `connecting` (orange clignotant). |
| F7-03 | Le modèle LLM actif est affiché dans la barre de statut (ex. : `gpt-4o`). |
| F7-04 | Une mesure de latence (ping) en millisecondes est affichée et mise à jour toutes les 30 secondes via un message `ping` / `pong`. |
| F7-05 | En cas de latence > 500 ms, l'indicateur de latence passe en orange ; > 2000 ms, en rouge. |
| F7-06 | Le message `status_full` est émis par l'extension à chaque changement d'état et à la connexion de tout nouveau client. |
| F7-07 | Le bridge émet un message `bridge_status` lors de la connexion/déconnexion de chaque composant. |

#### Structure du message `status_full`

```json
{
  "type": "status_full",
  "vscode_connected": true,
  "mobile_connected": true,
  "active_model": "gpt-4o",
  "message_count": 12,
  "latency_ms": 45
}
```

#### Contraintes techniques

- Le ping/pong utilise les messages applicatifs JSON (pas les frames WebSocket ping/pong natifs) pour traverser les proxies.
- La mesure de latence est calculée côté client (mobile ou WebView) : `Date.now()` à l'émission du `ping`, soustrait à `Date.now()` à réception du `pong`.

---

## 5. Protocole de messages v2

### 5.1 Tableau complet des types de messages

| Type | Émetteur | Destinataire | Description |
|------|----------|--------------|-------------|
| `auth` | Extension / Mobile | Bridge | Authentification initiale (token) |
| `auth_ok` | Bridge | Extension / Mobile | Confirmation d'authentification |
| `prompt` | Mobile / WebView | Extension (via bridge) | Envoi d'un prompt utilisateur |
| `response_chunk` | Extension | Mobile + WebView | Fragment de réponse en streaming |
| `response_end` | Extension | Mobile + WebView | Fin du streaming |
| `model_change` | Mobile / WebView | Extension (via bridge) | Changement du modèle LLM actif |
| `models_list` | Extension | Mobile + WebView | Liste des modèles disponibles |
| `stop` | Mobile / WebView | Extension (via bridge) | Arrêt de la génération en cours |
| `history_sync` | Extension | Mobile / WebView | Envoi de l'historique complet |
| `history_clear` | Mobile / WebView / Extension | Tous | Vidage de l'historique |
| `status_full` | Extension | Mobile + WebView | Statut complet du système |
| `status` | Bridge | Mobile | Statut de connexion VS Code (v1, maintenu) |
| `ping` | Mobile / WebView | Bridge | Mesure de latence (aller) |
| `pong` | Bridge | Mobile / WebView | Réponse latence (retour) |
| `theme_update` | Extension | WebView | Mise à jour des variables CSS du thème |
| `error` | Bridge / Extension | Mobile / WebView | Notification d'erreur |

### 5.2 Schémas JSON des nouveaux types

#### `model_change`

```json
{
  "type": "model_change",
  "model": "claude-3-5-sonnet",
  "id": "<uuid-v4>"
}
```

Champs :
- `model` (string, obligatoire) : identifiant du modèle tel que retourné par `vscode.lm`.
- `id` (string, obligatoire) : UUID de corrélation.

#### `models_list`

```json
{
  "type": "models_list",
  "models": [
    { "id": "gpt-4o", "label": "GPT-4o", "vendor": "copilot" },
    { "id": "claude-3-5-sonnet", "label": "Claude 3.5 Sonnet", "vendor": "copilot" }
  ],
  "active_model": "gpt-4o"
}
```

#### `stop`

```json
{
  "type": "stop",
  "prompt_id": "<uuid-v4-du-prompt-en-cours>"
}
```

Champs :
- `prompt_id` (string, obligatoire) : identifiant du prompt dont la génération doit être annulée.

#### `history_sync`

```json
{
  "type": "history_sync",
  "messages": [
    {
      "id": "<uuid>",
      "role": "user",
      "text": "Explique les closures en JS",
      "timestamp": "2026-04-22T10:32:00Z",
      "model": null
    },
    {
      "id": "<uuid>",
      "role": "assistant",
      "text": "Une closure est...",
      "timestamp": "2026-04-22T10:32:05Z",
      "model": "gpt-4o"
    }
  ]
}
```

#### `history_clear`

```json
{
  "type": "history_clear",
  "id": "<uuid-v4>"
}
```

#### `status_full`

```json
{
  "type": "status_full",
  "vscode_connected": true,
  "mobile_connected": true,
  "active_model": "gpt-4o",
  "message_count": 12,
  "latency_ms": 45
}
```

#### `ping` / `pong`

```json
{ "type": "ping", "ts": 1745320800000 }
{ "type": "pong", "ts": 1745320800000 }
```

Champs : `ts` (integer) — timestamp Unix en millisecondes de l'émission du ping, recopié tel quel dans le pong.

#### `response_end` (mis à jour v2)

```json
{
  "type": "response_end",
  "id": "<uuid>",
  "cancelled": false
}
```

Champs ajoutés en v2 :
- `cancelled` (boolean, obligatoire) : `true` si la génération a été interrompue via `stop`.

### 5.3 Mise à jour des listes de types autorisés (bridge)

Le bridge FastAPI doit étendre ses filtres :

```python
# VS Code → Mobile (extension)
_VSCODE_ALLOWED_TYPES = frozenset({
    "response_chunk", "response_end", "error",
    "models_list", "history_sync", "history_clear",
    "status_full", "pong"
})

# Mobile → VS Code
_MOBILE_ALLOWED_TYPES = frozenset({
    "prompt", "model_change", "stop",
    "history_clear", "ping"
})
```

---

## 6. Architecture v2

### 6.1 Schéma général

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              Extension VS Code                                   │
│                                                                                  │
│  ┌─────────────────────┐    postMessage    ┌──────────────────────────────────┐  │
│  │    BridgeClient     │ ◄────────────►   │   WebView Panel (index.html)     │  │
│  │  (WebSocket ↔ VPS)  │                  │   style.css  |  app.js           │  │
│  └──────────┬──────────┘                  └──────────────────────────────────┘  │
│             │                                                                    │
│  ┌──────────▼──────────┐                                                         │
│  │  ConversationStore  │  (historique en mémoire, modèle actif, état streaming)  │
│  └──────────┬──────────┘                                                         │
│             │                                                                    │
│  ┌──────────▼──────────┐                                                         │
│  │   LLM Adapter       │  vscode.lm.selectChatModels() → sendRequest()           │
│  └─────────────────────┘                                                         │
└────────────────────────────────┬─────────────────────────────────────────────────┘
                                 │ WSS /ws/vscode
                    ┌────────────▼────────────┐
                    │   FastAPI Bridge (VPS)   │
                    │   /ws/vscode             │
                    │   /ws/mobile             │
                    └────────────┬────────────┘
                                 │ WSS /ws/mobile
                    ┌────────────▼────────────┐
                    │   Client Mobile          │
                    │   index.html             │
                    │   style.css  |  app.js   │
                    └─────────────────────────┘
```

### 6.2 Nouveau flux de données — prompt depuis le mobile

```
[Mobile] → {"type":"prompt","text":"...","id":"abc"} → [Bridge /ws/mobile]
    → [Bridge /ws/vscode] → [BridgeClient Extension]
    → ConversationStore.addUserMessage("abc", "...")
    → LLM Adapter.sendRequest(historique, modèleActif, cancellationToken)
    → pour chaque chunk :
        → ConversationStore.appendChunk("abc", chunk)
        → BridgeClient.send({"type":"response_chunk","text":chunk,"id":"abc"})  → Mobile
        → WebView.postMessage({"type":"response_chunk","text":chunk,"id":"abc"})
    → ConversationStore.finalizeMessage("abc")
    → BridgeClient.send({"type":"response_end","id":"abc","cancelled":false})   → Mobile
    → WebView.postMessage({"type":"response_end","id":"abc","cancelled":false})
```

### 6.3 Nouveau flux de données — prompt depuis le WebView

```
[WebView] → window.postMessage({"type":"prompt","text":"...","id":"xyz"})
    → Extension.onDidReceiveMessage → BridgeClient.send({"type":"prompt",...}) → Bridge → Mobile
    → LLM Adapter.sendRequest(...)
    → [même flux de chunks que ci-dessus]
```

### 6.4 Flux d'arrêt de génération

```
[Mobile ou WebView] → {"type":"stop","prompt_id":"abc"}
    → Bridge → Extension.BridgeClient.onMessage
    → CancellationTokenSource.cancel()
    → réponse partielle conservée dans ConversationStore
    → BridgeClient.send({"type":"response_end","id":"abc","cancelled":true})
    → WebView.postMessage({"type":"response_end","id":"abc","cancelled":true})
```

### 6.5 Nouveau composant : `ConversationStore`

Nouveau module TypeScript `conversationStore.ts` dans `extension/src/` :

```typescript
interface ConversationMessage {
  id: string;           // UUID v4
  role: 'user' | 'assistant';
  text: string;         // contenu complet (reconstruit des chunks pour assistant)
  timestamp: string;    // ISO 8601
  model: string | null; // null pour les messages utilisateur
}

class ConversationStore {
  addUserMessage(id: string, text: string): void;
  startAssistantMessage(id: string, model: string): void;
  appendChunk(id: string, chunk: string): void;
  finalizeMessage(id: string): void;
  clear(): void;
  getHistory(): ConversationMessage[];
  toLMMessages(): vscode.LanguageModelChatMessage[];
}
```

---

## 7. Priorisation MoSCoW

### Must-have — v2.0

| ID | Fonctionnalité | Justification |
|----|----------------|---------------|
| F1 | WebView Panel VS Code | Objectif principal de v2 |
| F2 | Synchronisation bidirectionnelle | Condition sine qua non de la cohérence |
| F4 | Historique de conversation (affichage + `history_sync`) | Requis pour la continuité de l'expérience |
| F6 | Thème partagé — variables CSS et source HTML unique | Fondement de la cohérence visuelle |
| — | Protocole v2 (nouveaux types de messages dans le bridge) | Prérequis technique de toutes les features |

### Should-have — v2.1

| ID | Fonctionnalité | Justification |
|----|----------------|---------------|
| F3 | Sélection du modèle LLM | Forte demande, non bloquante pour v2.0 |
| F5 | Arrêt de génération | Améliore fortement l'UX, complexité modérée |
| F4 (partiel) | Vidage de l'historique | Dépend du ConversationStore déjà livré en v2.0 |
| F7 | Indicateurs de statut enrichis | Visibilité système, non fonctionnel critique |

### Nice-to-have — v3

| ID | Fonctionnalité | Justification |
|----|----------------|---------------|
| F6 (avancé) | Personnalisation couleur d'accent via settings VS Code | Confort utilisateur |
| F7 (avancé) | Mesure de latence ping/pong | Diagnostic réseau, faible valeur métier |
| — | Persistance de l'historique entre sessions (fichier JSON local) | Hors V2 (mémoire uniquement) |
| — | Support de plusieurs conversations (onglets) | Complexité architecturale élevée |
| — | Envoi de fichiers / contexte de code dans le prompt | Nécessite refonte du protocole |

---

## 8. Points ouverts

| # | Question | Impact | Responsable |
|---|----------|--------|-------------|
| PO-01 | Le WebView partage-t-il **exactement** le même `index.html` que le client mobile, ou une copie avec adaptation minime ? Stratégie de build à définir (symlink, script de copie, monorepo). | F1, F6 | À définir |
| PO-02 | Le participant `@remote` est-il **supprimé** en v2.0 ou **maintenu en parallèle** pour compatibilité ? Impacte la gestion de `chatContext.history`. | F1 | À définir |
| PO-03 | La liste des modèles Copilot disponibles est-elle énumérée **au démarrage** de l'extension uniquement, ou rafraîchie périodiquement ? | F3 | À définir |
| PO-04 | Quelle est la limite de taille du payload `history_sync` acceptée par le bridge (actuellement 64 Ko) ? Faut-il augmenter la limite ou paginer l'historique ? | F4 | À définir |
| PO-05 | Le nonce CSP pour l'injection des variables CSS du thème doit-il être généré côté extension (recommandé) ou peut-on utiliser `'unsafe-inline'` en mode développement ? | F6 | À définir |
| PO-06 | Le ping/pong est-il géré **par le bridge** (qui répond) ou **bout-en-bout** (le mobile mesure la latence jusqu'à l'extension VS Code) ? | F7 | À définir |
| PO-07 | En cas de déconnexion du bridge pendant le streaming, comment l'extension doit-elle se comporter : annuler la génération, ou continuer et mettre les chunks en file d'attente ? | F2, F5 | À définir |
