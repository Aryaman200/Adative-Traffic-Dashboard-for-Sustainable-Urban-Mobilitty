/**
 * SAARTHI — Map Engine (Leaflet + TomTom Traffic Tiles)
 * Real-time traffic on ALL roads via TomTom free-tier tiles
 */
window.TrafficSystem = window.TrafficSystem || {};

TrafficSystem.MapEngine = (() => {
    'use strict';

    let map = null;
    let trafficFlowLayer = null;
    let trafficIncidentLayer = null;
    let routePolylines = [];
    let signalMarkers = {};
    let incidentMarkers = [];
    let corridorPolylines = [];

    function init(containerId) {
        const { Config } = TrafficSystem;
        const key = Config.TOMTOM.API_KEY;

        map = L.map(containerId, {
            center: Config.MAP.CENTER,
            zoom: Config.MAP.ZOOM,
            minZoom: Config.MAP.MIN_ZOOM,
            maxZoom: Config.MAP.MAX_ZOOM,
            zoomControl: false
        });

        L.control.zoom({ position: 'topright' }).addTo(map);

        // Base tiles (CartoDB Voyager)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OSM &copy; CARTO | Traffic: TomTom | SAARTHI',
            maxZoom: 19
        }).addTo(map);

        // TomTom Real-Time Traffic Flow Tiles (shows ALL roads)
        if (key) {
            trafficFlowLayer = L.tileLayer(
                Config.TOMTOM.BASE + Config.TOMTOM.FLOW_TILES + '?key=' + key + '&tileSize=256',
                { opacity: 0.75, zIndex: 400, maxZoom: 18 }
            ).addTo(map);

            // TomTom Traffic Incidents Tiles
            trafficIncidentLayer = L.tileLayer(
                Config.TOMTOM.BASE + Config.TOMTOM.INCIDENT_TILES + '?key=' + key + '&tileSize=256',
                { opacity: 0.85, zIndex: 500, maxZoom: 18 }
            );
        }

        // Draw signal markers
        drawSignalMarkers();

        // Draw camera markers
        drawCameraMarkers();

        return map;
    }

    // ── Traffic Signal Markers ─────────────────────────────────────
    function drawSignalMarkers() {
        const { Data } = TrafficSystem;
        Data.INTERSECTIONS.forEach(intx => {
            const el = document.createElement('div');
            el.className = 'signal-marker';
            el.id = 'signal-marker-' + intx.id;
            el.innerHTML = `
                <div class="signal-light red active" id="light-${intx.id}-red"></div>
                <div class="signal-light yellow" id="light-${intx.id}-yellow"></div>
                <div class="signal-light green" id="light-${intx.id}-green"></div>
            `;

            const icon = L.divIcon({
                html: el.outerHTML,
                className: 'signal-icon-wrapper',
                iconSize: [24, 56],
                iconAnchor: [12, 56]
            });

            const marker = L.marker([intx.lat, intx.lng], { icon, zIndexOffset: 2000 }).addTo(map);
            marker.bindTooltip(`<strong>${intx.name}</strong><br>Adaptive Signal Control`, {
                className: 'signal-tooltip'
            });
            marker.on('click', () => {
                if (TrafficSystem.Dashboard) TrafficSystem.Dashboard.selectIntersection(intx.id);
            });

            signalMarkers[intx.id] = marker;
        });
    }

    function drawCameraMarkers() {
        const { Data } = TrafficSystem;
        Data.CAMERAS.forEach(cam => {
            const icon = L.divIcon({
                html: `<div style="font-size:11px;font-weight:700;color:#d97706;background:#292524;padding:2px 4px;border-radius:3px;">CAM</div>`,
                className: 'camera-icon', iconSize: [20, 20], iconAnchor: [10, 10]
            });
            L.marker([cam.lat, cam.lng], { icon, zIndexOffset: 1500 })
                .addTo(map)
                .bindTooltip(`<strong>${cam.name}</strong>`, { className: 'signal-tooltip' })
                .on('click', () => { if (TrafficSystem.Dashboard) TrafficSystem.Dashboard.switchCamera(cam.id); });
        });
    }

    // ── Update signal light states on map ──────────────────────────
    function updateSignalStates(signalStates) {
        signalStates.forEach(s => {
            const redEl = document.getElementById(`light-${s.id}-red`);
            const yellowEl = document.getElementById(`light-${s.id}-yellow`);
            const greenEl = document.getElementById(`light-${s.id}-green`);
            if (!redEl) return;

            redEl.classList.toggle('active', s.state === 'ALL_RED' || s.state === 'RED');
            yellowEl.classList.toggle('active', s.state === 'YELLOW');
            greenEl.classList.toggle('active', s.state === 'GREEN');
        });
    }

    // ── Layer toggles ─────────────────────────────────────────────
    function toggleTrafficFlow(show) {
        if (trafficFlowLayer) { show ? trafficFlowLayer.addTo(map) : map.removeLayer(trafficFlowLayer); }
    }
    function toggleIncidents(show) {
        if (trafficIncidentLayer) { show ? trafficIncidentLayer.addTo(map) : map.removeLayer(trafficIncidentLayer); }
    }

    // ── Show route polyline ───────────────────────────────────────
    function showRoute(points, color = '#6366f1', weight = 5) {
        const polyline = L.polyline(points, { color, weight, opacity: 0.9 }).addTo(map);
        routePolylines.push(polyline);
        map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
        return polyline;
    }

    function clearRoutes() {
        routePolylines.forEach(p => map.removeLayer(p));
        routePolylines = [];
    }

    // ── Incident markers from API data ────────────────────────────
    function showIncidents(incidents) {
        clearIncidentMarkers();
        incidents.forEach(inc => {
            const icon = L.divIcon({
                html: `<div style="font-size:10px;font-weight:700;color:#fff;background:#b91c1c;padding:2px 4px;border-radius:3px;">${inc.icon || 'INC'}</div>`,
                className: 'incident-icon', iconSize: [24, 24], iconAnchor: [12, 12]
            });
            const marker = L.marker([inc.lat, inc.lng], { icon, zIndexOffset: 3000 }).addTo(map);
            marker.bindPopup(`<div style="font-family:Inter,sans-serif;"><strong>${inc.icon} ${inc.description}</strong><br>
                Delay: ${inc.delay || '--'}s | Road: ${inc.roadName || '--'}</div>`);
            incidentMarkers.push(marker);
        });
    }

    function clearIncidentMarkers() {
        incidentMarkers.forEach(m => map.removeLayer(m));
        incidentMarkers = [];
    }

    // ── Corridor overlay ──────────────────────────────────────────
    function showCorridorStatus(corridorData) {
        clearCorridors();
        const { Data } = TrafficSystem;
        corridorData.forEach(cd => {
            const corridor = Data.getCorridorById(cd.id);
            if (!corridor) return;
            const from = Data.getLocationById(corridor.from);
            const to = Data.getLocationById(corridor.to);
            if (!from || !to) return;

            const color = cd.congestion > 0.7 ? '#ef4444' : cd.congestion > 0.4 ? '#f97316' :
                          cd.congestion > 0.2 ? '#eab308' : '#22c55e';
            const line = L.polyline([[from.lat, from.lng], [to.lat, to.lng]], {
                color, weight: 5, opacity: 0.8
            }).addTo(map);
            line.bindTooltip(`${corridor.name}: ${Math.round(cd.congestion * 100)}%`);
            corridorPolylines.push(line);
        });
    }

    function clearCorridors() {
        corridorPolylines.forEach(p => map.removeLayer(p));
        corridorPolylines = [];
    }

    function getMap() { return map; }

    return {
        init, updateSignalStates, toggleTrafficFlow, toggleIncidents,
        showRoute, clearRoutes, showIncidents, clearIncidentMarkers,
        showCorridorStatus, clearCorridors, getMap
    };
})();
