"""
Tests de sécurité pour server/src/main.py.

Couvre les corrections introduites par l'audit Mihawk :
  - Anti-éviction  : rejet de la seconde connexion VS Code / mobile (close 1008)
  - Limite de taille: message > 64 Ko fermé avec close 1009
  - JSON invalide   : ignoré silencieusement (connexion reste active)
  - Type interdit   : ignoré silencieusement (message non relayé)

Transport : starlette.testclient.TestClient (sync, WebSocket natif via threads).
Isolation : les fixtures autouse auth_secret_env et reset_ws_globals de
            conftest.py s'appliquent automatiquement à chaque test.
"""
import json
from unittest.mock import MagicMock

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import main
from conftest import AUTH_SECRET
from main import MAX_MESSAGE_BYTES


# ---------------------------------------------------------------------------
# Fixture TestClient
# ---------------------------------------------------------------------------


@pytest.fixture()
def client() -> TestClient:
    """Fournit un TestClient FastAPI avec cycle de vie complet (startup/shutdown)."""
    with TestClient(main.app) as c:
        yield c


# ---------------------------------------------------------------------------
# Helper d'authentification WebSocket
# ---------------------------------------------------------------------------


def _do_auth(ws, token: str = AUTH_SECRET) -> None:
    """Envoie le message d'auth et consomme la réponse auth_ok."""
    ws.send_json({"type": "auth", "token": token})
    response = ws.receive_json()
    assert response == {"type": "auth_ok"}


# ---------------------------------------------------------------------------
# Tests — anti-éviction (close 1008)
# ---------------------------------------------------------------------------


def test_vscode_second_connection_rejected_with_1008(client: TestClient) -> None:
    """Une seconde connexion VS Code est rejetée — la session existante n'est pas évincée."""
    # Arrange : simuler une session VS Code déjà active
    existing_mock = MagicMock()
    main._vscode_ws = existing_mock
    disconnect_code: int | None = None

    # Act
    try:
        with client.websocket_connect("/ws/vscode") as ws:
            _do_auth(ws)
            # Après auth_ok, le serveur ferme avec 1008 → WebSocketDisconnect attendu
            ws.receive_text()
    except WebSocketDisconnect as exc:
        disconnect_code = exc.code

    # Assert
    assert disconnect_code == 1008
    assert main._vscode_ws is existing_mock, "La session existante ne doit pas avoir été évincée"


def test_mobile_second_connection_rejected_with_1008(client: TestClient) -> None:
    """Une seconde connexion mobile est rejetée — la session existante n'est pas évincée."""
    # Arrange : simuler une session mobile déjà active
    existing_mock = MagicMock()
    main._mobile_ws = existing_mock
    disconnect_code: int | None = None

    # Act
    try:
        with client.websocket_connect("/ws/mobile") as ws:
            _do_auth(ws)
            ws.receive_text()
    except WebSocketDisconnect as exc:
        disconnect_code = exc.code

    # Assert
    assert disconnect_code == 1008
    assert main._mobile_ws is existing_mock, "La session existante ne doit pas avoir été évincée"


# ---------------------------------------------------------------------------
# Tests — limite de taille de message (close 1009)
# ---------------------------------------------------------------------------


def test_vscode_message_too_large_closes_1009(client: TestClient) -> None:
    """Un message VS Code dépassant 64 Ko ferme la connexion avec le code 1009."""
    disconnect_code: int | None = None

    try:
        with client.websocket_connect("/ws/vscode") as ws:
            _do_auth(ws)
            # Message d'exactement MAX_MESSAGE_BYTES + 1 octets (ASCII → 1 octet/caractère)
            ws.send_text("X" * (MAX_MESSAGE_BYTES + 1))
            ws.receive_text()  # WebSocketDisconnect(1009) attendu
    except WebSocketDisconnect as exc:
        disconnect_code = exc.code

    assert disconnect_code == 1009


