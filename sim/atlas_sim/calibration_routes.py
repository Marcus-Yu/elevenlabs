"""Private calibration endpoints used by the Atlas gateway."""

import logging
from collections.abc import Callable
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from .calibration_contracts import (
    CalibrationProfile,
    CriteriaRequest,
    CriteriaResponse,
    ProfilesRequest,
    ProfilesResponse,
)
from .calibration_criteria import infer_criteria
from .calibration_engine import generate_profiles

logger = logging.getLogger(__name__)


def calibration_router(model_factory: Callable[[], object]) -> APIRouter:
    router = APIRouter(prefix="/calibrate")

    @router.post("/profiles", response_model=ProfilesResponse)
    def profiles(request: ProfilesRequest) -> ProfilesResponse:
        try:
            candidates = generate_profiles(request, model=model_factory())
            return ProfilesResponse(profiles=[
                CalibrationProfile(
                    id=str(uuid4()),
                    label=f"Candidate archetype {index}",
                    years_experience=candidate["years_experience"],
                    skills=candidate["skills"],
                    work_style=candidate["work_style"],
                    synthetic=True,
                )
                for index, candidate in enumerate(candidates, start=1)
            ])
        except HTTPException:
            raise
        except Exception as error:
            logger.warning("EDSL calibration failed (%s)", type(error).__name__)
            raise HTTPException(502, "The simulation could not generate a complete calibration panel.") from None

    @router.post("/criteria", response_model=CriteriaResponse)
    def criteria(request: CriteriaRequest) -> CriteriaResponse:
        return CriteriaResponse.model_validate(infer_criteria(request))

    return router
