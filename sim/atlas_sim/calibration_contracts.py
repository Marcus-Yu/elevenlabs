"""Wire contracts for synthetic candidate calibration."""

from typing import Annotated, Literal

from pydantic import Field, StringConstraints, model_validator

from .contracts import WireModel

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
NeedText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2_000)]
ReasonText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=600)]
Evidence = Annotated[list[ShortText], Field(min_length=1, max_length=8)]
Years = Annotated[int, Field(strict=True, ge=0, le=60)]


class ProfilesRequest(WireModel):
    need: NeedText


class CalibrationProfile(WireModel):
    id: ShortText
    label: ShortText
    years_experience: Years
    skills: Annotated[list[ShortText], Field(min_length=1, max_length=8)]
    work_style: ShortText
    synthetic: Literal[True]


class ProfilesResponse(WireModel):
    profiles: Annotated[list[CalibrationProfile], Field(min_length=6, max_length=8)]


class CalibrationReaction(WireModel):
    id: ShortText
    profile_id: ShortText
    decision: Literal["pick", "reject"]
    reason: ReasonText


class CriteriaRequest(WireModel):
    profiles: Annotated[list[CalibrationProfile], Field(min_length=6, max_length=8)]
    reactions: Annotated[list[CalibrationReaction], Field(min_length=1, max_length=8)]

    @model_validator(mode="after")
    def validate_references(self) -> "CriteriaRequest":
        profile_ids = {profile.id for profile in self.profiles}
        if len(profile_ids) != len(self.profiles):
            raise ValueError("profile IDs must be unique")
        if len({reaction.id for reaction in self.reactions}) != len(self.reactions):
            raise ValueError("reaction IDs must be unique")
        reacted_profiles = {reaction.profile_id for reaction in self.reactions}
        if not reacted_profiles <= profile_ids:
            raise ValueError("each reaction must identify a supplied profile")
        if len(reacted_profiles) != len(self.reactions):
            raise ValueError("provide at most one reaction per profile")
        return self


class ExperienceCriterion(WireModel):
    years: Years
    reaction_ids: Evidence


class SkillCriterion(WireModel):
    skill: ShortText
    reaction_ids: Evidence


class TradeOffCriterion(WireModel):
    text: ReasonText
    reaction_ids: Evidence


class CriteriaResponse(WireModel):
    minimum_experience: ExperienceCriterion | None = None
    must_have_skills: list[SkillCriterion]
    trade_offs: list[TradeOffCriterion]
