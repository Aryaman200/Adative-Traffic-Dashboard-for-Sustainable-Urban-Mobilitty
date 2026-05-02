/**
 * SAARTHI — ML Client (connects to Python Flask backend)
 * Provides AI predictions for travel time, congestion, and signal optimization
 */
window.TrafficSystem = window.TrafficSystem || {};

TrafficSystem.MLClient = (() => {
    'use strict';

    const BASE = () => TrafficSystem.Config.BACKEND.BASE;

    async function post(endpoint, data) {
        try {
            const resp = await fetch(BASE() + endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await resp.json();
        } catch (e) {
            console.warn('ML Backend error:', e.message);
            return { success: false, error: e.message };
        }
    }

    // ── Get current time-of-day classification ────────────────────
    function getTimeOfDay() {
        const h = new Date().getHours();
        if (h >= 7 && h <= 10) return 'Morning Peak';
        if (h >= 17 && h <= 20) return 'Evening Peak';
        if (h >= 10 && h <= 17) return 'Afternoon';
        return h >= 21 || h <= 5 ? 'Night' : 'Off Peak';
    }

    function getDayOfWeek() {
        const d = new Date().getDay();
        return (d === 0 || d === 6) ? 'Weekend' : 'Weekday';
    }

    // ── Predict travel time ───────────────────────────────────────
    async function predictTravelTime(params) {
        return post('/predict/travel-time', {
            distance_km: params.distance || 10,
            average_speed: params.speed || 30,
            time_of_day: params.timeOfDay || getTimeOfDay(),
            day_of_week: params.dayOfWeek || getDayOfWeek(),
            weather: params.weather || 'Clear',
            traffic_density: params.density || 'Medium',
            road_type: params.roadType || 'Main Road',
            start_area: params.startArea || 'Unknown',
            end_area: params.endArea || 'Unknown'
        });
    }

    // ── Predict congestion level ──────────────────────────────────
    async function predictCongestion(params) {
        return post('/predict/congestion', {
            distance_km: params.distance || 10,
            average_speed: params.speed || 30,
            time_of_day: params.timeOfDay || getTimeOfDay(),
            day_of_week: params.dayOfWeek || getDayOfWeek(),
            weather: params.weather || 'Clear',
            road_type: params.roadType || 'Main Road'
        });
    }

    // ── Predict optimal signal timing ─────────────────────────────
    async function predictSignal(params) {
        return post('/predict/signal', {
            average_speed: params.speed || 30,
            distance_km: params.distance || 5,
            traffic_density: params.density || 'Medium',
            time_of_day: params.timeOfDay || getTimeOfDay(),
            day_of_week: params.dayOfWeek || getDayOfWeek(),
            weather: params.weather || 'Clear',
            road_type: params.roadType || 'Main Road',
            queue_length: params.queueLength || 10,
            num_phases: params.numPhases || 3
        });
    }

    // ── Batch signal predictions ──────────────────────────────────
    async function predictBatchSignals(intersections) {
        return post('/predict/batch-signals', { intersections });
    }

    // ── Get model info ────────────────────────────────────────────
    async function getModelInfo() {
        try {
            const resp = await fetch(BASE() + '/model-info');
            return await resp.json();
        } catch (e) { return { error: e.message }; }
    }

    // ── Check backend health ──────────────────────────────────────
    async function isAvailable() {
        try {
            const resp = await fetch(BASE() + '/model-info', { signal: AbortSignal.timeout(3000) });
            return resp.ok;
        } catch { return false; }
    }

    return { predictTravelTime, predictCongestion, predictSignal, predictBatchSignals, getModelInfo, isAvailable, getTimeOfDay, getDayOfWeek };
})();
