"""Pure aggregation of validated simulation observations.

The provisional contract does not specify aggregation semantics. We use the
unrounded mean of every interest observation, the range of iteration means as
spread, and the fraction of final-sentence meeting votes that are yes. A score
is the persona/sentence mean rounded half up. Objections are grouped by exact
whitespace-normalized wording; frequency ties resolve lexicographically.
These choices should be revisited when the shared contract defines them.
"""

from collections import Counter, defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from fractions import Fraction
from itertools import product


@dataclass(frozen=True)
class Observation:
    iteration: int
    persona_id: str
    segment_index: int
    interest: int
    objection: str | None = None
    take_meeting: bool | None = None


@dataclass(frozen=True)
class Score:
    persona_id: str
    segment_index: int
    interest: int
    objection: str | None = None


@dataclass(frozen=True)
class TopObjection:
    segment: str
    text: str


@dataclass(frozen=True)
class Summary:
    mean_interest: float
    spread: float
    meeting_rate: float
    top_objections: tuple[TopObjection, ...]


@dataclass(frozen=True)
class AggregateResult:
    scores: tuple[Score, ...]
    summary: Summary | None = None


def _winner(counter: Counter[str]) -> str:
    return min(counter, key=lambda text: (-counter[text], text))


def aggregate(
    observations: Sequence[Observation],
    *,
    persona_segments: Mapping[str, str],
    segment_indices: Sequence[int],
    iterations: int,
    measured: bool,
) -> AggregateResult:
    """Aggregate exactly one observation per requested iteration/persona/sentence.

    Iterations are zero-based; segment_indices are in pitch order, so the last
    index identifies the final sentence. Measured runs require an objection on
    every cell and a boolean meeting vote only on the final sentence. Live runs
    contain only interest. Invalid, missing, duplicate, or extra data raise
    ValueError; no partial score is silently returned.
    """
    if type(iterations) is not int or iterations < 1 or type(measured) is not bool:
        raise ValueError("iterations must be positive and measured must be boolean")
    if not persona_segments or any(not isinstance(p, str) or not p or
                                   not isinstance(s, str) or not s
                                   for p, s in persona_segments.items()):
        raise ValueError("persona IDs and segments must be nonempty strings")
    if (not segment_indices or any(type(s) is not int or s < 0 for s in segment_indices)
            or len(set(segment_indices)) != len(segment_indices)):
        raise ValueError("segment indices must be distinct nonnegative integers")

    expected = set(product(range(iterations), persona_segments, segment_indices))
    final = segment_indices[-1]
    cells: dict[tuple[int, str, int], Observation] = {}
    for row in observations:
        if not isinstance(row, Observation):
            raise ValueError("invalid observation")
        if (type(row.iteration) is not int or type(row.segment_index) is not int
                or not isinstance(row.persona_id, str)
                or type(row.interest) is not int or not 1 <= row.interest <= 7):
            raise ValueError("invalid observation fields")
        key = (row.iteration, row.persona_id, row.segment_index)
        if key not in expected or key in cells:
            raise ValueError("unexpected or duplicate observation")
        if measured:
            if not isinstance(row.objection, str) or not row.objection.strip():
                raise ValueError("measured observation requires an objection")
            if row.segment_index == final:
                if type(row.take_meeting) is not bool:
                    raise ValueError("final observation requires a boolean meeting vote")
            elif row.take_meeting is not None:
                raise ValueError("meeting vote must be on the final sentence")
        elif row.objection is not None or row.take_meeting is not None:
            raise ValueError("live observation must contain only interest")
        cells[key] = row
    if cells.keys() != expected:
        raise ValueError("missing observations")

    scores = []
    for persona, segment in product(persona_segments, segment_indices):
        rows = [cells[i, persona, segment] for i in range(iterations)]
        mean = Fraction(sum(row.interest for row in rows), iterations)
        rounded = (2 * mean.numerator + mean.denominator) // (2 * mean.denominator)
        objection = _winner(Counter(" ".join(row.objection.split()) for row in rows)) if measured else None
        scores.append(Score(persona, segment, rounded, objection))
    if not measured:
        return AggregateResult(tuple(scores))

    count_per_iteration = len(persona_segments) * len(segment_indices)
    means = [Fraction(sum(cells[i, p, s].interest for p, s in product(persona_segments, segment_indices)),
                      count_per_iteration) for i in range(iterations)]
    votes = [cells[i, p, final].take_meeting for i, p in product(range(iterations), persona_segments)]
    objections: dict[str, Counter[str]] = defaultdict(Counter)
    for row in cells.values():
        objections[persona_segments[row.persona_id]][" ".join(row.objection.split())] += 1
    summary = Summary(
        float(sum(means, Fraction()) / iterations),
        float(max(means) - min(means)),
        sum(votes) / len(votes),
        tuple(TopObjection(group, _winner(counts)) for group, counts in sorted(objections.items())),
    )
    return AggregateResult(tuple(scores), summary)
