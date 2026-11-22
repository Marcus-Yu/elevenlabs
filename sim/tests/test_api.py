import pytest
from edsl import Model
from fastapi.testclient import TestClient

from atlas_sim.api import create_app
from atlas_sim.benchmark import payload


@pytest.fixture
def client(monkeypatch):
    def deny_network(*args, **kwargs):
        raise AssertionError("offline scoring attempted network access")

    monkeypatch.setattr("socket.socket.connect", deny_network)
    return TestClient(create_app(lambda: Model("test", canned_response={
        "interest": 4, "objection": "The cost is unclear.", "take_meeting": "yes",
    })))


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_live_wire_format(client):
    response = client.post("/score", json=payload())
    assert response.status_code == 200
    body = response.json()
    assert body.keys() == {"engine", "latencyMs", "scores"}
    assert body["engine"] == "edsl"
    assert body["latencyMs"] >= 0
    assert body["scores"] == [
        {"personaId": f"synthetic-{index}", "segmentIndex": 0, "interest": 4}
        for index in range(1, 9)
    ]


def test_measured_wire_format(client):
    request = payload()
    request["tier"] = "measured"
    request["personas"] = request["personas"][:1]
    response = client.post("/score", json=request)
    assert response.status_code == 200
    assert response.json()["summary"] == {
        "meanInterest": 4.0,
        "spread": 0.0,
        "meetingRate": 1.0,
        "topObjections": [{"segment": "segment-1", "text": "The cost is unclear."}],
    }
    assert response.json()["scores"][0]["objection"] == "The cost is unclear."


@pytest.mark.parametrize("field", ["personas", "segments"])
def test_duplicate_ids_rejected(client, field):
    request = payload()
    request[field].append(request[field][0])
    assert client.post("/score", json=request).status_code == 422


def test_missing_model_configuration(monkeypatch):
    monkeypatch.delenv("SIM_EDSL_MODEL", raising=False)
    assert TestClient(create_app()).post("/score", json=payload()).status_code == 503
