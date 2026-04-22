#!/usr/bin/env bash
# deploy.sh — Script de déploiement automatisé pour Copilot Remote Bridge
# À exécuter depuis la machine locale (jamais directement sur le VPS).
#
# Usage :
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Prérequis locaux : rsync, ssh
# Prérequis VPS    : Docker CE >= 29, Docker Compose v2, réseau Docker n8n_proxy,
#                    fichier /opt/copilot-bridge/.env créé manuellement au préalable.
#
# IMPORTANT : le fichier .env n'est jamais transféré par ce script.
# Il doit être créé manuellement sur le VPS avant le premier déploiement.
# Voir server/deploy.md pour les instructions détaillées.

set -euo pipefail

# ---------------------------------------------------------------------------
# Variables configurables
# ---------------------------------------------------------------------------
VPS_HOST="87.106.47.82"
VPS_USER="root"
VPS_PORT="22"
REMOTE_DIR="/opt/copilot-bridge"
# Chemin vers la clé SSH (laisser vide pour utiliser l'agent SSH ou la clé par défaut)
SSH_KEY=""

# ---------------------------------------------------------------------------
# Couleurs pour l'affichage
# ---------------------------------------------------------------------------
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
RESET="\033[0m"

ok()   { echo -e "${GREEN}[OK]${RESET}  $*"; }
fail() { echo -e "${RED}[KO]${RESET}  $*" >&2; exit 1; }
info() { echo -e "${YELLOW}[--]${RESET}  $*"; }

# ---------------------------------------------------------------------------
# Construction des options SSH communes
# ---------------------------------------------------------------------------
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o BatchMode=yes -p ${VPS_PORT}"
if [[ -n "${SSH_KEY}" ]]; then
    SSH_OPTS="${SSH_OPTS} -i ${SSH_KEY}"
fi

# ---------------------------------------------------------------------------
# Vérification des dépendances locales
# ---------------------------------------------------------------------------
info "Vérification des outils locaux requis..."

command -v rsync >/dev/null 2>&1 || fail "'rsync' est introuvable. Installez-le avant de continuer."
ok "rsync disponible : $(rsync --version | head -1)"

command -v ssh >/dev/null 2>&1 || fail "'ssh' est introuvable. Installez-le avant de continuer."
ok "ssh disponible"

# ---------------------------------------------------------------------------
# Rappel de sécurité : le .env doit exister manuellement sur le VPS
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${YELLOW}║  RAPPEL : le fichier .env n'est PAS transféré par ce script. ║${RESET}"
echo -e "${YELLOW}║  Assurez-vous qu'il existe sur le VPS avant de continuer.    ║${RESET}"
echo -e "${YELLOW}║  Chemin attendu : ${REMOTE_DIR}/.env                    ║${RESET}"
echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""

# ---------------------------------------------------------------------------
# Transfert des fichiers source vers le VPS via rsync
# ---------------------------------------------------------------------------
info "Transfert des fichiers server/ vers ${VPS_USER}@${VPS_HOST}:${REMOTE_DIR} ..."

# shellcheck disable=SC2086
rsync -avz --delete \
    --exclude='.env' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='tests/' \
    --exclude='.pytest_cache/' \
    -e "ssh ${SSH_OPTS}" \
    server/ \
    "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/"

ok "Fichiers transférés."

# ---------------------------------------------------------------------------
# Construction et démarrage du conteneur sur le VPS
# ---------------------------------------------------------------------------
info "Lancement de 'docker compose up -d --build' sur le VPS..."

# shellcheck disable=SC2086
ssh ${SSH_OPTS} "${VPS_USER}@${VPS_HOST}" bash <<REMOTE
set -euo pipefail
cd "${REMOTE_DIR}"
docker compose up -d --build
REMOTE

ok "Conteneur démarré."

# ---------------------------------------------------------------------------
# Vérification du healthcheck (attente max 30 secondes)
# ---------------------------------------------------------------------------
info "Vérification du healthcheck (max 30 s)..."

HEALTH_OK=false
for i in $(seq 1 6); do
    # shellcheck disable=SC2086
    STATUS=$(ssh ${SSH_OPTS} "${VPS_USER}@${VPS_HOST}" \
        "docker inspect --format='{{.State.Health.Status}}' copilot-bridge 2>/dev/null || echo 'absent'")

    if [[ "${STATUS}" == "healthy" ]]; then
        HEALTH_OK=true
        break
    fi

    info "Tentative ${i}/6 — statut : ${STATUS} (prochaine vérification dans 5 s)"
    sleep 5
done

if [[ "${HEALTH_OK}" == "true" ]]; then
    ok "Healthcheck : conteneur healthy."
else
    fail "Healthcheck : le conteneur n'est pas healthy après 30 s. Vérifiez les logs : make logs"
fi

# ---------------------------------------------------------------------------
# Fin du déploiement
# ---------------------------------------------------------------------------
echo ""
ok "Déploiement terminé avec succès."
info "URL de santé : https://copilot.mithrandirea.info/health"
info "Logs        : ssh ${VPS_USER}@${VPS_HOST} 'cd ${REMOTE_DIR} && docker compose logs --tail=50 copilot-bridge'"
echo ""
