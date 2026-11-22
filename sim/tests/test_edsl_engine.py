from types import SimpleNamespace

import pytest
from edsl import Model

from atlas_sim.edsl_engine import score_with_edsl


def request(tier):
    personas = [SimpleNamespace(id=i, segment=s, label=i, company_domain="example.com",
                                role="buyer", traits={"focus": "cost"}, sources=[])
                for i, s in [("p1", "a"), ("p2", "b")]]
    segments = [SimpleNamespace(index=1, text="Second."),
                SimpleNamespace(index=0, text="First.")]
    return SimpleNamespace(tier=tier, personas=personas, segments=segments)


@pytest.mark.parametrize("tier,iterations", [("live", 1), ("measured", 3)])
def test_offline_keyed_observations(tier, iterations, monkeypatch):
    def deny_network(*args, **kwargs):
        raise AssertionError("test model attempted network access")

    monkeypatch.setattr("socket.socket.connect", deny_network)
    model = Model("test", canned_response={"interest": 4, "objection": "Too expensive.",
                                          "take_meeting": "yes"})
    rows = score_with_edsl(request(tier), model=model, iterations=iterations)
    assert len(rows) == 4 * iterations
    assert len({(r.persona_id, r.segment_index, r.iteration) for r in rows}) == len(rows)
    assert {r.persona_id for r in rows} == {"p1", "p2"}
    assert all(r.interest == 4 for r in rows)
    if tier == "live":
        assert all(r.objection is None and r.take_meeting is None for r in rows)
    else:
        assert all(r.objection == "Too expensive." for r in rows)
        assert all(r.take_meeting is (True if r.segment_index == 1 else None) for r in rows)


def test_sourced_profile_and_pitch_only_appear_in_the_user_prompt(monkeypatch):
    model = Model("test", canned_response="4")
    calls = []
    execute = type(model).async_execute_model_call

    async def record_prompts(self, user_prompt, system_prompt, *args, **kwargs):
        calls.append((user_prompt, system_prompt))
        return await execute(self, user_prompt, system_prompt, *args, **kwargs)

    monkeypatch.setattr(type(model), "async_execute_model_call", record_prompts)
    score_with_edsl(request("live"), model=model, iterations=1)

    assert len(calls) == 4
    assert all("example.com" in user and "First." in user for user, _ in calls)
    assert any("First. Second." in user for user, _ in calls)
    assert all("example.com" not in system and "First." not in system for _, system in calls)
