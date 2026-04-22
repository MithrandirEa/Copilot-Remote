# Guide de déploiement — Copilot Remote Bridge

## Prérequis VPS

- Docker CE >= 29, Docker Compose v2 (plugin `docker compose`, pas `docker-compose`)
- Caddy en cours d'exécution avec le réseau Docker `n8n_proxy` existant
- Sous-domaine `copilot.mithrandirea.info` → IP du VPS résolu dans le DNS

## Étapes de déploiement

### 1. Transférer les fichiers

Depuis la machine locale (répertoire racine du projet) :

```bash
rsync -avz --exclude='__pycache__' \
           --exclude='*.pyc' \
           --exclude='.env' \
           --exclude='tests/' \
  server/ root@87.106.47.82:/opt/copilot-bridge/
```

> Le fichier `.env` n'est **jamais** transféré automatiquement — il est créé manuellement
> sur le serveur (voir étape 3).

### 2. Générer le token secret

Sur le VPS (ou localement, puis copiez-le manuellement) :

```bash
openssl rand -hex 32
```

Conservez la valeur générée pour l'étape suivante **et** pour configurer l'extension
VS Code et le client mobile.

### 3. Configurer le `.env`

Sur le VPS, créer `/opt/copilot-bridge/.env` :

```bash
cat > /opt/copilot-bridge/.env << 'EOF'
# Token d'authentification — généré avec openssl rand -hex 32
AUTH_SECRET_TOKEN=REMPLACER_PAR_LE_TOKEN_GENERE

# Niveau de log uvicorn : debug | info | warning | error | critical
LOG_LEVEL=warning
EOF

# Restreindre la lecture au seul utilisateur root
chmod 600 /opt/copilot-bridge/.env
```

> **Sécurité** : ne jamais committer ce fichier, ne jamais l'afficher dans les logs.
> Le `.gitignore` doit exclure `.env`.

### 4. Mettre à jour le Caddyfile

```bash
# Ajouter le bloc Caddy à la fin du Caddyfile existant
cat /opt/copilot-bridge/caddy-block.conf >> /opt/n8n/Caddyfile

# Vérifier la syntaxe avant de recharger
docker exec caddy caddy validate --config /etc/caddy/Caddyfile

# Recharger Caddy (sans coupure de service)
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### 5. Construire et lancer le conteneur

```bash
cd /opt/copilot-bridge
docker compose up -d --build
```

### 6. Vérifier le déploiement

```bash
# État du conteneur et du healthcheck
docker ps --filter name=copilot-bridge

# Logs de démarrage (erreur si AUTH_SECRET_TOKEN absent)
docker compose logs --tail=50 copilot-bridge

# Health check HTTP via Caddy (TLS)
curl -s https://copilot.mithrandirea.info/health
# Réponse attendue : {"status":"ok"}

# Test de connexion WebSocket (nécessite wscat : npm install -g wscat)
wscat -c wss://copilot.mithrandirea.info/ws/mobile
# Envoyer ensuite : {"type":"auth","token":"<votre_token>"}
# Réponse attendue : {"type":"auth_ok"}
```

> **Vérification des headers de sécurité :**
> ```bash
> curl -sI https://copilot.mithrandirea.info/health | grep -i "strict\|frame\|content-type\|referrer\|permissions\|security"
> ```

## Rollback

```bash
cd /opt/copilot-bridge
docker compose down
```

Pour revenir à une image précédente (si taguée) :

```bash
docker compose down
# Éditer docker-compose.yml pour pointer sur le tag précédent, puis :
docker compose up -d
```

## Renouvellement du token

Le token peut être changé **sans reconstruire l'image** :

```bash
# 1. Générer un nouveau token
NEW_TOKEN=$(openssl rand -hex 32)

# 2. Mettre à jour le .env sur le VPS (sans afficher le token dans les logs shell)
sed -i "s/^AUTH_SECRET_TOKEN=.*/AUTH_SECRET_TOKEN=${NEW_TOKEN}/" /opt/copilot-bridge/.env

# 3. Redémarrer le conteneur pour appliquer la nouvelle variable
cd /opt/copilot-bridge && docker compose restart copilot-bridge

# 4. Mettre à jour le token dans :
#    - Les paramètres de l'extension VS Code (config.ts / vscode settings)
#    - Le client mobile (champ token dans l'interface ou variable d'env)
```

> Après le redémarrage, toute connexion WebSocket active sera coupée.
> Les clients devront se reconnecter avec le nouveau token.
