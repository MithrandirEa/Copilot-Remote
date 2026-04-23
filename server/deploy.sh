#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Déploiement Copilot Remote Bridge v2 sur VPS
#
# Usage : ./deploy.sh [VPS_IP] [DEST_PATH]
#   VPS_IP    : adresse IP ou hostname du VPS (défaut : 87.106.47.82)
#   DEST_PATH : répertoire cible sur le VPS (défaut : /opt/copilot-bridge)
#
# Pré-requis :
#   - Accès SSH root configuré (clé SSH dans ~/.ssh/authorized_keys du VPS)
#   - rsync installé localement
#   - Docker CE + docker compose v2 installés sur le VPS
#   - /opt/copilot-bridge/.env existant sur le VPS (voir .env.example)
# =============================================================================

set -euo pipefail

VPS_IP="${1:-87.106.47.82}"
DEST_PATH="${2:-/opt/copilot-bridge}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Copilot Remote Bridge v2 — Déploiement ==="
echo "→ Destination : root@${VPS_IP}:${DEST_PATH}"

# --- 1. Transfert des fichiers (sans .env ni fichiers de dev) ---
echo ""
echo "[1/3] Transfert des fichiers..."
rsync -avz --progress \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.env' \
  --exclude='tests/' \
  --exclude='.pytest_cache/' \
  --exclude='*.egg-info/' \
  "${SCRIPT_DIR}/" "root@${VPS_IP}:${DEST_PATH}/"

# --- 2. Build et redémarrage du conteneur sur le VPS ---
echo ""
echo "[2/3] Build et redémarrage du conteneur Docker..."
ssh "root@${VPS_IP}" bash -s << EOF
  set -e
  cd "${DEST_PATH}"

  # Vérifier que .env est présent (ne jamais démarrer sans token)
  if [ ! -f .env ]; then
    echo "ERREUR : ${DEST_PATH}/.env introuvable."
    echo "Créez-le à partir de .env.example avant de continuer."
    exit 1
  fi

  docker compose pull 2>/dev/null || true
  docker compose up -d --build
EOF

# --- 3. Vérification du déploiement ---
echo ""
echo "[3/3] Vérification du déploiement..."
ssh "root@${VPS_IP}" bash -s << EOF
  echo "--- État du conteneur ---"
  docker ps --filter name=copilot-bridge \
    --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"

  echo ""
  echo "--- Logs récents ---"
  docker compose -f "${DEST_PATH}/docker-compose.yml" logs --tail=20 copilot-bridge

  echo ""
  echo "--- Healthcheck HTTP local ---"
  sleep 2
  curl -sf http://localhost:8765/health && echo " (OK)" || echo "AVERTISSEMENT : healthcheck HTTP local échoué"
EOF

echo ""
echo "=== Déploiement terminé ==="
echo "Vérifiez également : curl -s https://<votre-domaine>/health"
