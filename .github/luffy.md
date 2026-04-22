# Plan de développement — Remote Copilot Bridge

> Capitaine : Luffy  
> Date de création : 2026-04-22  
> Dernière mise à jour : 2026-04-22  
> Statut : 🔵 En cours — v2 en développement

---

## v1.0.0 — Version de référence ✅ Terminée (tag `v1.0.0`)

Interface de contrôle déportée opérationnelle : client mobile ↔ bridge FastAPI ↔ extension VS Code via WSS. Branche `main` stable.

---

## v2 — Interface unifiée & contrôle total du panel

> Branche : `development`  
> Objectif : Les interfaces mobile ET VS Code doivent se ressembler et être entièrement contrôlables par l'utilisateur.

### Vision v2

Remplacer le panel Chat intégré de VS Code par un **WebView personnalisé** dans l'extension. Ce WebView partage le même HTML/CSS que le client mobile — une seule source de vérité pour le design. Les deux interfaces affichent la même conversation en temps réel.

```
[Smartphone]    <--WSS-->   [FastAPI/VPS]   <--WSS-->   [Extension VS Code]
  client/                    /ws/mobile                     /ws/vscode
  index.html                 /ws/vscode                   WebView (shared UI)
  app.js                                                   extension/webview/
  style.css ──────────────────────────────────────── shared ──────────────────
```

### Protocole v2 (nouveaux types de messages)

| Type | Direction | Description |
|------|-----------|-------------|
| `stop` | Mobile/WebView → Bridge → Extension | Arrêter la génération en cours |
| `model_change` | Mobile/WebView → Bridge → Extension | Changer le modèle LLM |
| `history_sync` | Extension → Bridge → Mobile/WebView | Synchroniser l'historique complet |
| `history_clear` | Mobile/WebView → Bridge → Extension | Vider l'historique |
| `status_full` | Extension → Bridge → Mobile/WebView | Statut complet (modèle, nb messages, latence) |

---

## Phases de développement v2

### Phase 1 — Design system partagé (F6)
> Statut : ✅ Terminé (commit `39c8a5e`)  
> Priorité : **Must-have**

- [x] Extraire les variables CSS de `client/style.css` vers un fichier `shared/theme.css` — Agent(s) : **Law**
- [x] Créer `extension/webview/` — dossier pour les assets HTML/CSS/JS du WebView — Agent(s) : **Law**
- [x] Symlink ou build step pour partager `shared/theme.css` entre `client/` et `extension/webview/` — Agent(s) : **Franky**
- [x] Vérification qualité du design system — Agent(s) : **Mihawk**

### Phase 2 — WebView panel VS Code (F1)
> Statut : ✅ Terminé (commit `3a37ed2`)  
> Priorité : **Must-have**

- [x] Créer `extension/webview/panel.html` — clone de `client/index.html` adapté au WebView VS Code — Agent(s) : **Law**
- [x] Créer `extension/src/webviewPanel.ts` — classe `ConversationPanel` avec `vscode.WebviewPanel` — Agent(s) : **Law**
- [x] Remplacer `workbench.action.chat.open` par l'ouverture du WebView dans `extension.ts` — Agent(s) : **Law**
- [x] Communication bidirectionnelle WebView ↔ Extension via `postMessage` — Agent(s) : **Law**
- [x] Commande `copilot-remote.openPanel` pour ouvrir le WebView — Agent(s) : **Law**
- [ ] Tests unitaires du WebView panel — Agent(s) : **Chopper** (Phase 7)

### Phase 3 — Synchronisation bidirectionnelle (F2)
> Statut : ⬜ À faire  
> Priorité : **Must-have**

- [ ] `ConversationStore` dans l'extension — source de vérité de l'historique (tableau de messages) — Agent(s) : **Implémentation directe**
- [ ] Message `history_sync` : lors de la connexion mobile, l'extension envoie l'historique complet — Agent(s) : **Implémentation directe**
- [ ] Diffusion simultanée des chunks vers le WebView ET le mobile — Agent(s) : **Implémentation directe**
- [ ] Nouveau type de message `history_sync` dans le bridge FastAPI — Agent(s) : **Implémentation directe**
- [ ] Tests d'intégration synchronisation — Agent(s) : **Chopper**

