"""Tests for the FastAPI dashboard server."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
from server.api import app

client = TestClient(app)


def test_get_regimes():
    resp = client.get("/api/regimes")
    assert resp.status_code == 200
    data = resp.json()
    assert "trending_up" in data
    assert len(data) == 5


def test_get_tokens():
    resp = client.get("/api/tokens")
    assert resp.status_code == 200
    data = resp.json()
    assert "BNB" in data
    assert len(data) > 20


def test_backtest_invalid_regime():
    resp = client.post("/api/backtest", json={"symbol": "BNB", "regime": "invalid"})
    assert resp.status_code == 400
