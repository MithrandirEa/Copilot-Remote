"""
Tests de sécurité pour server/src/auth.py.

Couvre les validations introduites par l'audit Mihawk :
  - Token JSON null   → False + close(1008)
  - Token JSON entier → False + close(1008)
  - Token chaîne vide → False + close(1008)

Ces cas testent la nouvelle garde :
    client_token = data.get("token")
    if not isinstance(client_token, str) or not client_token:
        ...
"""
import json

import pytest

from auth import authenticate_websocket
from conftest import AUTH_SECRET


# ---------------------------------------------------------------------------
# WebSocket simulé (minimal — seules les méthodes appelées par authenticate_websocket)
# ---------------------------------------------------------------------------


class MockWebSocket:
    """Stub WebSocket pour les tests unitaires d'authentification."""

    def __init__(self, receive_return: str = "") -> None:
        self.sent: list[str] = []
        self.closed: list[int] = []
        self._receive_return = receive_return

    async def receive_text(self) -> str:
        return self._receive_return

    async def send_text(self, data: str) -> None:
        self.sent.append(data)

    async def close(self, code: int = 1000) -> None:
        self.closed.append(code)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_token_null_returns_false_and_closes_1008() -> None:
    """Token JSON null → retourne False et ferme avec le code 1008."""
    # Arrange
    payload = json.dumps({"type": "auth", "token": None})
    ws = MockWebSocket(receive_return=payload)

    # Act
    result = await authenticate_websocket(ws)

    # Assert
    assert result is False
    assert 1008 in ws.closed


async def test_token_integer_returns_false_and_closes_1008() -> None:
    """Token JSON entier (42) → retourne False et ferme avec le code 1008."""
    # Arrange
    payload = json.dumps({"type": "auth", "token": 42})
    ws = MockWebSocket(receive_return=payload)

    # Act
    result = await authenticate_websocket(ws)

    # Assert
    assert result is False
    assert 1008 in ws.closed


async def test_token_empty_string_returns_false_and_closes_1008() -> None:
    """Token chaîne vide → retourne False et ferme avec le code 1008."""
    # Arrange
    payload = json.dumps({"type": "auth", "token": ""})
    ws = MockWebSocket(receive_return=payload)

    # Act
    result = await authenticate_websocket(ws)

    # Assert
    assert result is False
    assert 1008 in ws.closed