### Phase 4 — Historique & contrôles (F4 + F5)
> Statut : ⬜ À faire  
> Priorité : **Must-have (F4) / Should-have (F5)**

- [ ] Bouton "Vider l'historique" dans les deux interfaces — Agent(s) : **Implémentation directe**
- [ ] Message `history_clear` propagé aux deux interfaces — Agent(s) : **Implémentation directe**
- [ ] Bouton "Stop" visible pendant le streaming dans les deux interfaces — Agent(s) : **Implémentation directe**
- [ ] Signal `stop` — annulation du `sendRequest` Copilot via `CancellationToken` — Agent(s) : **Implémentation directe**
- [ ] Propagation `stop` via bridge → extension — Agent(s) : **Implémentation directe**

### Phase 5 — Sélection du modèle LLM (F3)
> Statut : ⬜ À faire  
> Priorité : **Should-have**

- [ ] Dropdown modèle dans les deux interfaces — Agent(s) : **Implémentation directe**
- [ ] Message `model_change` propagé via bridge — Agent(s) : **Implémentation directe**
- [ ] `participant.ts` utilise le modèle sélectionné (plus de `gpt-4o` hardcodé) — Agent(s) : **Implémentation directe**

### Phase 6 — Statuts enrichis (F7)
> Statut : ⬜ À faire  
> Priorité : **Should-have**

- [ ] Message `status_full` : modèle actif, nb messages, état connexions — Agent(s) : **Implémentation directe**
- [ ] Indicateurs de statut dans les deux interfaces — Agent(s) : **Implémentation directe**

### Phase 7 — Tests & qualité
> Statut : ⬜ À faire

- [ ] Tests unitaires complets (WebView, ConversationStore, nouveaux messages) — Agent(s) : **Chopper**
- [ ] Revue de code architecture v2 — Agent(s) : **Mihawk**
- [ ] Audit sécurité des nouveaux messages — Agent(s) : **Mihawk**

### Phase 8 — Documentation & déploiement
> Statut : ⬜ À faire

- [ ] Mettre à jour le README avec les nouvelles fonctionnalités v2 — Agent(s) : **Robin**
- [ ] Mettre à jour `copilot-instructions.md` — Agent(s) : **Luffy**
- [ ] Build VSIX v2 + déploiement extension — Agent(s) : **Implémentation directe**
- [ ] Déploiement bridge v2 sur VPS — Agent(s) : **Sanji**
- [ ] Tag `v2.0.0` sur `main` après merge — Agent(s) : **Luffy**

---

## Assignation des agents

| Agent | Tâches assignées | Statut |
|-------|-----------------|--------|
| **Law** | Design system partagé, restructuration dossiers | ⬜ |
| **Franky** | Build step CSS partagé | ⬜ |
| **Chopper** | Tests unitaires WebView, ConversationStore, intégration | ⬜ |
| **Mihawk** | Revue architecture v2, audit sécurité | ⬜ |
| **Sanji** | Déploiement bridge v2 sur VPS | ⬜ |
| **Robin** | Documentation v2 | ⬜ |

---

## Dépendances entre phases

```
Phase 1 (Design system) ──► Phase 2 (WebView)
Phase 2 (WebView)        ──► Phase 3 (Sync)
Phase 3 (Sync)           ──► Phase 4 (Historique/Stop)
Phase 4                  ──► Phase 5 (Modèle LLM)
Phase 5                  ──► Phase 6 (Statuts)
Phase 6                  ──► Phase 7 (Tests)
Phase 7                  ──► Phase 8 (Doc/Deploy)
```

---

## Risques identifiés

