import json
import socket
from types import SimpleNamespace

import pytest
from edsl import Model

from atlas_sim.calibration_engine import generate_profiles


def profiles():
    return [{"years_experience": index + 1, "skills": [f"skill {index}"],
             "work_style": f"work style {index}"} for index in range(6)]


def run(response, monkeypatch):
    def deny_network(*args, **kwargs):
        raise AssertionError("network is disabled")
    monkeypatch.setattr(socket.socket, "connect", deny_network)
    return generate_profiles(SimpleNamespace(need="A manufacturing operations expert"),
                             model=Model("test", canned_response={"profiles": response}))


def test_generates_valid_profiles_with_generic_labels(monkeypatch):
    result = run(json.dumps(profiles()), monkeypatch)
    assert len(result) == 6
    assert result[0] == {"label": "Role archetype 1", **profiles()[0]}
    assert len({p["label"] for p in result}) == 6


@pytest.mark.parametrize("output", ["not JSON", json.dumps(profiles()[:5]),
    json.dumps([profiles()[0]] * 6),
    json.dumps([{**p, "years_experience": "4"} for p in profiles()]),
    json.dumps([{**p, "name": "A person"} for p in profiles()])])
def test_invalid_generation_fails_closed(output, monkeypatch):
    with pytest.raises(ValueError):
        run(output, monkeypatch)
