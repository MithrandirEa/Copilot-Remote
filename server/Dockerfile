FROM python:3.12-slim

# Répertoire de travail — le contenu de src/ est copié directement ici
WORKDIR /app

# Installation des dépendances en couche séparée pour le cache Docker
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copie du code source
COPY src/ .

# Exécuter en utilisateur non-root (Mihawk — Moyenne)
RUN useradd --no-create-home --shell /bin/false appuser
USER appuser

EXPOSE 8765

# Le niveau de log est contrôlé par la variable LOG_LEVEL (défaut : warning)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 8765 --log-level ${LOG_LEVEL:-warning}"]
