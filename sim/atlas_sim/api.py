"""Atlas scoring HTTP service."""

import logging
import os
from collections.abc import Callable
from dataclasses import asdict
from time import perf_counter
from typing import Any

from edsl import Model
from fastapi import FastAPI, HTTPException

from .calibration_routes import calibration_router
from .contracts import ScoreRequest, ScoreResponse
from .edsl_engine import score_with_edsl
from .scoring import aggregate

logger = logging.getLogger(__name__)


def configured_model() -> Any:
    name = os.environ.get("SIM_EDSL_MODEL", "").strip()
    service = os.environ.get("SIM_EDSL_SERVICE", "").strip()
    if not name or not service or name == "test" or service == "test":
        raise HTTPException(
            status_code=503,
            detail="Set SIM_EDSL_MODEL and SIM_EDSL_SERVICE to a provider model.",
        )
    return Model(name, service_name=service)


def create_app(model_factory: Callable[[], Any] = configured_model) -> FastAPI:
    app = FastAPI(title="Atlas Simulation")
    app.include_router(calibration_router(model_factory))

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/score", response_model=ScoreResponse, response_model_exclude_none=True)
    def score(request: ScoreRequest) -> ScoreResponse:
        started = perf_counter()
        measured = request.tier == "measured"
        iterations = (request.iterations or 3) if measured else 1
        try:
            observations = score_with_edsl(
                request, model=model_factory(), iterations=iterations,
            )
            result = aggregate(
                observations,
                persona_segments={persona.id: persona.segment for persona in request.personas},
                segment_indices=sorted(segment.index for segment in request.segments),
                iterations=iterations,
                measured=measured,
            )
        except HTTPException:
            raise
        except Exception as error:
            logger.warning("EDSL scoring failed (%s)", type(error).__name__)
            raise HTTPException(
                status_code=502, detail="The scoring engine could not complete the panel.",
            ) from None
        return ScoreResponse(
            engine="edsl",
            latency_ms=round((perf_counter() - started) * 1000),
            **asdict(result),
        )

    return app


app = create_app()
