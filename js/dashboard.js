/**
 * SAARTHI -- Dashboard (ML-Integrated, Multi-Dashboard)
 */
window.TrafficSystem = window.TrafficSystem || {};

TrafficSystem.Dashboard = (() => {
    'use strict';

    let currentRoutes = [];
    let selectedIntersection = null;
    let originLocation = null, destLocation = null;
    let searchDebounce = null;
    let activeDashboard = 'traffic';

    function init() {
        bindControls();
        populateCameras();
        startUIUpdates();
        switchCamera('CAM1');
        checkMLBackend();
    }

    async function checkMLBackend() {
        const available = await TrafficSystem.MLClient.isAvailable();
        const el = document.getElementById('ml-status');
        if (el) {
            el.textContent = available ? 'AI ACTIVE' : 'AI OFFLINE';
            el.className = 'status-badge ' + (available ? 'status-smooth' : 'status-critical');
        }
        if (available) showNotification('ML backend connected - AI signal optimization active', 'success');
    }

    function bindControls() {
        document.getElementById('btn-find-route')?.addEventListener('click', findRoute);
        document.getElementById('btn-clear-route')?.addEventListener('click', () => {
            TrafficSystem.MapEngine.clearRoutes();
            document.getElementById('route-results').innerHTML = '';
        });

        setupSearchInput('route-origin-input', 'origin-suggestions', (loc) => { originLocation = loc; });
        setupSearchInput('route-dest-input', 'dest-suggestions', (loc) => { destLocation = loc; });

        document.getElementById('toggle-traffic')?.addEventListener('change', e => TrafficSystem.MapEngine.toggleTrafficFlow(e.target.checked));
        document.getElementById('toggle-incidents')?.addEventListener('change', e => TrafficSystem.MapEngine.toggleIncidents(e.target.checked));
        document.getElementById('toggle-corridors')?.addEventListener('change', e => {
            if (e.target.checked) updateCorridorOverlay();
            else TrafficSystem.MapEngine.clearCorridors();
        });

        document.getElementById('btn-refresh')?.addEventListener('click', () => {
            TrafficSystem.TrafficMonitor.pollCorridors();
            TrafficSystem.TrafficMonitor.pollIncidents();
            showNotification('Refreshing live data...', 'info');
        });

        document.getElementById('camera-select')?.addEventListener('change', e => switchCamera(e.target.value));

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tg = btn.closest('.tab-group');
                tg.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const container = btn.closest('.panel') || btn.closest('.right-panel') || btn.closest('.sidebar');
                if (container) container.querySelectorAll('.tab-content').forEach(tc => tc.classList.toggle('active', tc.id === btn.dataset.tab));
            });
        });

        document.querySelectorAll('.dash-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.dash-nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeDashboard = btn.dataset.dash;
                document.querySelectorAll('.dashboard-page').forEach(p => p.classList.toggle('active', p.id === 'dash-' + btn.dataset.dash));
            });
        });

        const intxSel = document.getElementById('intersection-select');
        TrafficSystem.Data.INTERSECTIONS.forEach(i => intxSel?.appendChild(new Option(i.name, i.id)));
        intxSel?.addEventListener('change', e => selectIntersection(e.target.value));

        document.getElementById('btn-ml-predict')?.addEventListener('click', runMLPrediction);
    }

    function setupSearchInput(inputId, suggestionsId, onSelect) {
        const input = document.getElementById(inputId);
        const suggestions = document.getElementById(suggestionsId);
        if (!input || !suggestions) return;

        input.addEventListener('input', () => {
            clearTimeout(searchDebounce);
            const q = input.value.trim();
            if (q.length < 3) { suggestions.innerHTML = ''; suggestions.style.display = 'none'; return; }
            searchDebounce = setTimeout(async () => {
                try {
                    const results = await TrafficSystem.RoutingEngine.searchLocation(q);
                    suggestions.innerHTML = results.map(r => `
                        <div class="suggestion-item" data-lat="${r.lat}" data-lng="${r.lng}" data-name="${r.name}">
                            <span class="suggestion-name">${r.name}</span>
                        </div>
                    `).join('');
                    suggestions.style.display = results.length ? 'block' : 'none';
                    suggestions.querySelectorAll('.suggestion-item').forEach(item => {
                        item.addEventListener('click', () => {
                            const loc = { name: item.dataset.name, lat: parseFloat(item.dataset.lat), lng: parseFloat(item.dataset.lng) };
                            input.value = loc.name;
                            onSelect(loc);
                            suggestions.style.display = 'none';
                        });
                    });
                } catch (e) { suggestions.style.display = 'none'; }
            }, 400);
        });
        input.addEventListener('blur', () => setTimeout(() => { suggestions.style.display = 'none'; }, 200));
    }

    function populateCameras() {
        const sel = document.getElementById('camera-select');
        TrafficSystem.Data.CAMERAS.forEach(c => sel?.appendChild(new Option(c.name, c.id)));
    }

    async function findRoute() {
        if (!originLocation || !destLocation) { showNotification('Type and select both origin and destination', 'warning'); return; }
        showNotification('Finding routes with live traffic...', 'info');
        try {
            const routes = await TrafficSystem.RoutingEngine.findRoutes(originLocation.lat, originLocation.lng, destLocation.lat, destLocation.lng);
            currentRoutes = routes;
            TrafficSystem.MapEngine.clearRoutes();
            const colors = ['#e07020', '#1a1a1a', '#b08050'];
            routes.forEach((r, i) => TrafficSystem.MapEngine.showRoute(r.points, colors[i], i === 0 ? 6 : 4));
            renderRouteResults(routes);
            if (routes[0]) {
                const mlResult = await TrafficSystem.MLClient.predictTravelTime({ distance: routes[0].distance.km, speed: routes[0].distance.km / (routes[0].duration.min / 60), startArea: originLocation.name, endArea: destLocation.name });
                if (mlResult.success) showNotification('AI Prediction: ' + mlResult.predicted_travel_time_minutes + ' min (API: ' + routes[0].duration.min + ' min)', 'info');
            }
            showNotification('Found ' + routes.length + ' route(s)', 'success');
        } catch (err) { showNotification('Route error: ' + err.message, 'error'); }
    }

    function renderRouteResults(routes) {
        const el = document.getElementById('route-results');
        if (!el) return;
        el.innerHTML = routes.map((r, i) => `
            <div class="route-card">
                <div class="route-header">
                    <span class="route-label">${r.label}</span>
                    <span class="eco-badge">ECO ${r.ecoScore}</span>
                </div>
                <div class="route-stats">
                    <div class="stat-item">${r.distance.text}</div>
                    <div class="stat-item">${r.duration.text}</div>
                    <div class="stat-item">${r.trafficDelay.text}</div>
                    <div class="stat-item">${r.fuel.litres} L / Rs.${r.fuel.costINR}</div>
                    <div class="stat-item">${r.co2} kg CO2</div>
                    <div class="stat-item" style="color:${r.congestion > 50 ? 'var(--danger)' : 'var(--success)'}">${r.congestion}% congestion</div>
                </div>
            </div>
        `).join('');
    }

    async function runMLPrediction() {
        const speed = parseFloat(document.getElementById('pred-speed')?.value || 30);
        const distance = parseFloat(document.getElementById('pred-distance')?.value || 10);
        const weather = document.getElementById('pred-weather')?.value || 'Clear';
        const density = document.getElementById('pred-density')?.value || 'Medium';

        const [ttResult, congResult, sigResult] = await Promise.all([
            TrafficSystem.MLClient.predictTravelTime({ speed, distance, weather, density }),
            TrafficSystem.MLClient.predictCongestion({ speed, distance, weather }),
            TrafficSystem.MLClient.predictSignal({ speed, distance, weather, density })
        ]);

        const c = document.getElementById('ml-results');
        if (!c) return;

        c.innerHTML = `
            <div class="ml-result-card">
                <div class="ml-result-title">Travel Time Prediction</div>
                <div class="ml-result-value">${ttResult.success ? ttResult.predicted_travel_time_minutes + ' min' : 'Error'}</div>
            </div>
            <div class="ml-result-card">
                <div class="ml-result-title">Congestion Level</div>
                <div class="ml-result-value" style="color:${congResult.predicted_level === 'High' || congResult.predicted_level === 'Very High' ? 'var(--danger)' : 'var(--success)'}">
                    ${congResult.success ? congResult.predicted_level : 'Error'}
                </div>
                ${congResult.success ? '<div class="ml-probs">' + Object.entries(congResult.probabilities || {}).map(([k, v]) => '<span>' + k + ': ' + Math.round(v * 100) + '%</span>').join(' ') + '</div>' : ''}
            </div>
            <div class="ml-result-card">
                <div class="ml-result-title">Optimal Signal Timing</div>
                ${sigResult.success ? `
                    <div class="ml-result-value">Cycle: ${sigResult.optimal_cycle_seconds}s | Green: ${sigResult.optimal_main_green_seconds}s</div>
                    <div class="ml-probs">Demand: ${sigResult.demand_ratio} | ${sigResult.recommendation}</div>
                    <div class="signal-phases-preview">
                        ${(sigResult.phases || []).map(p => '<div class="phase-bar"><span class="phase-label">' + p.phase + '</span><div class="phase-green" style="width:' + p.green + 'px">' + p.green + 's</div></div>').join('')}
                    </div>
                ` : '<div class="ml-result-value">Error</div>'}
            </div>
        `;
    }

    function selectIntersection(id) {
        selectedIntersection = id;
        const intx = TrafficSystem.Data.getIntersectionById(id);
        if (intx) TrafficSystem.MapEngine.getMap()?.setView([intx.lat, intx.lng], 16);
    }

    function switchCamera(id) {
        TrafficSystem.CameraFeed.setActiveCamera(id);
        const cam = TrafficSystem.Data.CAMERAS.find(c => c.id === id);
        if (cam) document.getElementById('camera-label').textContent = cam.name;
    }

    function startUIUpdates() {
        setInterval(updateUI, 3000);
        requestAnimationFrame(function loop() { TrafficSystem.CameraFeed.renderAll(); requestAnimationFrame(loop); });
    }

    function updateUI() {
        const now = new Date();
        const el = id => document.getElementById(id);

        if (el('live-time')) el('live-time').textContent = now.toLocaleTimeString('en-IN', { hour12: true });
        if (el('live-date')) el('live-date').textContent = now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

        const summary = TrafficSystem.TrafficMonitor.getNetworkSummary();
        if (el('network-status')) { el('network-status').textContent = summary.status; el('network-status').className = 'status-badge status-' + summary.status.toLowerCase(); }
        if (el('avg-congestion')) { el('avg-congestion').textContent = summary.avg + '%'; el('avg-congestion').style.color = summary.avg > 60 ? 'var(--danger)' : summary.avg > 30 ? 'var(--warning)' : 'var(--success)'; }
        if (el('avg-speed')) el('avg-speed').textContent = (summary.avgSpeed || '--') + ' km/h';
        if (el('monitored-count')) el('monitored-count').textContent = summary.monitored;
        if (el('incident-count')) el('incident-count').textContent = TrafficSystem.TrafficMonitor.getIncidents().length;

        updateCorridorList();
        updateSignalPanel();
        updateSignalDashboard(); // <-- FIX: also populate the signals dashboard page
        updateIncidentList();

        if (document.getElementById('toggle-corridors')?.checked) updateCorridorOverlay();
        TrafficSystem.MapEngine.updateSignalStates(TrafficSystem.SignalControl.getState());
        TrafficSystem.MapEngine.showIncidents(TrafficSystem.TrafficMonitor.getIncidents());
    }

    function updateCorridorList() {
        const c = document.getElementById('corridor-list');
        if (!c) return;
        const statuses = TrafficSystem.TrafficMonitor.getCorridorStatus();
        c.innerHTML = statuses.filter(s => s.corridor).sort((a, b) => (b.congestion || 0) - (a.congestion || 0)).map(s => {
            const pct = Math.round((s.congestion || 0) * 100);
            const color = pct > 70 ? 'var(--danger)' : pct > 40 ? 'var(--warning)' : 'var(--success)';
            return '<div class="corridor-item"><div class="corridor-info"><div class="corridor-name">' + s.corridor.name + '</div>' +
                '<div class="corridor-time">' + (s.currentSpeed || '--') + ' km/h <small>(free: ' + (s.freeFlowSpeed || '--') + ')</small></div></div>' +
                '<div class="corridor-bar"><div class="corridor-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
                '<span class="corridor-pct" style="color:' + color + '">' + pct + '%</span></div>';
        }).join('') || '<div class="empty-state">Loading...</div>';
    }

    function updateCorridorOverlay() { TrafficSystem.MapEngine.showCorridorStatus(TrafficSystem.TrafficMonitor.getCorridorStatus()); }

    // Sidebar signal list
    function updateSignalPanel() {
        const c = document.getElementById('signal-list');
        if (!c) return;
        const states = TrafficSystem.SignalControl.getState();
        const filtered = selectedIntersection ? states.filter(s => s.id === selectedIntersection) : states;
        c.innerHTML = filtered.map(s => renderSignalCard(s, false)).join('');
    }

    // Full signal dashboard page (FIX)
    function updateSignalDashboard() {
        const grid = document.getElementById('signal-dashboard-grid');
        if (!grid) return;
        const states = TrafficSystem.SignalControl.getState();
        grid.innerHTML = states.map(s => renderSignalCard(s, true)).join('');
    }

    // Shared signal card renderer
    function renderSignalCard(s, large) {
        const stateColor = s.state === 'GREEN' ? 'var(--success)' : s.state === 'YELLOW' ? 'var(--warning)' : 'var(--danger)';
        const mlTag = s.mlPrediction ? '<span class="ml-tag">AI</span>' : '';
        return '<div class="signal-card' + (large ? ' signal-card-lg' : '') + '">' +
            '<div class="signal-header"><span class="signal-name">' + s.name + ' ' + mlTag + '</span><span class="signal-mode">' + s.mode + '</span></div>' +
            '<div class="signal-state" style="color:' + stateColor + '"><span class="signal-phase">' + s.phaseName + '</span><span class="signal-timer">' + s.stateTimer + 's</span></div>' +
            '<div class="signal-approaches">' + s.approaches.map(a =>
                '<div class="approach ' + (a.isGreen ? 'green' : 'red') + '"><span class="approach-dir">' + a.id + '</span><span class="approach-queue">Q:' + a.queueLength + '</span><span class="approach-flow">' + a.flowRate + 'v/m</span></div>'
            ).join('') + '</div>' +
            '<div class="signal-metrics"><span>Cycle: ' + s.cycleTime + 's</span><span>Score: <b style="color:' + (s.performanceScore > 60 ? 'var(--success)' : 'var(--warning)') + '">' + s.performanceScore + '</b></span><span>Delay: ' + s.totalDelay + 's</span></div>' +
            (large && s.mlPrediction ? '<div class="signal-ml-info">ML Cycle: ' + (s.mlPrediction.optimal_cycle_seconds || '--') + 's | Demand: ' + (s.mlPrediction.demand_ratio || '--') + '</div>' : '') +
        '</div>';
    }

    function updateIncidentList() {
        const c = document.getElementById('incident-list');
        if (!c) return;
        const incidents = TrafficSystem.TrafficMonitor.getIncidents();
        c.innerHTML = incidents.slice(0, 10).map(i =>
            '<div class="incident-item"><span class="incident-icon">' + (i.icon || '*') + '</span>' +
            '<div class="incident-info"><div class="incident-label">' + i.description + '</div>' +
            '<div class="incident-location">' + (i.roadName || i.from || '--') + '</div></div>' +
            '<span class="incident-time">' + (i.delay ? Math.round(i.delay / 60) + 'm' : '--') + '</span></div>'
        ).join('') || '<div class="empty-state">No incidents</div>';
    }

    function showNotification(msg, type) {
        type = type || 'info';
        const c = document.getElementById('notifications');
        if (!c) return;
        const el = document.createElement('div');
        el.className = 'notification notification-' + type;
        el.innerHTML = '<span>' + msg + '</span>';
        c.appendChild(el);
        setTimeout(() => el.classList.add('show'), 10);
        setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 4000);
    }

    return { init, selectIntersection, switchCamera, showNotification };
})();
