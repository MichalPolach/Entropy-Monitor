/**
 * Entropy Monitor — client-side polling, DOM updater, and chart renderer.
 *
 * On load, fetches runtime configuration from the backend's /config
 * endpoint (base URL + poll interval) so nothing is hard-coded here.
 * Then enters a polling loop that fetches /stats at the configured
 * interval and renders values into the dashboard cards, progress bars,
 * temperature readouts, rolling Chart.js line graphs, and process table
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

const cpu_temp = document.getElementById('cpu-temp-val');
const nvme_temp = document.getElementById('nvme-temp-val');

const process_table_cpu = document.getElementById('process-table-cpu');
const process_table_mem = document.getElementById('process-table-mem');

/* ------------------------------------------------------------------ */
/*  Chart.js instances — rolling line graphs (last 20 data points)     */
/* ------------------------------------------------------------------ */

const cpu_chart_canvas = document.getElementById('cpu-chart');
const memory_chart_canvas = document.getElementById('memory-chart');
const power_chart_canvas = document.getElementById('power-chart');

/**
 * Shared Chart.js options tuned for the dark slate dashboard theme.
 * Tooltip styled to match slate-800 card backgrounds.
 */
const darkTooltip = {
    backgroundColor: 'rgb(30, 41, 59)',
    titleColor: 'rgb(226, 232, 240)',
    bodyColor: 'rgb(148, 163, 184)',
    borderColor: 'rgb(51, 65, 85)',
    borderWidth: 1
};

function chartOptions(yMax) {
    return {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                min: 0,
                max: yMax,
                ticks: { color: 'rgb(148, 163, 184)' },
                grid: { color: 'rgba(51, 65, 85, 0.5)' },
                border: { display: false }
            },
            x: { display: false }
        },
        plugins: {
            legend: { display: false },
            tooltip: darkTooltip
        }
    };
}

function chartDataset(label, borderColor, bgColor) {
    return {
        label: label,
        data: [],
        borderColor: borderColor,
        backgroundColor: bgColor,
        fill: 'origin',
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4
    };
}

/** CPU usage history — indigo accent, Y-axis 0–100 %. */
const cpu_chart = new Chart(cpu_chart_canvas, {
    type: 'line',
    data: {
        labels: [],
        datasets: [chartDataset('CPU Usage %', 'rgb(99, 102, 241)', 'rgba(99, 102, 241, 0.1)')]
    },
    options: chartOptions(100)
});

/** Memory usage history — emerald accent, Y-axis 0–100 %. */
const memory_chart = new Chart(memory_chart_canvas, {
    type: 'line',
    data: {
        labels: [],
        datasets: [chartDataset('Memory Usage %', 'rgb(16, 185, 129)', 'rgba(16, 185, 129, 0.1)')]
    },
    options: chartOptions(100)
});

/** Power draw history — amber accent, Y-axis 0–50 W. */
const power_chart = new Chart(power_chart_canvas, {
    type: 'line',
    data: {
        labels: [],
        datasets: [chartDataset('Power Usage W', 'rgb(245, 158, 11)', 'rgba(245, 158, 11, 0.1)')]
    },
    options: chartOptions(50)
});

/**
 * Bootstrap URL — the only hard-coded address in the frontend.
 * Points to the backend's /config endpoint which returns the actual
 * base URL and poll interval for all subsequent requests.
 */
const initial_url = "http://127.0.0.1:8000/config"

/** Mutable runtime configuration, overwritten by init() on startup. */
let config = {
    url: "",
    poll_interval: 6000
}

/**
 * Fetch runtime settings from the backend and start the polling loop.
 *
 * Retrieves the API base URL and poll interval from /config so the
 * rest of the client never relies on hard-coded values.  On failure
 * (e.g. backend unreachable) the error is logged and no polling starts.
 */
async function init() {
    try {
        const response = await fetch(initial_url);
        const server_config = await response.json();

        config.url = server_config.url;
        config.poll_interval = server_config.poll_interval;

        update_stats(config.url);
        setInterval(() => update_stats(config.url), config.poll_interval);
    } catch (e) {
        console.error("Failed to load config", e);
    }
}

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

