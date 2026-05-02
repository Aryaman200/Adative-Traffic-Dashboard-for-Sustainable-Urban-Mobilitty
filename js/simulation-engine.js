/**
 * SAARTHI — Traffic Monitor (TomTom Flow + Incidents API)
 * Polls real-time traffic data for corridors and incidents
 */
window.TrafficSystem = window.TrafficSystem || {};

TrafficSystem.TrafficMonitor = (() => {
    'use strict';

    let corridorStatus = {};
    let history = {};
    let liveIncidents = [];
    let pollTimer = null;
    let listeners = [];

    function init() {
        TrafficSystem.Data.CORRIDORS.forEach(c => {
            corridorStatus[c.id] = { congestion: 0, currentSpeed: 0, freeFlowSpeed: 0, lastUpdate: null };
            history[c.id] = [];
        });
    }

    // ── Poll TomTom Traffic Flow for each corridor ────────────────
    async function pollCorridors() {
        const { Config, Data } = TrafficSystem;
        const key = Config.TOMTOM.API_KEY;
        if (!key) return;

        for (const corridor of Data.CORRIDORS) {
            try {
                const url = `${Config.TOMTOM.BASE}${Config.TOMTOM.TRAFFIC_FLOW}json?point=${corridor.lat},${corridor.lng}&unit=KMPH&key=${key}`;
                const resp = await fetch(url);
                if (!resp.ok) continue;
                const data = await resp.json();
                const flow = data.flowSegmentData;
                if (!flow) continue;

                const currentSpeed = flow.currentSpeed;
                const freeFlowSpeed = flow.freeFlowSpeed;
                const congestion = freeFlowSpeed > 0 ? Math.max(0, Math.min(1, 1 - currentSpeed / freeFlowSpeed)) : 0;

                corridorStatus[corridor.id] = {
                    congestion,
                    currentSpeed: Math.round(currentSpeed),
                    freeFlowSpeed: Math.round(freeFlowSpeed),
                    confidence: flow.confidence || 0,
                    roadClosure: flow.roadClosure || false,
                    lastUpdate: new Date()
                };

                history[corridor.id] = history[corridor.id] || [];
                history[corridor.id].push({ time: new Date(), congestion, speed: currentSpeed });
                if (history[corridor.id].length > Config.MONITORING.HISTORY_LENGTH) {
                    history[corridor.id] = history[corridor.id].slice(-Config.MONITORING.HISTORY_LENGTH);
                }

                // Feed into signal control
                updateSignalsFromTraffic(corridor, congestion);

            } catch (e) { console.warn('Flow poll error:', corridor.name, e.message); }
        }

        emit('corridors', getCorridorStatus());
    }

    // ── Poll TomTom Incidents API ─────────────────────────────────
    async function pollIncidents() {
        const { Config } = TrafficSystem;
        const key = Config.TOMTOM.API_KEY;
        if (!key) return;

        try {
            // Delhi-NCR bounding box
            const bbox = '76.85,28.40,77.45,28.85';
            const url = `${Config.TOMTOM.BASE}${Config.TOMTOM.TRAFFIC_INCIDENTS}?key=${key}&bbox=${bbox}&fields={incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code},startTime,endTime,from,to,length,delay,roadNumbers}}}`;

            const resp = await fetch(url);
            if (!resp.ok) return;
            const data = await resp.json();

            liveIncidents = [];
            if (data.incidents) {
                data.incidents.forEach(inc => {
                    const props = inc.properties || {};
                    const coords = inc.geometry?.coordinates;
                    if (!coords) return;

                    // Get point (first coordinate for point, midpoint for line)
                    let lat, lng;
                    if (inc.geometry.type === 'Point') {
                        [lng, lat] = coords;
                    } else if (coords.length > 0) {
                        const mid = coords[Math.floor(coords.length / 2)];
                        [lng, lat] = Array.isArray(mid[0]) ? mid[0] : mid;
                    }

                    const typeMap = { 1: 'ACC', 2: 'FLD', 3: 'HAZ', 4: 'WRK', 5: 'CLO', 6: 'SLO', 7: 'SVC', 8: 'POL', 9: 'WX', 14: 'WRK' };
                    const icon = typeMap[props.iconCategory] || 'INC';
                    const events = (props.events || []).map(e => e.description).join('; ');

                    liveIncidents.push({
                        id: props.id,
                        lat, lng,
                        icon,
                        description: events || 'Traffic Incident',
                        delay: props.delay || 0,
                        magnitude: props.magnitudeOfDelay,
                        roadName: (props.roadNumbers || []).join(', ') || props.from || '',
                        from: props.from,
                        to: props.to,
                        length: props.length
                    });
                });
            }

            emit('incidents', liveIncidents);
        } catch (e) { console.warn('Incidents poll error:', e.message); }
    }

    // ── Feed traffic into signal control ──────────────────────────
    function updateSignalsFromTraffic(corridor, congestion) {
        const { Data } = TrafficSystem;
        // Find intersections near this corridor and update their demand
        Data.INTERSECTIONS.forEach(intx => {
            const dist = Math.abs(intx.lat - corridor.lat) + Math.abs(intx.lng - corridor.lng);
            if (dist < 0.03) { // ~3 km proximity
                const flowRate = 5 + congestion * 25; // vehicles/min estimate
                Object.keys(intx.approaches).forEach((aId, idx) => {
                    const variation = 0.6 + Math.random() * 0.8;
                    TrafficSystem.SignalControl.setApproachDemand(intx.id, intx.approaches[idx]?.id || aId, flowRate * variation);
                });
            }
        });
    }

    // ── Start monitoring ──────────────────────────────────────────
    function startMonitoring() {
        pollCorridors();
        pollIncidents();
        pollTimer = setInterval(() => {
            pollCorridors();
            pollIncidents();
        }, TrafficSystem.Config.MONITORING.POLL_INTERVAL);
    }

    function stopMonitoring() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
    }

    function getNetworkSummary() {
        const s = Object.values(corridorStatus).filter(c => c.lastUpdate);
        if (s.length === 0) return { avg: 0, max: 0, critical: 0, monitored: 0, status: 'LOADING' };
        const avg = s.reduce((sum, c) => sum + c.congestion, 0) / s.length;
        return {
            avg: Math.round(avg * 100), max: Math.round(Math.max(...s.map(c => c.congestion)) * 100),
            critical: s.filter(c => c.congestion > 0.7).length, monitored: s.length,
            avgSpeed: Math.round(s.reduce((sum, c) => sum + c.currentSpeed, 0) / s.length),
            status: avg > 0.7 ? 'CRITICAL' : avg > 0.5 ? 'STRESSED' : avg > 0.3 ? 'MODERATE' : 'SMOOTH'
        };
    }

    function getCorridorStatus() {
        return Object.entries(corridorStatus).map(([id, s]) => ({ id, ...s, corridor: TrafficSystem.Data.getCorridorById(id) }));
    }

    function getHistory(id) { return history[id] || []; }
    function getIncidents() { return liveIncidents; }

    function on(event, cb) { listeners.push({ event, cb }); }
    function emit(event, data) { listeners.filter(l => l.event === event).forEach(l => l.cb(data)); }

    return { init, startMonitoring, stopMonitoring, pollCorridors, pollIncidents, getNetworkSummary, getCorridorStatus, getHistory, getIncidents, on };
})();
