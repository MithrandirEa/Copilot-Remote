# Copilot Remote Bridge

> Pilotez GitHub Copilot Chat depuis votre smartphone via WebSockets Secure.

![Python](https://img.shields.io/badge/python-3.12+-blue?logo=python)
![Node](https://img.shields.io/badge/node-18+-green?logo=node.js)
![TypeScript](https://img.shields.io/badge/typescript-5.4+-blue?logo=typescript)
![License](https://img.shields.io/badge/license-MIT-green)
![Tests](https://img.shields.io/badge/tests-passing-brightgreen)
![VS Code](https://img.shields.io/badge/vscode-1.90+-007ACC?logo=visual-studio-code)

---

## Table des matières

1. [Présentation](#présentation)
2. [Fonctionnalités](#fonctionnalités)
3. [Architecture](#architecture)
4. [Prérequis](#prérequis)
5. [Installation](#installation)
6. [Configuration](#configuration)
7. [Utilisation](#utilisation)
8. [Sécurité](#sécurité)
9. [Développement](#développement)
10. [Licence](#licence)

---

## Présentation

Copilot Remote Bridge est une extension VS Code et un serveur relais permettant d'interagir avec GitHub Copilot depuis n'importe quel navigateur mobile, sans jamais exposer VS Code directement sur Internet. Les échanges transitent par un serveur FastAPI hébergé sur VPS, protégés par TLS et authentification par token.

Le projet se compose de trois composants indépendants :

| Composant | Dossier | Rôle |
|-----------|---------|------|
| Extension VS Code | `extension/` | Pilote Copilot, expose un WebView et un participant `@remote` |
| Serveur relais | `server/` | Hub WebSocket FastAPI, relaie les messages entre extension et client |
| Client mobile | `client/` | Web App HTML/JS/CSS, interface de chat pour smartphone |

---

## Fonctionnalités

### Contrôle déporté
- **Envoi de prompts** depuis n'importe quel navigateur mobile via WSS
- **Streaming en temps réel** : les réponses Copilot s'affichent mot par mot
- **Stop génération** : annulation du streaming en cours depuis le mobile ou le WebView

### Interface WebView intégrée
- **Panel de chat dans VS Code** : interface graphique sans quitter l'éditeur (`Ouvrir le panel Copilot Remote`)
- **Sélection du modèle LLM** : dropdown pour choisir le modèle Copilot actif (ex. `gpt-4o`, `gpt-4o-mini`, `claude-3.5-sonnet`)
- **Vider l'historique** : bouton dédié dans le panel

### Participant natif Copilot
- **`@remote`** : participant intégré au panel Chat VS Code natif, utilise le même pipeline LLM

### Historique et synchronisation
- **ConversationStore** : historique centralisé en mémoire, partagé entre WebView et client mobile
- **Synchronisation à la (re)connexion** : l'historique est envoyé automatiquement aux nouveaux clients
- **Vider l'historique** : action disponible depuis les deux interfaces

### Statut enrichi
- Modèle LLM actif, nombre de messages, état de connexion des clients mobiles

### Sécurité
- **Authentification HMAC** : token partagé 256 bits, comparaison `hmac.compare_digest` résistante aux timing attacks
- **Reconnexion automatique** : backoff exponentiel plafonné à 30 s côté extension et client
- **Zéro exposition directe** : le smartphone ne connaît que le VPS, jamais VS Code directement

---

## Architecture

```
┌─────────────────┐         WSS          ┌─────────────────────────┐         WSS          ┌─────────────────────┐
│   Smartphone    │ ──────────────────── │   FastAPI / VPS Ionos   │ ──────────────────── │  Extension VS Code  │
│  (navigateur)   │     /ws/mobile       │  votre-bridge-domain    │     /ws/vscode        │  (Copilot + Panel)  │
└─────────────────┘                      └─────────────────────────┘                       └─────────────────────┘
```

**Flux de données :**

```
Saisie mobile ou WebView
    │
    ▼  {"type":"prompt","text":"...","id":"<uuid>"}
[/ws/mobile] ──► serveur relais ──► [/ws/vscode]
                                         │
                                         ▼  vscode.lm → Copilot (modèle sélectionné)
                                    [CopilotEngine]
                                         │
                                         ▼  {"type":"response_chunk","text":"...","id":"..."}
[/ws/mobile] ◄── serveur relais ◄── [/ws/vscode]
    │
    ▼  rendu Markdown (marked.js + DOMPurify)
[Client mobile / WebView]
```

**Structure du projet :**

```
Copilot-Remote/
├── extension/              # Extension VS Code (TypeScript)
│   ├── src/
│   │   ├── extension.ts        # Point d'entrée, commandes, barre de statut
│   │   ├── bridgeClient.ts     # Client WebSocket avec reconnexion automatique
│   │   ├── copilotEngine.ts    # Pipeline LLM unifié (WebView + mobile)
│   │   ├── conversationStore.ts# Historique in-memory centralisé
│   │   ├── webviewPanel.ts     # Panel WebView (singleton)
│   │   ├── config.ts           # Token (SecretStorage) et URL serveur
│   │   └── participant.ts      # Participant @remote (Chat VS Code natif)
│   └── webview/
│       ├── panel.html          # Interface du panel de chat
│       └── panelApp.js         # Logique JS du WebView
├── server/                 # Serveur relais FastAPI (Python)
│   ├── src/
│   │   ├── main.py             # Hub WebSocket, relay de messages
│   │   └── auth.py             # Authentification par token
│   └── tests/
├── client/                 # Client mobile (HTML/CSS/JS statique)
│   ├── index.html
│   ├── app.js
│   └── style.css
├── shared/                 # Design system partagé (WebView + mobile)
│   ├── theme.css               # Variables CSS (couleurs, typographie)
│   └── components.css          # Composants UI réutilisables
└── .github/
    └── copilot-instructions.md
```

---

## Prérequis

| Composant | Version minimale |
|-----------|------------------|
| VS Code | 1.90+ |
| GitHub Copilot (extension) | actif et authentifié |
| Node.js | 18+ |
| Python | 3.12+ |
| Docker CE + Compose v2 | dernière version stable |
| Caddy (reverse proxy) | actif sur le VPS |

---

## Installation

### Extension VS Code

1. Cloner le dépôt et se placer dans le dossier `extension/` :

   ```bash
   cd extension
   npm install
   npm run package           # génère dist/extension.js (mode production)
   npx vsce package          # génère copilot-remote-0.1.0.vsix
   ```

2. Installer le `.vsix` dans VS Code :

   ```bash
   code --install-extension copilot-remote-0.1.0.vsix
   ```

### Serveur relais (VPS)

Le guide de déploiement complet — transfert de fichiers, configuration `.env`, Docker Compose, intégration Caddy — se trouve dans [`server/deploy.md`](server/deploy.md).

### Client mobile

Aucune installation requise. Ouvrez `https://<votre-domaine>` dans le navigateur de votre smartphone. La configuration s'effectue à l'écran au premier lancement.

---

## Configuration

### 1. Générer le token secret

Sur le VPS (ou en local) :

```bash
openssl rand -hex 32
```

Conservez la valeur — elle sera saisie dans les trois composants.

### 2. Configurer le serveur relais

Copiez `server/.env.example` en `server/.env` et renseignez les valeurs :

```dotenv
# Token partagé entre tous les clients (extension VS Code + navigateur mobile).
# Générer avec : openssl rand -hex 32
AUTH_SECRET_TOKEN=remplacer_par_votre_secret_64_chars_hex

# Niveau de log uvicorn (info | warning | error | critical)
LOG_LEVEL=warning

# Environnement (development | production)
ENVIRONMENT=production
```

### 3. Configurer l'extension VS Code

Ouvrez les paramètres VS Code (`Ctrl+,`) et recherchez **Copilot Remote** :

| Paramètre | Valeur par défaut | Description |
|-----------|-------------------|-------------|
| `copilot-remote.serverUrl` | `wss://your-bridge-domain` | URL WSS du serveur relais |

Lors du premier appel à la commande **Copilot Remote: Connecter au serveur**, une invite demande le token. Il est ensuite stocké dans `vscode.SecretStorage` (chiffrement OS).

### 4. Configurer le client mobile

Au premier chargement, un écran de configuration demande :

- **URL du serveur** (ex. `wss://<votre-domaine>`)
- **Token d'authentification**

Ces valeurs sont persistées en `sessionStorage` (effacées à la fermeture de l'onglet).

---

## Utilisation

1. **Démarrer le serveur** sur le VPS :
   ```bash
   docker compose up -d
   ```

2. **Connecter l'extension** : palette de commandes → **Copilot Remote: Connecter au serveur**
   - La barre de statut affiche l'état de connexion et le modèle actif

3. **Ouvrir le panel intégré** (optionnel) : palette de commandes → **Ouvrir le panel Copilot Remote**
   - Permet d'interagir avec Copilot sans quitter VS Code
   - Sélection du modèle LLM via le dropdown
   - Bouton pour vider l'historique

4. **Ouvrir le client mobile** dans le navigateur de votre smartphone

5. **Envoyer un message** : rédigez votre prompt et appuyez sur **Envoyer** (ou `Entrée`)

6. La réponse Copilot s'affiche en streaming avec rendu Markdown

7. **Arrêter une génération** : bouton **Stop** disponible dans le panel et sur le client mobile

> Le participant `@remote` peut également être utilisé directement dans le panel Chat VS Code natif :
> tapez `@remote <votre question>`.

---

## Sécurité

| Mesure | Description |
|--------|-------------|
| **WSS (TLS)** | Toutes les connexions WebSocket sont chiffrées — TLS géré par Caddy |
| **Token HMAC 256 bits** | Secret partagé fort, comparaison `hmac.compare_digest` résistante aux timing attacks |
| **Stockage sécurisé** | Token stocké dans `vscode.SecretStorage` (chiffrement OS) côté extension |
| **DOMPurify** | Toutes les réponses Copilot sont assainies avant injection DOM côté client |
| **sessionStorage** | Token mobile jamais persisté au-delà de la session navigateur |
| **MAX_MESSAGE_BYTES** | Limite à 64 Ko par message — protection contre les attaques DoS mémoire |
| **Anti-éviction** | Une seule session VS Code et une seule session mobile simultanément (code 1008) |
| **Docker non-root** | Le conteneur s'exécute sans privilèges root |
| **En-têtes Caddy** | HSTS, X-Frame-Options, X-Content-Type-Options, CSP, Permissions-Policy |

---

## Développement

### Extension VS Code

```bash
cd extension
npm install
npm run compile        # build de développement
npm run watch          # rebuild automatique à la modification
npm run test:unit      # tests unitaires (mocha, sans instance VS Code)
```

### Serveur FastAPI

```bash
cd server
pip install -r requirements.txt
pytest tests/                   # tous les tests
pytest --cov=src tests/         # avec couverture de code
```

### Client mobile

Aucun outil de build requis. Servez le dossier avec un serveur HTTP statique :

```bash
python3 -m http.server 3000 --directory client
```

---

## Licence

MIT
