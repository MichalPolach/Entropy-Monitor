"""
Entropy Monitor — FastAPI backend entry point.

Exposes a single REST endpoint (GET /stats) that returns real-time system
telemetry (CPU, RAM, disk, power draw, top processes) as JSON.  Designed to
be consumed by the companion vanilla-JS dashboard served separately.

Run development server with:
    uvicorn main:app --port 8000 --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from monitor import Monitor
import schemas

app = FastAPI(
    title=settings.app_title,
    description=settings.app_description
)

# Allowed origins must match however the frontend is served; the dashboard
# defaults to port 8080 during local development.
origins = settings.cors_origins.split(",") if isinstance(settings.cors_origins, str) else settings.cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

monitor = Monitor()


@app.get("/stats", response_model=schemas.SystemStats)
def read_stats():
    """Collect a snapshot of system metrics and return them in JSON format.

    The two collection steps are intentionally separate: ``get_stats``
    gathers scalar metrics (CPU %, RAM, disk, power) while
    ``get_top_processes`` performs a two-pass CPU sample that requires a
    short sleep, so keeping them decoupled makes future async conversion
    straightforward.
    """
    monitor.get_stats()
    monitor.get_top_processes()
    return monitor.statistics()
