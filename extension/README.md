# Extension VS Code — Copilot Remote Bridge

Extension VS Code qui connecte GitHub Copilot Chat à un serveur relais WebSocket, permettant de piloter Copilot depuis un client mobile distant.

---

## Table des matières

1. [Description](#description)
2. [Commandes disponibles](#commandes-disponibles)
3. [Configuration](#configuration)
4. [Participant `@remote`](#participant-remote)
5. [Authentification](#authentification)
6. [Développement](#développement)

---

## Description

L'extension s'enregistre comme participant de chat VS Code (`@remote`) et établit une connexion WebSocket vers un serveur relais. Elle écoute les prompts entrants depuis le mobile, les soumet au modèle Copilot `gpt-4o` via `vscode.lm`, et streame chaque fragment de réponse vers le serveur pour qu'il soit relayé au client mobile.

**Flux :**

```
Prompt mobile → serveur relais → extension → Copilot gpt-4o
                                                    │
                          serveur relais ← extension ← réponse (streaming)
```

Une reconnexion automatique est intégrée : en cas de déconnexion, l'extension tente de se reconnecter avec un délai exponentiel plafonné à 30 secondes.

---

## Commandes disponibles

Toutes les commandes sont accessibles via la palette de commandes (`Ctrl+Shift+P` / `Cmd+Shift+P`).

| Commande | ID | Description |
|----------|----|-------------|
| **Copilot Remote: Connecter au serveur** | `copilot-remote.connect` | Établit la connexion WebSocket vers le serveur relais. Demande le token au premier appel si non encore stocké. |
| **Copilot Remote: Déconnecter du serveur** | `copilot-remote.disconnect` | Ferme proprement la connexion WebSocket. |
| **Copilot Remote: Supprimer le token stocké** | `copilot-remote.clearToken` | Supprime le token d'authentification de `vscode.SecretStorage`. |

---

## Configuration

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `copilot-remote.serverUrl` | `string` | `wss://copilot.mithrandirea.info` | URL WSS du serveur relais. Modifier si vous hébergez votre propre instance. |

**Exemple `settings.json` :**

```json
{
  "copilot-remote.serverUrl": "wss://votre-serveur.example.com"
}
```

---

## Participant `@remote`

Le participant `@remote` est disponible dans le panel Chat VS Code après activation de l'extension.

**Utilisation directe dans Chat :**

```
@remote Explique le fonctionnement de ce code
```

**Comportement :**

- Transmet la requête au modèle Copilot `gpt-4o` via `vscode.lm.selectChatModels`
- Prend en compte l'historique du chat pour contextualiser la réponse
- Streame chaque fragment de réponse à la fois dans le panel Chat et vers le client mobile connecté
- Envoie un message `response_end` à la fin du streaming (ou en cas d'erreur)

Si aucun modèle Copilot n'est disponible (GitHub Copilot inactif ou non authentifié), un message d'avertissement s'affiche dans le Chat.

---

## Authentification

L'extension utilise **`vscode.SecretStorage`** pour stocker le token, qui est chiffré par le système d'exploitation (Credential Manager sous Windows, Keychain sous macOS, libsecret sous Linux).

**Flux au premier démarrage :**

1. Exécuter **Copilot Remote: Connecter au serveur**
2. Une invite s'affiche : _"Token d'authentification Copilot Remote"_
3. Coller la valeur de `AUTH_SECRET_TOKEN` générée sur le VPS
4. Le token est stocké — les connexions suivantes (y compris à la réouverture de VS Code) utilisent le token stocké automatiquement

**Révoquer le token :**

Exécuter **Copilot Remote: Supprimer le token stocké**, puis générer un nouveau token sur le VPS et resaisir lors de la prochaine connexion.

---

## Développement

### Prérequis

- Node.js 18+
- TypeScript 5.4+

### Commandes

```bash
# Installer les dépendances
npm install

# Build de développement (non minifié)
npm run compile

# Rebuild automatique à chaque modification
npm run watch

# Build de production (minifié, pour le packaging)
npm run package

# Générer le fichier .vsix installable
npx vsce package

# Tests unitaires (mocha, sans instance VS Code)
npm run test:unit
```

### Structure des sources

```
src/
├── extension.ts      # Point d'entrée — activation, commandes, reconnexion auto
├── bridgeClient.ts   # Client WebSocket (auth, reconnexion, envoi/réception)
├── participant.ts    # Participant @remote (vscode.lm, streaming)
├── config.ts         # Accès à vscode.SecretStorage et aux paramètres
└── test/
    ├── bridgeClient.test.ts
    └── config.test.ts
```

### Tests

Les tests unitaires utilisent **mocha** et des mocks manuels pour `vscode` et `ws` — ils s'exécutent sans ouvrir VS Code :

```bash
npm run test:unit
```
