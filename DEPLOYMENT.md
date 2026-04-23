# Déploiement — Copilot Remote Bridge v2

## 1. Prérequis

| Outil | Version | Rôle |
|-------|---------|------|
| Node.js | 18 LTS+ | Build extension |
| npm | 9+ | Gestion des paquets |
| Python | 3.12+ | Serveur FastAPI |
| Docker CE + Compose v2 | 29+ | Conteneurisation VPS |
| `@vscode/vsce` | inclus dans devDeps | Packaging VSIX |

> `vsce` est inclus dans `devDependencies` — pas d'installation globale requise.

---

## 2. Build VSIX (extension VS Code)

```bash
cd extension/
npm install
npm run build:vsix
# → génère copilot-remote-<version>.vsix dans extension/
```

**Installation manuelle dans VS Code :**

```bash
# Via ligne de commande
code --install-extension copilot-remote-<version>.vsix

# Ou via la palette de commandes : Extensions > Install from VSIX...
```

---

## 3. Déploiement serveur (VPS Ionos — Ubuntu/Debian)

### 3a. Première installation

```bash
# Sur le VPS : créer le répertoire
ssh root@<VPS_IP> "mkdir -p /opt/copilot-bridge"

# Transférer les fichiers serveur
rsync -avz --exclude='.env' --exclude='tests/' \
  server/ root@<VPS_IP>:/opt/copilot-bridge/

# Sur le VPS : créer le .env (NE JAMAIS committer ce fichier)
ssh root@<VPS_IP>
cat > /opt/copilot-bridge/.env << 'EOF'
AUTH_SECRET_TOKEN=$(openssl rand -hex 32)
LOG_LEVEL=warning
ENVIRONMENT=production
EOF
chmod 600 /opt/copilot-bridge/.env

# Lancer le conteneur
cd /opt/copilot-bridge && docker compose up -d --build
```

### 3b. Mises à jour suivantes

```bash
# Depuis la racine du projet en local
chmod +x server/deploy.sh
./server/deploy.sh
```

### 3c. Vérification

```bash
curl -s https://<votre-domaine>/health
# → {"status":"ok"}
```

---

## 4. Configuration de l'extension VS Code

Dans les paramètres VS Code (`Ctrl+,`, chercher "Copilot Remote") :

| Paramètre | Valeur |
|-----------|--------|
| `copilot-remote.serverUrl` | `wss://<votre-domaine>` |

Le token est demandé au premier démarrage via une invite sécurisée (stocké dans le keychain système).

---

## 5. Configuration client mobile

Ouvrir `https://<votre-domaine>/client/` dans le navigateur mobile.

Renseigner dans l'interface :
- **URL du serveur** : `wss://<votre-domaine>`
- **Token** : valeur de `AUTH_SECRET_TOKEN` depuis le `.env`

---

## Variables d'environnement serveur (résumé)

| Variable | Requis | Description |
|----------|--------|-------------|
| `AUTH_SECRET_TOKEN` | **Oui** | Secret partagé — `openssl rand -hex 32` |
| `LOG_LEVEL` | Non | `warning` en prod, `info` en dev |
| `ENVIRONMENT` | Non | `production` \| `development` |

> `HOST` et `PORT` ne sont pas configurables via `.env` (hard-codés : `0.0.0.0:8765` dans le Dockerfile).