def test_mobile_message_too_large_closes_1009(client: TestClient) -> None:
    """Un message mobile dépassant 64 Ko ferme la connexion avec le code 1009."""
    disconnect_code: int | None = None

    try:
        with client.websocket_connect("/ws/mobile") as ws:
            _do_auth(ws)
            # Le serveur envoie toujours le status initial après auth côté mobile
            ws.receive_json()  # consommer {"type": "status", "vscode_connected": false}
            ws.send_text("X" * (MAX_MESSAGE_BYTES + 1))
            ws.receive_text()  # WebSocketDisconnect(1009) attendu
    except WebSocketDisconnect as exc:
        disconnect_code = exc.code

    assert disconnect_code == 1009


# ---------------------------------------------------------------------------
# Tests — JSON invalide ignoré (connexion reste active)
# ---------------------------------------------------------------------------


def test_vscode_invalid_json_is_ignored(client: TestClient) -> None:
    """Un JSON malformé reçu de VS Code est ignoré — la connexion reste active."""
    with client.websocket_connect("/ws/vscode") as vscode:
        _do_auth(vscode)

        with client.websocket_connect("/ws/mobile") as mobile:
            _do_auth(mobile)
            mobile.receive_json()  # consommer le status initial

            # JSON invalide → ignoré silencieusement, pas de fermeture de connexion
            vscode.send_text("ceci{{{n'est:pas-du-json")

            # Message valide envoyé ensuite : prouve que la connexion est toujours active
            valid = {"type": "response_chunk", "text": "toujours connecté", "id": "1"}
            vscode.send_json(valid)
            received = mobile.receive_json()

    assert received == valid


def test_mobile_invalid_json_is_ignored(client: TestClient) -> None:
    """Un JSON malformé reçu du mobile est ignoré — la connexion reste active."""
    with client.websocket_connect("/ws/vscode") as vscode:
        _do_auth(vscode)

        with client.websocket_connect("/ws/mobile") as mobile:
            _do_auth(mobile)
            mobile.receive_json()  # consommer le status initial

            # JSON invalide → ignoré silencieusement, pas de fermeture de connexion
            mobile.send_text("ceci{{{n'est:pas-du-json")

            # Message valide envoyé ensuite : prouve que la connexion est toujours active
            valid = {"type": "prompt", "text": "toujours connecté", "id": "1"}
            mobile.send_json(valid)
            received = vscode.receive_json()

    assert received == valid


# ---------------------------------------------------------------------------
# Tests — type de message non autorisé ignoré (pas de relay)
# ---------------------------------------------------------------------------


def test_vscode_unexpected_type_is_ignored(client: TestClient) -> None:
    """Un type non autorisé depuis VS Code n'est pas relayé au mobile."""
    with client.websocket_connect("/ws/vscode") as vscode:
        _do_auth(vscode)

        with client.websocket_connect("/ws/mobile") as mobile:
            _do_auth(mobile)
            mobile.receive_json()  # consommer le status initial

            # Type non autorisé → ignoré, pas de relay vers mobile
            vscode.send_json({"type": "evil_type", "text": "ignore-moi", "id": "0"})

            # Seul le message valide suivant doit être reçu par mobile
            valid = {"type": "response_chunk", "text": "message valide", "id": "1"}
            vscode.send_json(valid)
            received = mobile.receive_json()

    assert received == valid


def test_mobile_unexpected_type_is_ignored(client: TestClient) -> None:
    """Un type non autorisé depuis le mobile n'est pas relayé à VS Code."""
    with client.websocket_connect("/ws/vscode") as vscode:
        _do_auth(vscode)

        with client.websocket_connect("/ws/mobile") as mobile:
            _do_auth(mobile)
            mobile.receive_json()  # consommer le status initial

            # Type non autorisé → ignoré, pas de relay vers VS Code
            mobile.send_json({"type": "evil_type", "text": "ignore-moi", "id": "0"})

            # Seul le message valide suivant doit être reçu par VS Code
            valid = {"type": "prompt", "text": "message valide", "id": "1"}
            mobile.send_json(valid)
            received = vscode.receive_json()

    assert received == valid
