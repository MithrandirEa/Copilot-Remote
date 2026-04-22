"""
Module d'authentification WebSocket — secret partagé avec comparaison HMAC.

Système choisi : secret partagé fort (256 bits)
Pourquoi ce choix plutôt que JWT ?
- Outil personnel à propriétaire unique — pas besoin d'identités multiples
- Pas de durée d'expiration nécessaire (révocation = rotation du secret)
- Pas de surcoût de signature asymétrique pour deux clients connus
- Le secret n'est JAMAIS loggué ni transmis dans l'URL WebSocket

Flux d'authentification :
  1. Client se connecte au WebSocket
  2. Serveur attend max AUTH_TIMEOUT_SECONDS secondes
  3. Client envoie : {"type": "auth", "token": "<AUTH_SECRET_TOKEN>"}
  4. Serveur valide avec hmac.compare_digest (résistant aux timing attacks)
  5. Si valide → {"type": "auth_ok"} + connexion maintenue
  6. Si invalide ou timeout → close(1008) + connexion coupée
"""

import asyncio
import hmac
import json
import logging
import os

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect

logger = logging.getLogger(__name__)

# Délai maximum d'attente du message d'authentification (secondes)
AUTH_TIMEOUT_SECONDS: int = 5


def _get_secret() -> bytes:
    """
    Récupère le secret depuis les variables d'environnement.
    Lève RuntimeError si absent — le serveur ne doit pas démarrer sans secret.
    """
    secret = os.environ.get("AUTH_SECRET_TOKEN", "")
    if not secret:
        raise RuntimeError(
            "AUTH_SECRET_TOKEN n'est pas défini dans les variables d'environnement"
        )
    return secret.encode()


async def authenticate_websocket(websocket: WebSocket) -> bool:
    """
    Authentifie une connexion WebSocket via le secret partagé.

    Doit être appelée APRÈS websocket.accept().
    Le token client n'est jamais loggué.

    Returns:
        True si authentifié avec succès, False sinon (connexion déjà fermée).
    """
    try:
        raw = await asyncio.wait_for(
            websocket.receive_text(),
            timeout=AUTH_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.warning("Authentification WS expirée après %ds", AUTH_TIMEOUT_SECONDS)
        await _reject(websocket)
        return False
    except WebSocketDisconnect:
        logger.warning("Client déconnecté avant authentification")
        return False

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Message d'authentification invalide (JSON malformé)")
        await _reject(websocket)
        return False

    if data.get("type") != "auth":
        logger.warning("Message d'authentification invalide (type incorrect)")
        await _reject(websocket)
        return False

    client_token = data.get("token")
    if not isinstance(client_token, str) or not client_token:
        logger.warning("Message d'authentification invalide (token manquant ou non-string)")
        await _reject(websocket)
        return False

    try:
        secret = _get_secret()
    except RuntimeError as exc:
        logger.error("Erreur de configuration : %s", exc)
        await _reject(websocket)
        return False

    # Comparaison en temps constant — résistant aux timing attacks
    if not hmac.compare_digest(client_token.encode(), secret):
        logger.warning("Authentification WS refusée (token invalide)")
        await _reject(websocket)
        return False

    await websocket.send_text(json.dumps({"type": "auth_ok"}))
    logger.info("Authentification WS réussie")
    return True


async def _reject(websocket: WebSocket) -> None:
    """Ferme la connexion WebSocket avec le code 1008 (Policy Violation)."""
    try:
        await websocket.close(code=1008)
    except Exception:
        pass  # La connexion est peut-être déjà fermée
