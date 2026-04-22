"""
Tests d'intégration pour server/src/main.py.

Transport :
  - Tests HTTP  : httpx.AsyncClient + httpx.ASGITransport (async)
  - Tests WS    : starlette.testclient.TestClient (sync, gestion native des
                  connexions WebSocket concurrentes via threads)

Isolation : les fixtures autouse de conftest.py réinitialisent AUTH_SECRET_TOKEN
et les globaux _vscode_ws / _mobile_ws avant et après chaque test.
"""
import json

import httpx
import pytest
from starlette.testclient import TestClient

import main
from conftest import AUTH_SECRET


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
# Tests HTTP
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_returns_200_ok() -> None:
    """GET /health → 200 {"status": "ok"} via httpx + ASGITransport."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=main.app),
        base_url="http://test",
    ) as http_client:
        response = await http_client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Tests WebSocket — connexion et statut initial
# ---------------------------------------------------------------------------


def test_mobile_connects_without_vscode_receives_status_false(client: TestClient) -> None:
    """Mobile seul → reçoit immédiatement {"type": "status", "vscode_connected": false}."""
    with client.websocket_connect("/ws/mobile") as mobile:
        _do_auth(mobile)
        status = mobile.receive_json()

    assert status == {"type": "status", "vscode_connected": False}


def test_vscode_connects_first_then_mobile_receives_status_true(client: TestClient) -> None:
    """VS Code déjà connecté → mobile reçoit status vscode_connected=true à la connexion."""
    with client.websocket_connect("/ws/vscode") as vscode:
        _do_auth(vscode)

        with client.websocket_connect("/ws/mobile") as mobile:
            _do_auth(mobile)
            status = mobile.receive_json()

    assert status == {"type": "status", "vscode_connected": True}


# ---------------------------------------------------------------------------
# Tests WebSocket — relais de messages
# ---------------------------------------------------------------------------


def test_relay_mobile_to_vscode(client: TestClient) -> None:
    """Message envoyé par le mobile → transmis à VS Code tel quel."""
    with client.websocket_connect("/ws/vscode") as vscode:
        _do_auth(vscode)

        with client.websocket_connect("/ws/mobile") as mobile:
            _do_auth(mobile)
            mobile.receive_json()  # consommer le status initial

            prompt = {"type": "prompt", "text": "Bonjour Copilot", "id": "abc-123"}
            mobile.send_json(prompt)
            received = vscode.receive_json()

    assert received == prompt


def test_relay_vscode_to_mobile(client: TestClient) -> None:
    """Message envoyé par VS Code → transmis au mobile tel quel."""
    with client.websocket_connect("/ws/vscode") as vscode:
        _do_auth(vscode)

        with client.websocket_connect("/ws/mobile") as mobile:
            _do_auth(mobile)
            mobile.receive_json()  # consommer le status initial

            chunk = {"type": "response_chunk", "text": "Bonjour !", "id": "xyz-456"}
            vscode.send_json(chunk)
            received = mobile.receive_json()

    assert received == chunk


def test_mobile_message_when_vscode_absent_receives_error(client: TestClient) -> None:
    """Message mobile sans VS Code connecté → réponse {"type": "error", ...}."""
    with client.websocket_connect("/ws/mobile") as mobile:
        _do_auth(mobile)
        mobile.receive_json()  # consommer le status initial (vscode_connected: false)

        mobile.send_json({"type": "prompt", "text": "test", "id": "1"})
        error = mobile.receive_json()

    assert error["type"] == "error"
    assert "VS Code" in error["message"]


# ---------------------------------------------------------------------------
# Tests WebSocket — déconnexion
# ---------------------------------------------------------------------------


def test_vscode_disconnect_notifies_mobile(client: TestClient) -> None:
    """
    VS Code se déconnecte → mobile reçoit {"type": "status", "vscode_connected": false}.

    Séquence des messages reçus par mobile :
      1. auth_ok
      2. status(false)   ← connexion initiale sans VS Code
      3. status(true)    ← VS Code se connecte
      4. status(false)   ← VS Code se déconnecte  ← ce que ce test vérifie
    """
    with client.websocket_connect("/ws/mobile") as mobile:
        _do_auth(mobile)
        mobile.receive_json()  # status initial : vscode_connected=false

        with client.websocket_connect("/ws/vscode") as vscode:
            _do_auth(vscode)
            status_on = mobile.receive_json()
            assert status_on == {"type": "status", "vscode_connected": True}
        # Sortie du context manager = déconnexion VS Code
        # Le finally de ws_vscode appelle _send_status_to_mobile(False)

        status_off = mobile.receive_json()

    assert status_off == {"type": "status", "vscode_connected": False}
