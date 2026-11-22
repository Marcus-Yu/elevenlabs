import unittest
from types import SimpleNamespace

from atlas_sim.calibration_criteria import infer_criteria


def profile(identifier, years=6, skills=None):
    return {"id": identifier, "label": identifier, "years_experience": years,
            "skills": skills or ["Python", "JavaScript"], "work_style": "collaborative"}


def reaction(identifier, profile_id, decision, reason):
    return {"id": identifier, "profile_id": profile_id, "decision": decision, "reason": reason}


class CalibrationCriteriaTests(unittest.TestCase):
    def test_explicit_supported_criteria_and_evidence(self):
        req = {"profiles": [profile("a")], "reactions": [
            reaction("r2", "a", "pick", "We need at least 5 years of experience."),
            reaction("r1", "a", "pick", "Must have Python, but value collaboration."),
            reaction("r3", "a", "reject", "Strong skills but lacks availability."),
        ]}
        result = infer_criteria(req)
        self.assertEqual(result["minimum_experience"], {"years": 5, "reaction_ids": ["r2"]})
        self.assertEqual(result["must_have_skills"], [{"skill": "Python", "reaction_ids": ["r1"]}])
        self.assertEqual([x["reaction_ids"] for x in result["trade_offs"]], [["r1"], ["r3"]])
        self.assertEqual(result, infer_criteria({**req, "reactions": list(reversed(req["reactions"]))}))

    def test_does_not_infer_correlation_negation_or_unsupported_facts(self):
        req = {"profiles": [profile("a", 3)], "reactions": [
            reaction("r1", "a", "pick", "Great candidate with Python and three years."),
            reaction("r2", "a", "pick", "We do not need at least 5 years."),
            reaction("r3", "a", "pick", "Need at least 5 years."),
            reaction("r4", "a", "pick", "Must have Rust."),
            reaction("r5", "a", "reject", "Must have Python."),
            reaction("r6", "a", "pick", "Need Java."),
            reaction("r7", "a", "pick", "Need Python, but it is not required."),
            reaction("r8", "a", "pick", "Need at least 3 years is not required."),
        ]}
        result = infer_criteria(req)
        self.assertIsNone(result["minimum_experience"])
        self.assertEqual(result["must_have_skills"], [])

    def test_conflicting_minima_not_guessed(self):
        req = {"profiles": [profile("a")], "reactions": [reaction("a", "a", "pick", "Need at least 3 years"), reaction("b", "a", "pick", "Need at least 5 years")]}
        self.assertIsNone(infer_criteria(req)["minimum_experience"])

    def test_duplicate_and_missing_references_are_rejected(self):
        for req in [
            {"profiles": [profile("a"), profile("a")], "reactions": []},
            {"profiles": [profile("a")], "reactions": [reaction("r", "missing", "pick", "ok")]},
            {"profiles": [profile("a")], "reactions": [reaction("r", "a", "pick", "ok")] * 2},
        ]:
            with self.subTest(req=req), self.assertRaises(ValueError):
                infer_criteria(req)

    def test_attribute_based_request(self):
        req = SimpleNamespace(profiles=[SimpleNamespace(**profile("a"))], reactions=[SimpleNamespace(**reaction("r", "a", "pick", "Need Python"))])
        self.assertEqual(infer_criteria(req)["must_have_skills"][0]["reaction_ids"], ["r"])


if __name__ == "__main__":
    unittest.main()
