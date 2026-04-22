# API — Copilot Remote Bridge

Documentation de l'API du serveur relais FastAPI.

---

## Table des matières

1. [Endpoint HTTP](#endpoint-http)
2. [Endpoints WebSocket](#endpoints-websocket)
   - [/ws/vscode](#wsvscode)
   - [/ws/mobile](#wsmobile)
3. [Protocole de messages](#protocole-de-messages)
4. [Codes de fermeture WebSocket](#codes-de-fermeture-websocket)
5. [Limites et timeouts](#limites-et-timeouts)

---

## Endpoint HTTP

### `GET /health`

Vérifie l'état de santé du serveur. Utilisé par le healthcheck Docker et le reverse proxy.

**Réponse `200 OK` :**

```json
{ "status": "ok" }
```

---

## Endpoints WebSocket

### Authentification commune

Les deux endpoints WebSocket suivent le même flux d'authentification :

1. Le client établit la connexion WebSocket (TLS géré par Caddy)
2. Le serveur attend le **premier message** dans un délai de **5 secondes**
3. Le client envoie :
   ```json
   { "type": "auth", "token": "<AUTH_SECRET_TOKEN>" }
   ```
4. Si valide, le serveur répond :
   ```json
   { "type": "auth_ok" }
   ```
   La connexion est alors maintenue et les échanges peuvent commencer.
5. Si invalide ou timeout, le serveur ferme la connexion avec le code `1008`

---

### `/ws/vscode`

Endpoint réservé à l'extension VS Code. Relaie les réponses Copilot vers le client mobile.

**Une seule session VS Code simultanément.** Toute tentative de connexion concurrente est rejetée (code `1008`).

#### Messages entrants (VS Code → serveur)

| Type | Champs | Description |
|------|--------|-------------|
| `auth` | `token: string` | Premier message obligatoire — authentification |
| `response_chunk` | `text: string`, `id: string` | Fragment de réponse Copilot en streaming |
| `response_end` | `id: string` | Signal de fin de réponse pour l'`id` donné |
| `error` | `message: string` | Erreur applicative côté extension |

> Tout autre type de message est ignoré sans fermeture de connexion.

#### Messages sortants (serveur → VS Code)

| Type | Champs | Description |
|------|--------|-------------|
| `auth_ok` | — | Authentification réussie |

#### Comportement à la déconnexion

À la déconnexion de l'extension, le serveur envoie automatiquement au client mobile :

```json
{ "type": "status", "vscode_connected": false }
```

---

### `/ws/mobile`

Endpoint réservé au client mobile. Relaie les prompts vers l'extension VS Code et notifie l'état de connexion.

**Une seule session mobile simultanément.** Toute tentative de connexion concurrente est rejetée (code `1008`).

#### Messages entrants (mobile → serveur)

| Type | Champs | Description |
|------|--------|-------------|
| `auth` | `token: string` | Premier message obligatoire — authentification |
| `prompt` | `text: string`, `id: string` | Prompt utilisateur à relayer vers VS Code |

> Tout autre type de message est ignoré sans fermeture de connexion.

#### Messages sortants (serveur → mobile)

| Type | Champs | Description |
|------|--------|-------------|
| `auth_ok` | — | Authentification réussie |
| `status` | `vscode_connected: boolean` | État de connexion de l'extension VS Code |
| `response_chunk` | `text: string`, `id: string` | Fragment de réponse Copilot (relayé depuis VS Code) |
| `response_end` | `id: string` | Fin de réponse pour l'`id` donné (relayé depuis VS Code) |
| `error` | `message: string` | Erreur applicative (relayée depuis VS Code) |

> À la connexion, le serveur envoie immédiatement un message `status` reflétant l'état courant de l'extension VS Code.

---

## Protocole de messages

Tableau complet de tous les types de messages échangés dans le système.

| Type | Direction | Champs | Description |
|------|-----------|--------|-------------|
| `auth` | client → serveur | `token: string` | Authentification initiale (premier message) |
| `auth_ok` | serveur → client | — | Confirmation d'authentification |
| `prompt` | mobile → VS Code | `text: string`, `id: string` | Prompt de l'utilisateur. `id` = UUID de corrélation |
| `response_chunk` | VS Code → mobile | `text: string`, `id: string` | Fragment de réponse Copilot en streaming |
| `response_end` | VS Code → mobile | `id: string` | Fin du streaming pour la requête `id` |
| `status` | serveur → mobile | `vscode_connected: boolean` | État de connexion de l'extension VS Code |
| `error` | VS Code → mobile | `message: string` | Erreur applicative côté extension |

---

## Codes de fermeture WebSocket

| Code | Nom | Déclencheur |
|------|-----|-------------|
| `1000` | Fermeture normale | Déconnexion propre (dispose, arrêt serveur) |
| `1008` | Violation de politique | Authentification échouée, timeout d'auth, ou session déjà active sur l'endpoint |
| `1009` | Message trop volumineux | Message dépassant `MAX_MESSAGE_BYTES` (64 Ko) |

---

## Limites et timeouts

| Constante | Valeur | Description |
|-----------|--------|-------------|
| `MAX_MESSAGE_BYTES` | 65 536 octets (64 Ko) | Taille maximale d'un message WebSocket — protection contre les attaques DoS mémoire |
| `AUTH_TIMEOUT_SECONDS` | 5 s | Délai maximal pour recevoir le message d'authentification côté serveur |