/**
 * Append a data point to a Chart.js line graph and maintain a rolling
 * window of at most 20 entries.  Older points are shifted off the left
 * side so the chart always shows the most recent history.
 *
 * @param {Chart}  chart     - Chart.js instance to update.
 * @param {string} timeLabel - Timestamp label for the X-axis.
 * @param {number} chartData - Numeric value for the Y-axis.
 */
function addChartData(chart, timeLabel, chartData) {
    chart.data.labels.push(timeLabel);
    chart.data.datasets[0].data.push(chartData);

    if (chart.data.labels.length > 20) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }

    chart.update();
}

/* ------------------------------------------------------------------ */
/*  Core polling loop                                                  */
/* ------------------------------------------------------------------ */

/**
 * Fetch the latest /stats payload from the API and paint every
 * dashboard widget.
 *
 * On success the connection badge turns green ("Online") and a
 * human-readable timestamp is shown.  On failure it turns red
 * ("Offline") and the error is logged to the browser console.
 *
 * @param {string} url - Backend base URL (scheme + host + port).
 */
async function update_stats(url) {
    try {
        const response = await fetch(`${url}/stats`)
        const data = await response.json();
        const date = new Date();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        cpu.textContent = `${data.cpu}%`
        cpu_bar.style.width = `${data.cpu}%`
        setColor(cpu_bar, data.cpu)
        addChartData(cpu_chart, `${hours}:${minutes}`, data.cpu)

        memory_used.textContent = `${data.memory_used.toFixed(1)}`
        memory_available.textContent = `${data.memory_available.toFixed(1)}`
        memory_total.textContent = `${data.memory_total.toFixed(1)}`
        memory_percent.textContent = `${data.memory_percent}%`
        memory_bar.style.width = `${data.memory_percent}%`
        setColor(memory_bar, data.memory_percent)
        addChartData(memory_chart, `${hours}:${minutes}`, data.memory_percent)

        disk_used.textContent = `${data.disk_used.toFixed(1)}`
        disk_free.textContent = `${data.disk_free.toFixed(1)}`
        disk_total.textContent = `${data.disk_total.toFixed(1)}`
        disk_percent.textContent = `${data.disk_percent}%`
        disk_bar.style.width = `${data.disk_percent}%`
        setColor(disk_bar, data.disk_percent)

        power_val.textContent = `${data.power_watts.toFixed(2)}W`
        addChartData(power_chart, `${hours}:${minutes}`, data.power_watts)

        conn_status.textContent = "Online"
        conn_status.style.color = "green"
        last_updated.textContent = `Last updated: ${hours}:${minutes}`

        cpu_temp.textContent = `${data.cpu_temp}`
        nvme_temp.textContent = `${data.nvme_temp}`

        process_table_cpu.innerHTML = '';
        const rows_cpu = data.top_processes_cpu.map(proc => `
            <tr class="border-b border-slate-800 hover:bg-slate-800 transition-colors">
                <td class="py-2">${proc.pid}</td>
                <td class="py-2">${proc.name}</td>
                <td class="py-2 text-right">${proc.cpu_percent}%</td>
                <td class="py-2 text-right">${proc.memory_mb.toFixed(1)} MB</td>
            </tr>
        `).join('');
        process_table_cpu.innerHTML = rows_cpu;

        process_table_mem.innerHTML = '';
        const rows_mem = data.top_processes_mem.map(proc => `
            <tr class="border-b border-slate-800 hover:bg-slate-800 transition-colors">
                <td class="py-2">${proc.pid}</td>
                <td class="py-2">${proc.name}</td>
                <td class="py-2 text-right">${proc.cpu_percent}%</td>
                <td class="py-2 text-right">${proc.memory_mb.toFixed(1)} MB</td>
            </tr>
        `).join('');
        process_table_mem.innerHTML = rows_mem;

    } catch (error) {
        console.error("Error fetching records:", error);
        conn_status.textContent = "Offline"
        conn_status.style.color = "red"
    }
}

/* Bootstrap: fetch config, then enter the polling loop. */
init();