| Risque | Impact | Mitigation |
|--------|--------|------------|
| API `vscode.WebviewPanel` complexe | Haut | Prototype simple Phase 2 avant d'y attacher la logique |
| Partage CSS client/WebView — build step complexe | Moyen | Commencer avec une copie, puis factoriser |
| `CancellationToken` Copilot peut ne pas arrêter immédiatement | Moyen | Afficher "Arrêt demandé…" et ignorer les chunks suivants |
| Synchronisation historique sur reconnexion — état divergent | Moyen | `history_sync` envoyé à chaque connexion mobile |

---

## Phases v1 (archivées) ✅

---

## Synthèse du projet

Créer une interface de contrôle déportée du **panel de conversation GitHub Copilot** (VS Code) accessible depuis un smartphone. L'objectif est de **piloter le panel Chat Copilot à distance** : envoyer des messages depuis le téléphone (qui seront injectés dans le chat VS Code) et recevoir les réponses en temps réel. Le système repose sur trois composants : une extension VS Code (TypeScript), un serveur relais FastAPI hébergé sur un **VPS Ionos** (configuration gérée par Sanji), et une web app mobile (HTML/JS/CSS). La communication se fait via WebSockets sécurisés (WSS).

---

## Questions ouvertes — Décisions actées

| # | Question | Décision |
|---|----------|-----------|
| 1 | Périmètre : Chat uniquement, ou aussi l'Inline Chat ? | ✅ **Chat uniquement** — contrôle du panel de conversation (cf. capture) |
| 2 | Latence VPS acceptable ? | ✅ **Acceptable** — optimiser la latence mais le VPS n'est pas pénalisant |
| 3 | Gestion de plusieurs instances VS Code simultanées ? | ✅ **Architecture prévue, non implémentée en V1** (prévu V2) |
| 4 | Syntax highlighting sur mobile (priorité V1 ?) | ✅ **Pas une priorité V1** — priorité = contrôle du panel de conversation |
| 5 | API Copilot : `vscode.chat` ou simulation de commandes ? | ✅ **Option A — participant `vscode.chat`** : créer un participant `@remote`, soumettre via `vscode.chat.sendRequest()` |
| 6 | Persistance des messages / nature des échanges | ✅ **Les messages du téléphone sont injectés dans le chat VS Code** (pas de chat parallèle) |

### Détail Q5 — Possibilités d'accès à l'API Copilot

L'extension doit pouvoir **injecter un message dans le chat VS Code** et **capturer la réponse**. Trois approches sont envisageables :

| Approche | Description | Avantages | Inconvénients |
|----------|-------------|-----------|---------------|
| **A — `vscode.chat` participant** | Créer un participant de chat custom (`@remote`) qui reçoit les messages du serveur et les soumet à Copilot via `vscode.chat.sendRequest()` | API officielle (expérimentale), réponse structurée | L'utilisateur doit mentionner `@remote` dans le chat ; ne pilote pas le chat natif Copilot directement |
| **B — `executeCommand`** | Utiliser `workbench.action.chat.open` + `workbench.action.chat.submit` pour injecter du texte et soumettre programmatiquement | Pilote le panel natif Copilot | API non documentée, fragile aux mises à jour VS Code |
| **C — Clipboard + commande** | Placer le texte dans le presse-papiers via `vscode.env.clipboard.writeText()`, puis simuler un `paste` + `submit` dans le chat | Simple à implémenter | Hack, pollue le presse-papiers, peu fiable |

> **Décision actée** : Approche A. L'extension enregistre un participant de chat `@remote` qui reçoit les messages du serveur et les soumet à Copilot via `vscode.chat.sendRequest()`.

---

## Phases de développement

### Phase 1 — Fondations & structure du projet
> Statut : ✅ Terminée (2026-04-22)

