/**
 * SAARTHI — Prediction Engine (Camera + Traffic Flow based)
 */
window.TrafficSystem = window.TrafficSystem || {};

TrafficSystem.PredictionEngine = (() => {
    'use strict';

    let predictions = {};

    // NHAI Delhi hourly congestion pattern baseline
    const HOURLY = [0.08,0.05,0.04,0.04,0.06,0.15,0.45,0.82,0.95,0.88,0.65,0.55,0.50,0.48,0.52,0.58,0.72,0.90,1.00,0.85,0.60,0.40,0.25,0.12];

    function init() {}

    function predict() {
        const { Data } = TrafficSystem;
        const now = new Date();
        const hr = now.getHours();

        Data.CORRIDORS.forEach(c => {
            const hist = TrafficSystem.TrafficMonitor.getHistory(c.id);
            const status = TrafficSystem.TrafficMonitor.getCorridorStatus().find(s => s.id === c.id);
            const current = status ? (status.congestion || 0) : 0;

            const steps = [];
            for (let s = 1; s <= 6; s++) {
                const fMin = s * 5;
                const fHr = (hr + Math.floor((now.getMinutes() + fMin) / 60)) % 24;
                const trendRatio = HOURLY[hr] > 0 ? HOURLY[fHr] / HOURLY[hr] : 1;

                let momentum = 0;
                if (hist.length >= 2) {
                    const r = hist.slice(-3);
                    for (let i = 1; i < r.length; i++) momentum += r[i].congestion - r[i - 1].congestion;
                    momentum /= r.length - 1;
                }

                // Also use camera data if available
                let cameraMod = 0;
                const cam = Data.CAMERAS.find(cam => {
                    const dist = Math.abs(cam.lat - c.lat) + Math.abs(cam.lng - c.lng);
                    return dist < 0.03;
                });
                if (cam) {
                    const feed = TrafficSystem.CameraFeed.getFeedStats(cam.id);
                    if (feed) {
                        cameraMod = feed.trend === 'INCREASING' ? 0.05 : feed.trend === 'DECREASING' ? -0.05 : 0;
                    }
                }

                const pred = Math.max(0, Math.min(1,
                    current * trendRatio * 0.5 + (current + momentum * s + cameraMod * s) * 0.5
                ));

                const ft = new Date(now.getTime() + fMin * 60000);
                steps.push({
                    time: ft, timeLabel: ft.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                    congestion: Math.round(pred * 100), confidence: Math.max(50, 100 - s * 8)
                });
            }
            predictions[c.id] = steps;
        });
        return predictions;
    }

    function getHotspots(threshold = 50) {
        const hotspots = [];
        Object.entries(predictions).forEach(([id, steps]) => {
            const max = Math.max(...steps.map(s => s.congestion));
            if (max >= threshold) {
                const c = TrafficSystem.Data.getCorridorById(id);
                const peak = steps.reduce((m, s) => s.congestion > m.congestion ? s : m, steps[0]);
                hotspots.push({ id, name: c?.name || id, maxCongestion: max, peakTime: peak.timeLabel });
            }
        });
        return hotspots.sort((a, b) => b.maxCongestion - a.maxCongestion);
    }

    function getNetworkPrediction() {
        const all = Object.values(predictions);
        if (!all.length) return null;
        const maxes = all.map(s => Math.max(...s.map(st => st.congestion)));
        const avg = maxes.reduce((s, v) => s + v, 0) / maxes.length;
        return {
            averageRisk: Math.round(avg), maxRisk: Math.max(...maxes),
            criticalCorridors: maxes.filter(v => v > 70).length,
            status: avg > 70 ? 'CRITICAL' : avg > 50 ? 'WARNING' : avg > 30 ? 'MODERATE' : 'NORMAL'
        };
    }

    return { init, predict, getHotspots, getNetworkPrediction, getPredictions: () => predictions };
})();
