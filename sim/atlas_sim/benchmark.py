"""Serial HTTP latency spike for an EDSL direct-provider model deployment.

Run: python -m atlas_sim.benchmark [http://127.0.0.1:8000/score]
This makes 20 real scoring requests; configure the service separately. The EDSL
model must call its provider directly rather than a cached or stubbed model.
"""
import argparse
import json
import math
import time
from urllib.request import Request, urlopen

TRIALS = 20


def payload():
    return {
        "personas": [
            {
                "id": f"synthetic-{index}",
                "segment": f"segment-{index % 4}",
                "label": f"Synthetic operations archetype {index}",
                "companyDomain": "example.com",
                "role": "Operations leader",
                "traits": {"priority": "operational efficiency"},
                "sources": [],
            }
            for index in range(1, 9)
        ],
        "segments": [{"index": 0, "text": "We help operations teams reduce manual work."}],
        "tier": "live",
    }


def validate_response(response, body):
    if not isinstance(response, dict) or response.get("engine") != "edsl":
        raise ValueError("expected an EDSL response")
    latency = response.get("latencyMs")
    if type(latency) not in (int, float) or not math.isfinite(latency) or latency < 0:
        raise ValueError("invalid response latencyMs")
    rows = response.get("scores")
    if not isinstance(rows, list) or len(rows) != len(body["personas"]):
        raise ValueError("expected exactly one score per persona")
    expected = {p["id"] for p in body["personas"]}
    seen = set()
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("invalid score row")
        persona = row.get("personaId")
        interest = row.get("interest")
        segment = row.get("segmentIndex")
        if (
            not isinstance(persona, str) or persona not in expected or persona in seen
            or type(segment) is not int or segment != 0
            or type(interest) is not int or not 1 <= interest <= 7
        ):
            raise ValueError("invalid or duplicate score row")
        seen.add(persona)


def post_score(url, body):
    request = Request(
        url,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=120) as response:
        return json.load(response)


def nearest_rank(samples, percentile):
    if not samples or not 0 < percentile <= 1:
        raise ValueError("nonempty samples and percentile in (0, 1] required")
    return sorted(samples)[math.ceil(percentile * len(samples)) - 1]


def run(url, *, post=post_score, clock=time.perf_counter, trials=TRIALS):
    if type(trials) is not int or trials < 1:
        raise ValueError("trials must be a positive integer")
    body = payload()
    samples = []
    for _ in range(trials):
        start = clock()
        response = post(url, body)
        elapsed = clock() - start
        validate_response(response, body)
        if not math.isfinite(elapsed) or elapsed < 0:
            raise ValueError("invalid clock duration")
        samples.append(elapsed)
    p50, p95 = nearest_rank(samples, .5), nearest_rank(samples, .95)
    return p50, p95


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", nargs="?", default="http://127.0.0.1:8000/score")
    args = parser.parse_args()
    p50, p95 = run(args.url)
    decision = "add direct engine for live tier" if p50 > 2.5 else "keep EDSL for live tier"
    print(f"{TRIALS} serial HTTP requests; nearest-rank quantiles (rank = ceil(p*n)): "
          f"p50={p50:.3f}s, p95={p95:.3f}s; decision: {decision}")


if __name__ == "__main__":
    main()
