/**
 * Entropy Monitor — client-side polling & DOM updater.
 *
 * Fetches JSON from the FastAPI backend every 6 seconds and renders the
 * values into the dashboard cards, progress bars, and process table
 * defined in index.html.
 *
 * Colour thresholds for progress bars:
 *   - indigo  (≤ 60 %)  — healthy
 *   - amber   (61–85 %) — elevated
 *   - red     (> 85 %)  — critical
 */

/* ------------------------------------------------------------------ */
/*  DOM references                                                     */
/* ------------------------------------------------------------------ */

const cpu = document.getElementById('cpu-val');
const cpu_bar = document.getElementById('cpu-bar');

const memory_used = document.getElementById('mem-used-val');
const memory_total = document.getElementById('mem-total-val');
const memory_bar = document.getElementById('mem-bar');
const memory_percent = document.getElementById('mem-percent-val');
const memory_available = document.getElementById('mem-available-val');

const disk_percent = document.getElementById('disk-percent-val');
const disk_free = document.getElementById('disk-free-val');
const disk_total = document.getElementById('disk-total-val');
const disk_bar = document.getElementById('disk-bar');
const disk_used = document.getElementById('disk-used-val');

const power_val = document.getElementById('power-val');

const conn_status = document.getElementById('conn-status');
const last_updated = document.getElementById('last-updated');

const process_table = document.getElementById('process-table');

/** Base URL of the FastAPI backend */
url = "http://127.0.0.1:8003"

/* ------------------------------------------------------------------ */
/*  Utility helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Map a percentage value to a Tailwind background-colour class.
 *
 * @param {number} value - Metric percentage (0–100).
 * @returns {string} Tailwind CSS class name.
 */
function getColor(value) {
    if (value > 85) return 'bg-red-500';
    if (value > 60) return 'bg-amber-500';
    return 'bg-indigo-500';
}

/**
 * Swap the colour class on a progress-bar element to reflect its
 * current value. Removes all three possible colour classes first to
 * avoid stacking.
 *
 * @param {HTMLElement} element - The progress-bar ``<div>``.
 * @param {number}      data    - The current percentage value.
 */
function setColor(element, data) {
    element.classList.remove('bg-indigo-500', 'bg-amber-500', 'bg-red-500');
    const current_color = getColor(data);
    element.classList.add(current_color)
}

/* ------------------------------------------------------------------ */
/*  Core polling loop                                                  */
/* ------------------------------------------------------------------ */

/**
 * Fetch the latest ``/stats`` payload from the API and paint every
 * dashboard widget.
 *
 * On success the connection badge turns green ("Online") and a
 * timestamp is shown.  On failure it turns red ("Offline") and the
 * error is logged to the browser console.
 */
async function updateStats() {
    try {
        const response = await fetch(`${url}/stats`)
        const data = await response.json();
        const date = new Date();

        cpu.textContent = `${data.cpu}%`
        cpu_bar.style.width = `${data.cpu}%`
        setColor(cpu_bar, data.cpu)

        memory_used.textContent = `${data.memory_used.toFixed(1)}`
        memory_total.textContent = `${data.memory_total.toFixed(1)}`
        memory_percent.textContent = `${data.memory_percent}%`
        memory_bar.style.width = `${data.memory_percent}%`
        setColor(memory_bar, data.memory_percent)

        disk_free.textContent = `${data.disk_free.toFixed(1)}`
        disk_total.textContent = `${data.disk_total.toFixed(1)}`
        disk_percent.textContent = `${data.disk_percent}%`
        disk_bar.style.width = `${data.disk_percent}%`
        setColor(disk_bar, data.disk_percent)

        power_val.textContent = `${data.power_watts.toFixed(2)}W`

        conn_status.textContent = "Online"
        conn_status.style.color = "green"
        last_updated.textContent = `Last updated: ${date.getHours()}:${date.getMinutes()}`

        process_table.innerHTML = '';
        const rows = data.top_processes.map(proc => `
            <tr class="border-b border-gray-700 hover:bg-gray-700 transition-colors">
                <td class="py-2">${proc.pid}</td>
                <td class="py-2">${proc.name}</td>
                <td class="py-2 text-right">${proc.cpu_percent}%</td>
                <td class="py-2 text-right">${proc.memory_mb.toFixed(1)} MB</td>
            </tr>
        `).join('');
        process_table.innerHTML = rows;

    } catch (error) {
        console.error("Error fetching records:", error);
        conn_status.textContent = "Offline"
        conn_status.style.color = "red"
    }
}

/* Kick off the first fetch immediately, then repeat every 6 seconds */
updateStats()
setInterval(updateStats, 6000);
