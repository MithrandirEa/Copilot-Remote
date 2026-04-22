"""
Fixtures partagées pour les tests du serveur Copilot Remote Bridge.

Fournit :
  - auth_secret_env  : injecte AUTH_SECRET_TOKEN dans l'environnement (autouse)
  - reset_ws_globals : réinitialise _vscode_ws / _mobile_ws entre chaque test (autouse)
  - AUTH_SECRET      : constante réutilisable dans les fichiers de test
"""
import os
import sys
import pytest

# Fallback : garantit que server/src est dans le PYTHONPATH même si pytest
# est lancé depuis un répertoire différent de server/.
_src_path = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "src"))
if _src_path not in sys.path:
    sys.path.insert(0, _src_path)

# Token partagé par tous les tests
AUTH_SECRET: str = "test-secret-for-testing"


@pytest.fixture(autouse=True)
def auth_secret_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Injecte AUTH_SECRET_TOKEN dans l'environnement pour chaque test."""
    monkeypatch.setenv("AUTH_SECRET_TOKEN", AUTH_SECRET)


@pytest.fixture(autouse=True)
def reset_ws_globals() -> None:
    """
    Réinitialise les connexions WebSocket globales de main.py avant et après
    chaque test. Garantit l'isolation même en cas d'échec partiel d'un test.
    """
    import main  # importé ici pour bénéficier du PYTHONPATH déjà configuré

    main._vscode_ws = None
    main._mobile_ws = None
    yield
    main._vscode_ws = None
    main._mobile_ws = None
