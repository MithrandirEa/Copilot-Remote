"""
Tests unitaires pour server/src/auth.py.

Stratégie : chaque test instancie un MockWebSocket minimal et appelle
directement authenticate_websocket(). Pas de démarrage de serveur HTTP,
pas de dépendance réseau.

Cas couverts (80/20 — chemins critiques de l'authentification) :
  - Token valide          → True  + envoi de auth_ok
  - Token invalide        → False + close(1008)
  - JSON malformé         → False + close(1008)
  - Type incorrect        → False + close(1008)
  - Timeout               → False + close(1008)
  - SECRET absent         → False + close(1008)
  - Déconnexion prématurée → False + pas de close()
"""
import asyncio
import json
from unittest.mock import patch

import pytest
from starlette.websockets import WebSocketDisconnect

from auth import authenticate_websocket
from conftest import AUTH_SECRET


# ---------------------------------------------------------------------------
# WebSocket simulé
# ---------------------------------------------------------------------------


class MockWebSocket:
    """Implémente uniquement les méthodes appelées par authenticate_websocket."""

    def __init__(
        self,
        receive_return: str | None = None,
        receive_side_effect: Exception | None = None,
    ) -> None:
        self.sent: list[str] = []
        self.closed: list[int] = []
        self._receive_return = receive_return
        self._receive_side_effect = receive_side_effect

    async def receive_text(self) -> str:
        if self._receive_side_effect is not None:
            raise self._receive_side_effect
        return self._receive_return or ""

    async def send_text(self, data: str) -> None:
        self.sent.append(data)

    async def close(self, code: int = 1000) -> None:
        self.closed.append(code)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _auth_payload(token: str = AUTH_SECRET) -> str:
    """Sérialise un message d'authentification valide."""
    return json.dumps({"type": "auth", "token": token})


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_valid_token_returns_true_and_sends_auth_ok():
    """Token correct → retourne True et envoie {"type": "auth_ok"}."""
    ws = MockWebSocket(receive_return=_auth_payload())

    result = await authenticate_websocket(ws)

    assert result is True
    assert ws.closed == [], "La connexion ne doit pas être fermée sur succès"
    assert len(ws.sent) == 1
    assert json.loads(ws.sent[0]) == {"type": "auth_ok"}


@pytest.mark.asyncio
async def test_invalid_token_returns_false_and_closes_1008():
    """Token incorrect → retourne False et ferme avec code 1008."""
    ws = MockWebSocket(receive_return=_auth_payload(token="mauvais-token"))

    result = await authenticate_websocket(ws)

    assert result is False
    assert 1008 in ws.closed


@pytest.mark.asyncio
async def test_malformed_json_returns_false_and_closes_1008():
    """JSON invalide → retourne False et ferme avec code 1008."""
    ws = MockWebSocket(receive_return="{non_du_json{{{{")

    result = await authenticate_websocket(ws)

    assert result is False
    assert 1008 in ws.closed


@pytest.mark.asyncio
async def test_wrong_message_type_returns_false_and_closes_1008():
    """Type de message différent de "auth" → retourne False et ferme avec 1008."""
    ws = MockWebSocket(
        receive_return=json.dumps({"type": "ping", "token": AUTH_SECRET})
    )

    result = await authenticate_websocket(ws)

    assert result is False
    assert 1008 in ws.closed


@pytest.mark.asyncio
async def test_timeout_returns_false_and_closes_1008():
    """
    Timeout dépassé → retourne False et ferme avec code 1008.

    asyncio.wait_for est patché pour lever TimeoutError immédiatement,
    sans ralentir la suite de tests.
    """
    ws = MockWebSocket()

    async def mock_wait_for(coro, timeout):  # noqa: ANN001
        # Ferme proprement la coroutine pour éviter les warnings Python
        coro.close()
        raise asyncio.TimeoutError()

    with patch("auth.asyncio.wait_for", new=mock_wait_for):
        result = await authenticate_websocket(ws)

    assert result is False
    assert 1008 in ws.closed


@pytest.mark.asyncio
async def test_missing_secret_returns_false_and_closes_1008(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """
    AUTH_SECRET_TOKEN absent → RuntimeError dans _get_secret() → retourne False.

    Note : monkeypatch.delenv agit après auth_secret_env (autouse) car ils
    partagent le même objet monkeypatch de portée "function".
    """
    monkeypatch.delenv("AUTH_SECRET_TOKEN", raising=False)
    # Message structurellement valide ; c'est la lecture du secret qui échoue
    ws = MockWebSocket(receive_return=_auth_payload())

    result = await authenticate_websocket(ws)

    assert result is False
    assert 1008 in ws.closed


@pytest.mark.asyncio
async def test_disconnect_before_auth_returns_false():
    """
    Client se déconnecte avant l'envoi du message → retourne False
    sans tenter de fermer la connexion (déjà coupée).
    """
    ws = MockWebSocket(receive_side_effect=WebSocketDisconnect())

    result = await authenticate_websocket(ws)

    assert result is False
    assert ws.closed == [], "Pas de close() si la connexion est déjà rompue"
