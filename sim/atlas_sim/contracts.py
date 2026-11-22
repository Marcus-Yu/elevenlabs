"""HTTP models for the merged app/src/shared/contracts/sim.ts wire contract."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

Nonempty = Annotated[str, Field(min_length=1)]
Interest = Annotated[int, Field(strict=True, ge=1, le=7)]
Index = Annotated[int, Field(strict=True, ge=0)]


class WireModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SourceRef(WireModel):
    provider: Literal["fiber", "ploid", "web"]
    url: str | None = None
    fetched_at: str
    claim: str


class Persona(WireModel):
    id: Nonempty
    segment: Nonempty
    label: str
    company_domain: str
    role: str
    traits: dict[str, str]
    sources: list[SourceRef]


class PitchSegment(WireModel):
    index: Index
    text: Nonempty


class ScoreRequest(WireModel):
    personas: Annotated[list[Persona], Field(min_length=1)]
    segments: Annotated[list[PitchSegment], Field(min_length=1)]
    tier: Literal["live", "measured"]
    iterations: Annotated[int, Field(strict=True, ge=1)] | None = None

    @model_validator(mode="after")
    def validate_unique_keys(self) -> "ScoreRequest":
        if len({persona.id for persona in self.personas}) != len(self.personas):
            raise ValueError("persona IDs must be unique")
        if len({segment.index for segment in self.segments}) != len(self.segments):
            raise ValueError("segment indices must be unique")
        return self


class Score(WireModel):
    persona_id: str
    segment_index: Index
    interest: Interest
    objection: str | None = None


class SegmentObjection(WireModel):
    segment: str
    text: str


class ScoreSummary(WireModel):
    mean_interest: Annotated[float, Field(ge=1, le=7)]
    spread: Annotated[float, Field(ge=0, le=6)]
    meeting_rate: Annotated[float, Field(ge=0, le=1)]
    top_objections: list[SegmentObjection]


class ScoreResponse(WireModel):
    engine: Literal["edsl", "direct"]
    latency_ms: Annotated[int, Field(ge=0)]
    scores: list[Score]
    summary: ScoreSummary | None = None
