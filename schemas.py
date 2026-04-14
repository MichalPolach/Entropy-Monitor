"""
Pydantic response models for the API endpoints.

These schemas serve double duty:

* **Validation** — FastAPI uses them as ``response_model`` to ensure the
  backend never returns malformed JSON.
* **Documentation** — they auto-generate the OpenAPI (Swagger) schema
  visible at ``/docs``.
"""

from pydantic import BaseModel
from typing import List


class ConfigStats(BaseModel):
    """Payload returned by ``GET /config``.

    Supplies the JS frontend with the information it needs to locate the
    API and schedule its polling loop, so nothing is hard-coded client-side.

    Attributes:
        url:           Fully-qualified backend base URL
                       (e.g. ``http://localhost:8000``).
        poll_interval: Recommended polling interval in milliseconds.
    """

    url: str
    poll_interval: int


class ProcessStats(BaseModel):
    """Snapshot of a single OS process.

    Attributes:
        pid:         Operating-system process identifier.
        name:        Human-readable process name (e.g. ``firefox``).
        cpu_percent: CPU usage since the last sample as a percentage of
                     one core (can exceed 100 % on multi-core machines
                     depending on psutil settings).
        memory_mb:   Resident Set Size (RSS) in mebibytes.
    """
    pid: int
    name: str
    cpu_percent: float
    memory_mb: float


class SystemStats(BaseModel):
    """Complete payload returned by ``GET /stats``.

    Attributes:
        cpu:              System-wide CPU utilisation (%).
        memory_total:     Total physical RAM (GiB).
        memory_used:      RAM currently in use (GiB).
        memory_available: RAM available for new processes (GiB).
        memory_percent:   RAM utilisation (%).
        disk_percent:     Root partition utilisation (%).
        disk_used:        Root partition space consumed (GiB).
        disk_free:        Root partition space remaining (GiB).
        disk_total:       Root partition total capacity (GiB).
        top_processes:    The 10 most CPU-hungry processes.
        power_watts:      Instantaneous battery power draw (W), or 0.0
                          when a battery sensor is unavailable.
        cpu_temp:         CPU die temperature (°C), resolved from Intel
                          ``coretemp``, AMD ``k10temp``, or ACPI
                          ``acpitz`` — whichever is available first.
                          ``0.0`` when no sensor is found.
        nvme_temp:        NVMe drive temperature (°C), or ``0.0`` when
                          no ``nvme`` sensor is exposed.
    """
    cpu: float
    memory_total: float
    memory_used: float
    memory_available: float
    memory_percent: float
    disk_percent: float
    disk_used: float
    disk_free: float
    disk_total: float
    top_processes: List[ProcessStats]
    power_watts: float
    cpu_temp: float
    nvme_temp: float