- [x] Initialiser la structure des dossiers (`extension/`, `server/`, `client/`) — Agent(s) : Luffy
- [x] Créer les fichiers de configuration de base (`package.json`, `tsconfig.json`, `requirements.txt`, `.env.example`, `.gitignore`) — Agent(s) : Luffy
- [x] Scaffolding de l'extension VS Code (manifest, point d'entrée TypeScript, esbuild, .vscodeignore) — Agent(s) : **Franky** (tooling) + Luffy
- [x] Scaffolding du serveur FastAPI (structure des routes, skeleton `main.py`) — Agent(s) : Luffy + **Sanji**
- [x] Consulter **Sanji** pour les spécificités du VPS Ionos → Dockerfile, docker-compose.yml, bloc Caddyfile, `.env.example` générés — Agent(s) : **Sanji**
- [x] Implémenter le module d'authentification (`auth.py` — HMAC secret partagé 256 bits, timeout 5s) — Agent(s) : **Sanji**

### Phase 2 — Serveur relais FastAPI
> Statut : ✅ Terminée (2026-04-22)

- [x] Implémenter le protocole de messages JSON (prompt, response_chunk, response_end, status, error) — Agent(s) : implémentation
- [x] Implémenter le routage `mobile → vscode` et `vscode → mobile` — Agent(s) : implémentation
- [x] Notifier le mobile du statut VS Code (connexion/déconnexion) — Agent(s) : implémentation
- [x] Gérer les déconnexions proprement (finally, reset globals) — Agent(s) : implémentation
- [x] Tests unitaires `auth.py` (7 cas) et tests d'intégration `main.py` (7 cas) — 14/14 ✅ — Agent(s) : **Chopper**

### Phase 3 — Extension VS Code
> Statut : ✅ Terminée (2026-04-22)

> Approche retenue : **Participant `vscode.chat`** — enregistrement d'un participant `@remote` qui injecte les messages reçus dans le chat Copilot.

- [x] Implémenter la connexion WebSocket vers le serveur VPS Ionos (`bridgeClient.ts` — reconnexion exponentielle, auth token) — Agent(s) : implémentation
- [x] **[CŒUR]** Injecter les messages reçus du téléphone dans le panel Chat Copilot VS Code via `workbench.action.chat.open` + `@remote` — Agent(s) : implémentation
- [x] **[CŒUR]** Capturer les réponses de Copilot (streaming `vscode.lm`) et les relayer vers le serveur (`response_chunk` / `response_end`) — Agent(s) : implémentation
- [x] Participant `@remote` avec historique de conversation (`participant.ts`) — Agent(s) : implémentation
- [x] Commandes VS Code : connect, disconnect, clearToken — Agent(s) : implémentation
- [x] Gestion du token d'authentification via `vscode.SecretStorage` + reconnexion auto au démarrage — Agent(s) : implémentation
- [x] Configuration `copilot-remote.serverUrl` dans les settings VS Code — Agent(s) : implémentation
- [x] Tests unitaires BridgeClient (8 cas) + config (6 cas) — 14/14 ✅ — Agent(s) : **Chopper**

### Phase 4 — Interface mobile (Web App)
> Statut : ✅ Terminée (2026-04-22)

