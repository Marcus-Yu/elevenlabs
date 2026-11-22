from dataclasses import replace
import unittest

from atlas_sim.scoring import Observation, aggregate


class ScoringTests(unittest.TestCase):
    def setUp(self):
        self.rows = [
            Observation(i, persona, segment, interest, objection,
                        vote if segment == 8 else None)
            for i, persona, segment, interest, objection, vote in [
                (0, "a", 3, 1, " Price  high ", False),
                (0, "a", 8, 3, "Risk", False),
                (0, "b", 3, 5, "Price high", True),
                (0, "b", 8, 7, "Risk", True),
                (1, "a", 3, 2, "Risk", True),
                (1, "a", 8, 4, "Risk", True),
                (1, "b", 3, 6, "Price high", False),
                (1, "b", 8, 6, "Price high", False),
            ]
        ]

    def aggregate(self, rows, **overrides):
        options = dict(persona_segments={"a": "ops", "b": "ops"},
                       segment_indices=[3, 8], iterations=2, measured=True)
        options.update(overrides)
        return aggregate(rows, **options)

    def test_measured_stats_and_deterministic_ties(self):
        result = self.aggregate(self.rows)
        self.assertEqual([s.interest for s in result.scores], [2, 4, 6, 7])
        self.assertEqual(result.scores[0].objection, "Price high")
        self.assertEqual(result.summary.mean_interest, 4.25)
        self.assertEqual(result.summary.spread, 0.5)
        self.assertEqual(result.summary.meeting_rate, 0.5)
        self.assertEqual([(o.segment, o.text) for o in result.summary.top_objections], [("ops", "Price high")])
        self.assertEqual(result, self.aggregate(list(reversed(self.rows))))

    def test_live_and_single_iteration(self):
        live = [replace(r, objection=None, take_meeting=None) for r in self.rows if r.iteration == 0]
        result = self.aggregate(live, iterations=1, measured=False)
        self.assertIsNone(result.summary)
        self.assertTrue(all(s.objection is None for s in result.scores))
        self.assertEqual(self.aggregate(self.rows[:4], iterations=1).summary.spread, 0)

    def test_rejects_incomplete_or_invalid_results(self):
        rows = self.rows
        cases = [rows[:-1], [r for r in rows if r.persona_id != "b"],
                 [r for r in rows if r.segment_index != 3],
                 [r for r in rows if r.iteration != 1], rows + [rows[0]],
                 rows + [replace(rows[0], persona_id="extra")],
                 [replace(rows[0], interest=True), *rows[1:]],
                 [replace(rows[0], interest=8), *rows[1:]],
                 [replace(rows[0], objection="  "), *rows[1:]],
                 [replace(rows[0], take_meeting=True), *rows[1:]],
                 [rows[0], replace(rows[1], take_meeting=None), *rows[2:]],
                 [rows[0], replace(rows[1], take_meeting=1), *rows[2:]]]
        for case in cases:
            with self.subTest(case=case), self.assertRaises(ValueError):
                self.aggregate(case)

    def test_final_segment_uses_request_order(self):
        rows = [replace(r, take_meeting=True if r.segment_index == 3 else None) for r in self.rows]
        self.assertEqual(self.aggregate(rows, segment_indices=[8, 3]).summary.meeting_rate, 1)

    def test_rejects_invalid_requested_axes(self):
        for overrides in ({"persona_segments": {}}, {"segment_indices": []},
                          {"segment_indices": [3, 3]}, {"iterations": 0}, {"iterations": True}):
            with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                self.aggregate(self.rows, **overrides)


if __name__ == "__main__":
    unittest.main()
