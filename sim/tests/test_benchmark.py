import unittest
from atlas_sim import benchmark


def valid(body):
    return {"engine": "edsl", "latencyMs": 1, "scores": [
        {"personaId": p["id"], "segmentIndex": 0, "interest": 4}
        for p in body["personas"]]}


class Tests(unittest.TestCase):
    def test_serial_requests_and_quantiles(self):
        times = iter(x for i in range(20) for x in (0, i + 1))
        calls = []
        def post(url, body):
            calls.append((url, body))
            return valid(body)
        self.assertEqual(benchmark.run("unused", post=post, clock=lambda: next(times)), (10, 19))
        self.assertEqual(len(calls), 20)
        body = calls[0][1]
        self.assertEqual((len(body['personas']), len(body['segments']), body['tier']), (8, 1, 'live'))
        self.assertTrue(all(set(p) == {'id', 'segment', 'label', 'companyDomain', 'role', 'traits', 'sources'} for p in body['personas']))

    def test_rejects_wrong_engine_missing_duplicate_and_invalid_scores(self):
        body = benchmark.payload()
        for mutation in ('engine', 'missing', 'duplicate', 'interest', 'segment'):
            response = valid(body)
            if mutation == 'engine': response['engine'] = 'direct'
            if mutation == 'missing': response['scores'].pop()
            if mutation == 'duplicate': response['scores'][1]['personaId'] = response['scores'][0]['personaId']
            if mutation == 'interest': response['scores'][0]['interest'] = True
            if mutation == 'segment': response['scores'][0]['segmentIndex'] = 1
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                benchmark.validate_response(response, body)

    def test_failed_post_aborts(self):
        def fail(*args):
            raise RuntimeError('failed')
        with self.assertRaises(RuntimeError):
            benchmark.run('unused', post=fail)


if __name__ == '__main__':
    unittest.main()
