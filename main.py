"""
Entropy Monitor — FastAPI backend entry point.

Exposes two REST endpoints:

* ``GET /config`` — returns the backend URL and poll interval so the
  frontend can self-configure without hard-coded constants.
* ``GET /stats``  — returns real-time system telemetry (CPU, RAM, disk,
  power draw, top processes) as JSON.

All tuneable values (CORS origins, ports, poll interval, etc.) are read
from ``config.Settings`` which in turn loads from environment variables
or a ``.env`` file.

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

# Split the comma-separated string from config into a list for the
# CORS middleware; must match the origin(s) the frontend is served from.
origins = settings.cors_origins.split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

monitor = Monitor()

@app.get("/config", response_model=schemas.ConfigStats)
def get_config():
    """Return runtime configuration the frontend needs to operate.

    The response contains the fully-qualified backend URL (scheme + host
    + port) and the recommended polling interval in milliseconds.  This
    lets the JS client self-configure instead of hard-coding addresses.
    """
    return {
        "url": f"{settings.backend_address}:{settings.backend_port}",
        "poll_interval": settings.poll_interval_ms,
    }

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