- [x] Structure HTML complète (chat log, saisie textarea, envoi, indicateur statut, écran config) — Agent(s) : implémentation
- [x] Connexion WebSocket côté client (JS) avec auth token + reconnexion exponentielle — Agent(s) : implémentation
- [x] Écran de configuration (serverUrl + token, persisté dans localStorage) — Agent(s) : implémentation
- [x] Affichage des messages avec rendu Markdown (marked.js v15, local, pas de CDN) — Agent(s) : implémentation
- [x] Streaming des réponses Copilot (response_chunk en temps réel + curseur animé) — Agent(s) : implémentation
- [x] Indicateur de statut de connexion (connecté / déconnecté / connexion…) — Agent(s) : implémentation
- [x] CSS responsive thème sombre, optimisé touch, safe-area iOS — Agent(s) : implémentation
- [x] CSP stricte (pas de CDN externe, connect-src wss:// uniquement) — Agent(s) : implémentation

### Phase 5 — Sécurité & intégration
> Statut : ✅ Terminée (2026-04-22)

- [x] Audit sécurité global (OWASP WebSocket, injection, exposition de tokens) — Agent(s) : **Mihawk**
  - DOMPurify ajouté dans client (XSS DOM — Haute)
  - Race condition anti-éviction (1008) + limite taille 64 Ko (1009) dans main.py — Haute
  - Validation JSON/type relay dans main.py — Moyenne
  - Container non-root dans Dockerfile — Moyenne
  - Validation `client_token` comme str dans auth.py — Moyenne
  - `sessionStorage` au lieu de `localStorage` dans app.js — Moyenne
  - `replaceAll` dans bridgeClient.ts — Faible
  - 11 nouveaux tests sécurité Chopper — 25/25 ✅
- [x] Vérifier la configuration WSS / certificat SSL sur le VPS Ionos — Agent(s) : **Sanji**
  - `flush_interval -1` + `dial_timeout 10s` ajoutés dans caddy-block.conf (WebSocket streaming)
  - Guide de déploiement `server/deploy.md` créé

### Phase 6 — Documentation
> Statut : ✅ Terminée (2026-04-22)

- [x] Rédiger le README final (`README.md` à la racine) — Agent(s) : **Robin**
- [x] Documenter l'API du serveur (`server/API.md`) — Agent(s) : **Robin**
- [x] Documenter la configuration de l'extension VS Code (`extension/README.md`) — Agent(s) : **Robin**

### Phase 7 — Déploiement
> Statut : ✅ Terminée (2026-04-22)

- [x] Créer `server/Makefile` (build, up, down, restart, logs, health, test, clean) — Agent(s) : **Sanji**
- [x] Créer `deploy.sh` (script rsync + SSH + healthcheck, machine locale → VPS) — Agent(s) : **Sanji**

---

## Assignation des agents

| Agent | Tâches assignées | Statut |
|-------|-----------------|--------|
| **Luffy** | Structure projet, orchestration, copilot-instructions.md, luffy.md | ✅ Phase 1 terminée |
| **Franky** | Choix du tooling extension VS Code (esbuild retenu) | ✅ Terminé |
| **Sanji** | VPS Ionos (config, SSL, déploiement, Docker), auth module | ✅ Phase 1 terminée |
| **Usopp** | Problèmes bloquants techniques si rencontrés (API, WSS, etc.) | ⬜ Si nécessaire |
| **Mihawk** | Audit sécurité authentification + audit global OWASP | ⬜ À faire |
| **Chopper** | Tests serveur (14/14 ✅), tests extension, interface mobile, intégration E2E | 🔵 Phase 2 terminée |
| **Sanji** | VPS Ionos (config, SSL, déploiement, Docker), filtrage IP | ⬜ À faire |
| **Robin** | README final, doc API, guide déploiement, doc extension | ⬜ À faire |

---

## Dépendances entre tâches

```
Phase 1 (fondations)
  └─> Phase 2 (serveur) ──┐
  └─> Phase 3 (extension) ─┤──> Phase 5 (sécurité + intégration E2E)
  └─> Phase 4 (mobile) ───┘
                              └─> Phase 6 (documentation)
                              └─> Phase 7 (déploiement)
```

**Point d'attention Phase 3** : L'API `vscode.chat` est expérimentale — un changement VS Code pourrait la casser. Libéllés des contributions à surveiller. L'extension doit gérer gracieusement le cas où le participant `@remote` n'est pas disponible.

---

## Risques identifiés

| Risque | Probabilité | Impact | Mitigation |
|--------|------------|--------|------------|
| API `vscode.chat` instable (expérimentale, changements VS Code) | Moyenne | Élevé | Surveiller les releases VS Code ; fallback `executeCommand` prévu en V2 |
| Latence VPS trop élevée pour une UX fluide | Faible | Modéré | Accepté — optimiser les échanges WS (messages compacts, pas de polling) |
| Certificat SSL VPS Ionos mal configuré pour WSS | Faible | Élevé | Sanji valide la config en Phase 1 (consultation) et Phase 5 (validation) |
| Fuite de token d'authentification | Faible | Critique | Mihawk audite, `vscode.SecretStorage` obligatoire |
| Perte de messages en cas de déconnexion | Moyenne | Faible | Reconnexion automatique + buffer côté serveur (V2) |
