# Makefile — Copilot Remote Bridge
# Opérations courantes pour le développement et la gestion du conteneur.
# Usage : make <target>

.PHONY: help build up down restart logs health test clean

# Target par défaut : affiche l'aide
help:
	@echo ""
	@echo "Copilot Remote Bridge — Commandes disponibles"
	@echo "----------------------------------------------"
	@echo "  build     Construit l'image Docker du service"
	@echo "  up        Démarre le conteneur en arrière-plan"
	@echo "  down      Stoppe et supprime le conteneur"
	@echo "  restart   Redémarre uniquement le conteneur copilot-bridge"
	@echo "  logs      Affiche les 100 dernières lignes de logs (suivi en temps réel)"
	@echo "  health    Vérifie le healthcheck HTTP sur le port local 8765"
	@echo "  test      Lance la suite de tests avec pytest"
	@echo "  clean     Stoppe les conteneurs et supprime les images locales du projet"
	@echo ""

# Construit l'image Docker
build:
	@echo "Construction de l'image Docker..."
	docker compose build

# Démarre le conteneur en mode détaché
up:
	@echo "Démarrage du conteneur..."
	docker compose up -d

# Stoppe et supprime le conteneur
down:
	@echo "Arrêt du conteneur..."
	docker compose down

# Redémarre uniquement copilot-bridge (rechargement de config sans rebuild)
restart:
	@echo "Redémarrage de copilot-bridge..."
	docker compose restart copilot-bridge

# Affiche les logs en temps réel (Ctrl+C pour quitter)
logs:
	docker compose logs --tail=100 -f copilot-bridge

# Vérifie le healthcheck HTTP du service
health:
	@echo "Vérification du healthcheck..."
	curl -s http://localhost:8765/health | python3 -m json.tool

# Lance la suite de tests pytest
test:
	@echo "Exécution des tests..."
	python -m pytest tests/ -v

# Stoppe les conteneurs et supprime les images locales du projet
clean:
	@echo "Nettoyage des conteneurs et images..."
	docker compose down --rmi local
	@echo "Nettoyage terminé."
