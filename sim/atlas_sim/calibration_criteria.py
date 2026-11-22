"""Conservative, deterministic drafts from explicitly stated calibration reasons.

These are sample-supported suggestions, not verified hiring requirements. A
minimum is proposed only from an unambiguous, explicit positive minimum in a
pick reason supported by that profile; conflicting explicit minima yield None.
A skill is proposed only when an explicit must-have statement names a skill on
that picked profile. Trade-offs are verbatim reaction reasons with an explicit
contrast. No inference is made solely from profile correlations or a rejection.
"""

import re
from collections import defaultdict
from collections.abc import Mapping
from typing import Any


def _get(value: Any, field: str) -> Any:
    return value[field] if isinstance(value, Mapping) else getattr(value, field)


# Anchoring avoids extracting requirements from quoted, negated or hypothetical
# remarks later in a reason. These patterns intentionally miss many valid phrasings.
_MINIMUM = re.compile(
    r"^(?:we |i )?(?:need|require|want|must have) (?:at least|a minimum of) "
    r"(\d{1,2}) years?(?: of experience)?(?:\b|$)", re.IGNORECASE,
)
_REQUIRED_SKILL = re.compile(r"^(?:we |i )?(?:must have|require|need)\s+", re.IGNORECASE)
_NEGATION = re.compile(r"\b(?:no|not|never|none|without|optional|unnecessary)\b|n[’']t\b", re.IGNORECASE)
_CONTRAST = re.compile(r"\b(?:but|however|although|trade[ -]off)\b", re.IGNORECASE)


def infer_criteria(request: Any) -> dict[str, Any]:
    """Infer a draft from mapping- or attribute-based profiles and reactions.

    Invalid/duplicate profile or reaction IDs and dangling references raise
    ValueError; a reaction cannot be safely cited if its identity is ambiguous.
    Results use stable ordering independent of input order. Reasons remain data.
    """
    profiles = {}
    for profile in _get(request, "profiles"):
        identifier = _get(profile, "id")
        if not isinstance(identifier, str) or not identifier or identifier in profiles:
            raise ValueError("profile IDs must be unique nonempty strings")
        profiles[identifier] = profile
    reactions = list(_get(request, "reactions"))
    ids = set()
    for reaction in reactions:
        identifier = _get(reaction, "id")
        if not isinstance(identifier, str) or not identifier or identifier in ids:
            raise ValueError("reaction IDs must be unique nonempty strings")
        ids.add(identifier)
        if _get(reaction, "profile_id") not in profiles:
            raise ValueError("reaction references an unknown profile")
        if _get(reaction, "decision") not in ("pick", "reject"):
            raise ValueError("invalid reaction decision")

    minima: dict[int, set[str]] = defaultdict(set)
    skill_citations: dict[str, set[str]] = defaultdict(set)
    tradeoffs: dict[str, set[str]] = defaultdict(set)
    for reaction in reactions:
        reason = _get(reaction, "reason")
        if not isinstance(reason, str):
            raise ValueError("reaction reason must be a string")
        reason = " ".join(reason.split())
        reaction_id = _get(reaction, "id")
        if _CONTRAST.search(reason):
            tradeoffs[reason].add(reaction_id)
        if _get(reaction, "decision") != "pick" or _NEGATION.search(reason):
            continue
        profile = profiles[_get(reaction, "profile_id")]
        match = _MINIMUM.match(reason)
        if match:
            years = int(match.group(1))
            experience = _get(profile, "years_experience")
            if type(experience) is int and experience >= years and years > 0:
                minima[years].add(reaction_id)
        skill_prefix = _REQUIRED_SKILL.match(reason)
        if skill_prefix:
            tail = reason[skill_prefix.end():]
            for skill in _get(profile, "skills"):
                if not isinstance(skill, str) or not skill.strip():
                    continue
                # Entire skill name must immediately follow the requirement,
                # ending at punctuation or the end; avoid matching 'Java' in 'JavaScript'.
                if re.match(re.escape(skill.strip()) + r"(?=$|[.,;:!?]|\s+(?:and|but)\b)", tail, re.IGNORECASE):
                    skill_citations[skill.strip()].add(reaction_id)
    minimum = None
    if len(minima) == 1:
        years, references = next(iter(minima.items()))
        minimum = {"years": years, "reaction_ids": sorted(references)}
    return {
        "minimum_experience": minimum,
        "must_have_skills": [{"skill": skill, "reaction_ids": sorted(refs)}
                             for skill, refs in sorted(skill_citations.items(), key=lambda item: (item[0].casefold(), item[0]))],
        "trade_offs": [{"text": text, "reaction_ids": sorted(refs)}
                       for text, refs in sorted(tradeoffs.items())],
    }
