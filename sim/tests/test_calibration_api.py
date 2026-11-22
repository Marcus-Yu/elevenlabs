import json
import socket

import pytest
from edsl import Model
from fastapi.testclient import TestClient

from atlas_sim.api import create_app

CANDIDATES = [
    {"years_experience": index + 4, "skills": ["ROS 2", f"Robotics skill {index}"],
     "work_style": f"Works in setting {index}"}
    for index in range(6)
]


@pytest.fixture
def client(monkeypatch):
    def deny_network(*args, **kwargs):
        raise AssertionError("Offline calibration attempted network access")

    monkeypatch.setattr(socket.socket, "connect", deny_network)
    return TestClient(create_app(lambda: Model("test", canned_response={
        "profiles": json.dumps(CANDIDATES),
    })))


def generate(client):
    response = client.post("/calibrate/profiles", json={"need": "We need a robotics engineer"})
    assert response.status_code == 200
    return response.json()["profiles"]


def test_calibration_round_trip(client):
    profiles = generate(client)
    assert len(profiles) == len({profile["id"] for profile in profiles}) == 6
    assert all(profile["synthetic"] is True for profile in profiles)
    assert profiles[0]["label"] == "Candidate archetype 1"
    response = client.post("/calibrate/criteria", json={
        "profiles": profiles,
        "reactions": [
            {"id": "r1", "profileId": profiles[1]["id"], "decision": "pick", "reason": "We need at least 5 years"},
            {"id": "r2", "profileId": profiles[2]["id"], "decision": "pick", "reason": "Must have ROS 2"},
            {"id": "r3", "profileId": profiles[3]["id"], "decision": "reject",
             "reason": "Good experience, but I prefer more hands-on work"},
        ],
    })
    assert response.status_code == 200
    assert response.json() == {
        "minimumExperience": {"years": 5, "reactionIds": ["r1"]},
        "mustHaveSkills": [{"skill": "ROS 2", "reactionIds": ["r2"]}],
        "tradeOffs": [{"text": "Good experience, but I prefer more hands-on work", "reactionIds": ["r3"]}],
    }


def test_rejects_unknown_profile_and_non_synthetic_profile(client):
    profiles = generate(client)
    reaction = {"id": "r1", "profileId": "unknown", "decision": "pick", "reason": "Good fit"}
    response = client.post("/calibrate/criteria", json={"profiles": profiles, "reactions": [reaction]})
    assert response.status_code == 422
    profiles[0]["synthetic"] = False
    reaction["profileId"] = profiles[0]["id"]
    response = client.post("/calibrate/criteria", json={"profiles": profiles, "reactions": [reaction]})
    assert response.status_code == 422


def test_profile_generation_requires_a_configured_model(monkeypatch):
    monkeypatch.delenv("SIM_EDSL_MODEL", raising=False)
    response = TestClient(create_app()).post("/calibrate/profiles", json={"need": "Robotics engineer"})
    assert response.status_code == 503
