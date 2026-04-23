"""
Point d'entrée principal du serveur relais FastAPI.

Routes WebSocket :
  - /ws/vscode  : connexion depuis l'extension VS Code
  - /ws/mobile  : connexion depuis le client mobile

Protocole de messages (JSON) :
  Mobile → VS Code :
    {"type": "prompt",        "text": "...", "id": "<uuid>"}  ← nouveau prompt
    {"type": "history_clear"}                                  ← vider l'historique
    {"type": "stop"}                                           ← annuler le streaming

  VS Code → Mobile :
    {"type": "response_chunk", "text": "...", "id": "<uuid>"}  ← streaming
    {"type": "response_end",   "id": "<uuid>"}                 ← fin de réponse
    {"type": "history_sync",  "messages": [...]}               ← historique complet
    {"type": "history_clear"}                                  ← confirmation suppression

  Serveur → Mobile (statut) :
    {"type": "status", "vscode_connected": true|false}

  Serveur → VS Code (notification interne) :
    {"type": "mobile_connected"}  ← déclenché à la connexion du mobile
"""
import json
import logging

from fastapi import FastAPI, WebSocket
from starlette.websockets import WebSocketDisconnect

from auth import authenticate_websocket

logger = logging.getLogger(__name__)

app = FastAPI(title="Copilot Remote Bridge")

# Connexions actives — persistance en mémoire (V1, pas de base de données)
_vscode_ws: WebSocket | None = None
_mobile_ws: WebSocket | None = None

# Limite de taille des messages pour éviter les DoS mémoire (Mihawk — Haute)
MAX_MESSAGE_BYTES: int = 64 * 1024  # 64 Ko

# Types de messages autorisés depuis VS Code → mobile (Mihawk — Moyenne)
_VSCODE_ALLOWED_TYPES = frozenset({"response_chunk", "response_end", "error", "history_sync", "history_clear"})
# Types de messages autorisés depuis mobile → VS Code
_MOBILE_ALLOWED_TYPES = frozenset({"prompt", "history_clear", "stop"})


@app.get("/health")
async def health() -> dict[str, str]:
    """Endpoint de santé — utilisé par le reverse proxy et le healthcheck Docker."""
    return {"status": "ok"}


async def _send_status_to_mobile(connected: bool) -> None:
    """Envoie l'état de connexion VS Code au client mobile si celui-ci est connecté."""
    if _mobile_ws is not None:
        try:
            await _mobile_ws.send_text(
                json.dumps({"type": "status", "vscode_connected": connected})
            )
        except Exception:
            pass


@app.websocket("/ws/vscode")
async def ws_vscode(websocket: WebSocket) -> None:
    """
    Endpoint WebSocket pour l'extension VS Code.
    Relaie les messages reçus (réponses Copilot) vers le client mobile.
    """
    global _vscode_ws
    await websocket.accept()
    if not await authenticate_websocket(websocket):
        return

    # Rejeter si une session VS Code est déjà active (anti-éviction, Mihawk — Haute)
    if _vscode_ws is not None:
        logger.warning("Connexion VS Code refusée : session déjà active")
        await websocket.close(code=1008)
        return

    _vscode_ws = websocket
    logger.info("Extension VS Code connectée")
    await _send_status_to_mobile(connected=True)

    try:
        while True:
            raw = await websocket.receive_text()

            # Limite de taille (Mihawk — Haute)
            if len(raw.encode()) > MAX_MESSAGE_BYTES:
                logger.warning("Message VS Code trop volumineux (%d octets) — connexion fermée", len(raw.encode()))
                await websocket.close(code=1009)
                return

            # Validation de la structure JSON et du type (Mihawk — Moyenne)
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("Message VS Code non-JSON ignoré")
                continue
            if parsed.get("type") not in _VSCODE_ALLOWED_TYPES:
                logger.warning("Type de message VS Code inattendu : %s", parsed.get("type"))
                continue

            if _mobile_ws is not None:
                try:
                    await _mobile_ws.send_text(raw)
                except Exception as exc:
                    logger.warning("Échec du relais VS Code → mobile : %s", exc)
    except WebSocketDisconnect:
        logger.info("Extension VS Code déconnectée")
    finally:
        _vscode_ws = None
        await _send_status_to_mobile(connected=False)


@app.websocket("/ws/mobile")
async def ws_mobile(websocket: WebSocket) -> None:
    """
    Endpoint WebSocket pour le client mobile.
    Relaie les messages reçus (prompts utilisateur) vers l'extension VS Code.
    Notifie le mobile de l'état de connexion VS Code à l'arrivée.
    """
    global _mobile_ws
    await websocket.accept()
    if not await authenticate_websocket(websocket):
        return

    # Rejeter si une session mobile est déjà active (anti-éviction, Mihawk — Haute)
    if _mobile_ws is not None:
        logger.warning("Connexion mobile refusée : session déjà active")
        await websocket.close(code=1008)
        return

    _mobile_ws = websocket
    logger.info("Client mobile connecté")

    # Notifier VS Code que le mobile vient de se connecter (pour déclencher history_sync)
    if _vscode_ws is not None:
        try:
            await _vscode_ws.send_text(json.dumps({"type": "mobile_connected"}))
        except Exception:
            pass

    # Informer immédiatement le mobile de l'état VS Code
    await _send_status_to_mobile(connected=_vscode_ws is not None)

    try:
        while True:
            raw = await websocket.receive_text()

            # Limite de taille (Mihawk — Haute)
            if len(raw.encode()) > MAX_MESSAGE_BYTES:
                logger.warning("Message mobile trop volumineux (%d octets) — connexion fermée", len(raw.encode()))
                await websocket.close(code=1009)
                return

            # Validation de la structure JSON et du type (Mihawk — Moyenne)
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("Message mobile non-JSON ignoré")
                continue
            if parsed.get("type") not in _MOBILE_ALLOWED_TYPES:
                logger.warning("Type de message mobile inattendu : %s", parsed.get("type"))
                continue

            if _vscode_ws is not None:
                try:
                    await _vscode_ws.send_text(raw)
                except Exception as exc:
                    logger.warning("Échec du relais mobile → VS Code : %s", exc)
            else:
                # VS Code non connecté — notifier le mobile
                try:
                    await websocket.send_text(
                        json.dumps({
                            "type": "error",
                            "message": "VS Code non connecté — message ignoré",
                        })
                    )
                except Exception:
                    pass
    except WebSocketDisconnect:
        logger.info("Client mobile déconnecté")
    finally:
        _mobile_ws = None

