/**
 * SAARTHI — Adaptive Signal Control (ML-Enhanced)
 * Uses Python ML backend for optimal cycle/green predictions
 * Falls back to Webster's method if backend is unavailable
 */
window.TrafficSystem = window.TrafficSystem || {};

TrafficSystem.SignalControl = (() => {
    'use strict';

    let intersections = {};
    let updateTimer = null;
    let listeners = [];
    let tickCount = 0;
    let mlAvailable = false;

    function init() {
        const { Data, Config } = TrafficSystem;
        Data.INTERSECTIONS.forEach(intx => {
            const approaches = {};
            intx.approaches.forEach(a => {
                approaches[a.id] = {
                    ...a, queueLength: 0, flowRate: 0, demand: 0,
                    satFlow: Config.SIGNAL.SATURATION_FLOW * a.lanes,
                    waitTime: 0, served: 0
                };
            });
            intersections[intx.id] = {
                ...intx, approaches,
                currentPhase: 0, phaseTimer: 0, cycleTime: 90,
                greenSplits: intx.phases.map(() => 20),
                state: 'GREEN', stateTimer: 20,
                totalDelay: 0, throughput: 0,
                mode: 'ADAPTIVE', performanceScore: 80,
                mlPrediction: null
            };
        });

        // Check ML backend
        TrafficSystem.MLClient.isAvailable().then(ok => {
            mlAvailable = ok;
            console.log(mlAvailable ? '  [ML] Backend connected' : '  [ML] Backend offline, using Webster fallback');
        });
    }

    function start() {
        if (updateTimer) return;
        updateTimer = setInterval(tick, 1000);
    }

    function stop() { if (updateTimer) clearInterval(updateTimer); updateTimer = null; }

    function tick() {
        tickCount++;
        Object.values(intersections).forEach(intx => {
            intx.stateTimer--;
            if (intx.stateTimer <= 0) advancePhase(intx);
            updateQueues(intx);
            if (tickCount % 30 === 0 && intx.mode === 'ADAPTIVE') {
                if (mlAvailable) mlRecalculate(intx);
                else websterRecalculate(intx);
            }
            calcPerformance(intx);
        });
        emit('tick', getState());
    }

    function advancePhase(intx) {
        const { Config } = TrafficSystem;
        if (intx.state === 'GREEN') { intx.state = 'YELLOW'; intx.stateTimer = Config.SIGNAL.YELLOW_DURATION; }
        else if (intx.state === 'YELLOW') { intx.state = 'ALL_RED'; intx.stateTimer = Config.SIGNAL.ALL_RED; }
        else {
            intx.currentPhase = (intx.currentPhase + 1) % intx.phases.length;
            intx.state = 'GREEN';
            intx.stateTimer = intx.greenSplits[intx.currentPhase];
        }
    }

    function updateQueues(intx) {
        const phase = intx.phases[intx.currentPhase];
        if (!phase) return;
        Object.entries(intx.approaches).forEach(([id, a]) => {
            const isGreen = intx.state === 'GREEN' && phase.green.includes(id);
            if (isGreen) {
                a.queueLength = Math.max(0, a.queueLength - a.lanes * 0.5);
                a.served += a.lanes * 0.5;
                a.waitTime = Math.max(0, a.waitTime - 1);
            } else {
                a.queueLength += (a.flowRate / 60) * (0.5 + Math.random() * 0.5);
                a.waitTime += 1;
            }
            a.demand = a.queueLength * 1.0;
        });
    }

    // ── ML-based recalculation ────────────────────────────────────
    async function mlRecalculate(intx) {
        try {
            const avgSpeed = 30 + (1 - Math.min(1, Object.values(intx.approaches).reduce((s, a) => s + a.queueLength, 0) / 40)) * 30;
            const totalQueue = Object.values(intx.approaches).reduce((s, a) => s + a.queueLength, 0);
            const density = totalQueue > 30 ? 'Very High' : totalQueue > 20 ? 'High' : totalQueue > 10 ? 'Medium' : 'Low';

            const result = await TrafficSystem.MLClient.predictSignal({
                speed: avgSpeed, distance: 5, density,
                timeOfDay: TrafficSystem.MLClient.getTimeOfDay(),
                dayOfWeek: TrafficSystem.MLClient.getDayOfWeek(),
                weather: 'Clear', roadType: 'Main Road',
                queueLength: totalQueue, numPhases: intx.phases.length
            });

            if (result.success) {
                intx.mlPrediction = result;
                intx.cycleTime = Math.max(60, Math.min(180, result.optimal_cycle_seconds));
                const effectiveGreen = intx.cycleTime - intx.phases.length * 4;
                const mainGreen = result.optimal_main_green_seconds;

                intx.greenSplits = intx.phases.map((_, i) => {
                    if (i === 0) return Math.max(10, Math.min(90, mainGreen));
                    const remaining = effectiveGreen - mainGreen;
                    return Math.max(10, Math.round(remaining / (intx.phases.length - 1)));
                });
            }
        } catch (e) { websterRecalculate(intx); }
    }

    // ── Webster fallback ──────────────────────────────────────────
    function websterRecalculate(intx) {
        const { Config } = TrafficSystem;
        const n = intx.phases.length;
        const Y_values = intx.phases.map(p => {
            let max = 0;
            p.green.forEach(id => {
                const a = intx.approaches[id];
                if (a && a.satFlow > 0) max = Math.max(max, (a.flowRate * 60) / a.satFlow);
            });
            return Math.min(max, 0.9);
        });

        const totalY = Y_values.reduce((s, y) => s + y, 0);
        const L = n * Config.SIGNAL.LOST_TIME_PER_PHASE;
        const cycle = totalY >= 0.95 ? Config.SIGNAL.MAX_CYCLE : Math.round((1.5 * L + 5) / (1 - totalY));
        intx.cycleTime = Math.max(Config.SIGNAL.MIN_CYCLE, Math.min(Config.SIGNAL.MAX_CYCLE, cycle));

        const effGreen = intx.cycleTime - L;
        intx.greenSplits = Y_values.map(y => {
            const g = Math.round(effGreen * (totalY > 0 ? y / totalY : 1 / n));
            return Math.max(Config.SIGNAL.MIN_GREEN, Math.min(Config.SIGNAL.MAX_GREEN, g));
        });
    }

    function updateFromCamera(intxId, approachId, data) {
        const intx = intersections[intxId];
        if (!intx || !intx.approaches[approachId]) return;
        intx.approaches[approachId].queueLength = data.queueLength || 0;
        intx.approaches[approachId].flowRate = data.flowRate || 0;
    }

    function setApproachDemand(intxId, approachId, demand) {
        const intx = intersections[intxId];
        if (!intx) return;
        const a = intx.approaches[approachId];
        if (a) { a.flowRate = demand; a.queueLength = demand * 0.5; }
    }

    function calcPerformance(intx) {
        const apps = Object.values(intx.approaches);
        const totalQ = apps.reduce((s, a) => s + a.queueLength, 0);
        const avgW = apps.reduce((s, a) => s + a.waitTime, 0) / apps.length;
        intx.totalDelay = Math.round(avgW);
        intx.throughput = Math.round(apps.reduce((s, a) => s + a.served, 0));
        const maxQ = apps.reduce((s, a) => s + a.lanes * 20, 0);
        intx.performanceScore = Math.round(Math.max(0, Math.min(100, (1 - totalQ / Math.max(maxQ, 1)) * 100)));
    }

    function setMode(id, mode) { if (intersections[id]) intersections[id].mode = mode; }

    function getState() {
        return Object.entries(intersections).map(([id, intx]) => ({
            id, name: intx.name, lat: intx.lat, lng: intx.lng,
            currentPhase: intx.currentPhase,
            phaseName: intx.phases[intx.currentPhase]?.label || '--',
            greenApproaches: intx.phases[intx.currentPhase]?.green || [],
            state: intx.state, stateTimer: Math.max(0, Math.round(intx.stateTimer)),
            cycleTime: intx.cycleTime, greenSplits: intx.greenSplits,
            mode: intx.mode, performanceScore: intx.performanceScore,
            totalDelay: intx.totalDelay, throughput: intx.throughput,
            mlPrediction: intx.mlPrediction,
            approaches: Object.entries(intx.approaches).map(([aId, a]) => ({
                id: aId, label: a.label, lanes: a.lanes,
                queueLength: Math.round(a.queueLength), flowRate: Math.round(a.flowRate),
                waitTime: Math.round(a.waitTime),
                isGreen: intx.state === 'GREEN' && (intx.phases[intx.currentPhase]?.green || []).includes(aId)
            }))
        }));
    }

    function on(event, cb) { listeners.push({ event, cb }); }
    function emit(event, data) { listeners.filter(l => l.event === event).forEach(l => l.cb(data)); }

    return { init, start, stop, tick, getState, updateFromCamera, setApproachDemand, setMode, on };
})();
