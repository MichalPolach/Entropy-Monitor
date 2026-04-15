"""
Hardware / OS metric collector for Entropy Monitor.

Wraps *psutil* calls behind a single ``Monitor`` class so the FastAPI
layer only needs to call ``get_stats()``, ``get_top_processes()``,
``get_temps()``, and ``statistics()`` without knowing the underlying
platform details.
"""

import psutil
import time


class Monitor:
    """Stateful collector that refreshes system metrics on demand.

    Metrics are stored in an internal dictionary and returned wholesale
    by ``statistics()``.  Each ``get_*`` method overwrites its portion of
    the dictionary, so callers always receive the most recent reading.
    """

    def __init__(self) -> None:
        self.stats: dict = {}

    def get_power_usage(self) -> float:
        """Read instantaneous battery power draw from sysfs.

        Linux exposes the value in microwatts at
        ``/sys/class/power_supply/BAT0/power_now``; this method converts
        it to watts.  Returns ``0.0`` on desktops or when the sensor
        file is inaccessible.
        """
        try:
            with open("/sys/class/power_supply/BAT0/power_now", "r") as f:
                power_uw = int(f.read().strip())
                return power_uw / 1_000_000
        except (FileNotFoundError, ValueError, PermissionError):
            return 0.0

    def get_stats(self) -> None:
        """Populate scalar system metrics (CPU, memory, disk, power).

        CPU percentage uses a **1-second blocking interval** so the value
        reflects actual load rather than an instantaneous spike. Memory
        and disk sizes are converted from bytes to gibibytes (GiB).
        """
        self.stats["cpu"] = psutil.cpu_percent(interval=1)

        memory = psutil.virtual_memory()
        self.stats["memory_total"] = memory.total / (1024 ** 3)
        self.stats["memory_used"] = memory.used / (1024 ** 3)
        self.stats["memory_available"] = memory.available / (1024 ** 3)
        self.stats["memory_percent"] = memory.percent

        disk = psutil.disk_usage("/")
        self.stats["disk_percent"] = disk.percent
        self.stats["disk_used"] = disk.used / (1024 ** 3)
        self.stats["disk_free"] = disk.free / (1024 ** 3)
        self.stats["disk_total"] = disk.total / (1024 ** 3)

        self.stats["power_watts"] = self.get_power_usage()

    def get_top_processes(self) -> None:
        """Identify the 10 most CPU-intensive processes.

        Uses psutil's recommended **two-pass** technique:
        1. *Prime* — call ``cpu_percent()`` on every process to start the
           internal timer.
        2. *Sleep* — wait briefly (100 ms) so the kernel accumulates
           meaningful CPU time deltas.
        3. *Collect* — read back ``cpu_percent`` (now a real delta) plus
           RSS memory for each process.

        Processes that vanish or deny access between passes are silently
        skipped.
        """
        for p in psutil.process_iter(["pid", "name", "cpu_percent"]):
            p.cpu_percent()

        time.sleep(0.1)

        processes = []
        for p in psutil.process_iter(["pid", "name", "cpu_percent"]):
            try:
                info = p.info
                info["memory_mb"] = p.memory_info().rss / (1024 * 1024)
                processes.append(info)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        top_10_cpu = sorted(processes, key=lambda x: x["cpu_percent"], reverse=True)[:10]
        top_10_mem = sorted(processes, key=lambda x: x["memory_mb"], reverse=True)[:10]
        self.stats["top_processes_cpu"] = top_10_cpu
        self.stats["top_processes_mem"] = top_10_mem

    def get_temps(self) -> None:
        """Read CPU and NVMe temperatures via ``psutil.sensors_temperatures()``.

        CPU temperature is resolved with a vendor-priority chain:
        Intel (``coretemp``) -> AMD (``k10temp``) -> generic ACPI
        (``acpitz``).  Only the first sensor entry (index 0) is used
        from whichever source matches.

        NVMe temperature is read from the ``nvme`` key if present.

        Both values fall back to ``0.0`` when the relevant sensor group
        is missing or its list is empty.
        """
        temps = psutil.sensors_temperatures()

        if not temps:
            self.stats["cpu_temp"] = 0.0
            self.stats["nvme_temp"] = 0.0
            return

        try:
            if "coretemp" in temps:
                self.stats["cpu_temp"] = temps["coretemp"][0].current
            elif "k10temp" in temps:
                self.stats["cpu_temp"] = temps["k10temp"][0].current
            elif "acpitz" in temps:
                self.stats["cpu_temp"] = temps["acpitz"][0].current
            else:
                self.stats["cpu_temp"] = 0.0
        except IndexError:
            self.stats["cpu_temp"] = 0.0

        try:
            if "nvme" in temps:
                self.stats["nvme_temp"] = temps["nvme"][0].current
            else:
                self.stats["nvme_temp"] = 0.0
        except IndexError:
            self.stats["nvme_temp"] = 0.0


    def statistics(self) -> dict:
        """Return the most recently collected metrics dictionary."""
        return self.stats