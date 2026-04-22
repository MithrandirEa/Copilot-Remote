# Copilot Remote Bridge

> Pilotez GitHub Copilot Chat depuis votre smartphone via WebSockets Secure.

![Python](https://img.shields.io/badge/python-3.12+-blue?logo=python)
![Node](https://img.shields.io/badge/node-18+-green?logo=node.js)
![License](https://img.shields.io/badge/license-MIT-green)
![Tests](https://img.shields.io/badge/tests-25%20passing-brightgreen)

---

## Table des matières

1. [Fonctionnalités](#fonctionnalités)
2. [Architecture](#architecture)
3. [Prérequis](#prérequis)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [Utilisation](#utilisation)
7. [Sécurité](#sécurité)
8. [Développement](#développement)
9. [Licence](#licence)

---

## Fonctionnalités

- **Contrôle déporté** : envoyez des prompts à GitHub Copilot depuis n'importe quel navigateur mobile
- **Streaming en temps réel** : les réponses Copilot s'affichent mot par mot sur le client
- **Participant `@remote`** : intégration native au panel Chat VS Code via `vscode.lm` (modèle `gpt-4o`)
- **Reconnexion automatique** : l'extension et le client mobile se reconnectent avec backoff exponentiel (plafonné à 30 s)
- **Authentification HMAC** : token partagé 256 bits, comparaison en temps constant `hmac.compare_digest`
- **Zéro exposition directe** : le smartphone ne connaît que le VPS, jamais VS Code directement

---

## Architecture

```
┌─────────────────┐         WSS          ┌─────────────────────────┐         WSS          ┌─────────────────────┐
│   Smartphone    │ ──────────────────── │   FastAPI / VPS Ionos   │ ──────────────────── │  Extension VS Code  │
│  (navigateur)   │     /ws/mobile       │  votre-bridge-domain    │     /ws/vscode        │  (Copilot Chat)     │
└─────────────────┘                      └─────────────────────────┘                       └─────────────────────┘
```

**Flux de données :**

```
Saisie mobile
    │
    ▼  {"type":"prompt","text":"...","id":"<uuid>"}
[/ws/mobile] ──► serveur relais ──► [/ws/vscode]
                                         │
                                         ▼  vscode.lm → Copilot gpt-4o
                                    [participant @remote]
                                         │
                                         ▼  {"type":"response_chunk","text":"...","id":"..."}
[/ws/mobile] ◄── serveur relais ◄── [/ws/vscode]
    │
    ▼  rendu Markdown (DOMPurify)
[Client mobile]
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

### 2. Configurer l'extension VS Code

Ouvrez les paramètres VS Code (`Ctrl+,`) et recherchez **Copilot Remote** :

| Paramètre | Valeur par défaut | Description |
|-----------|-------------------|-------------|
| `copilot-remote.serverUrl` | `wss://<votre-domaine>` | URL WSS du serveur relais |

Lors du premier appel à la commande **Copilot Remote: Connecter au serveur**, une invite demande le token. Il est ensuite stocké dans `vscode.SecretStorage` (chiffrement OS).

### 3. Configurer le client mobile

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
   - La barre de statut affiche `$(plug) Copilot Remote: connecté`

3. **Ouvrir le client mobile** dans le navigateur de votre smartphone

4. **Envoyer un message** : rédigez votre prompt et appuyez sur **Envoyer** (ou `Entrée`)

5. La réponse Copilot s'affiche en streaming avec rendu Markdown

> Le participant `@remote` peut également être utilisé directement dans le panel Chat VS Code :
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
