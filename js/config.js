/**
 * SAARTHI - Config (TomTom + Python ML Backend)
 */
window.TrafficSystem = window.TrafficSystem || {};

TrafficSystem.Config = (() => {
    'use strict';

    const TOMTOM = {
        API_KEY: 'YOUR API KEY HERE',
        BASE: 'https://api.tomtom.com',
        TRAFFIC_FLOW: '/traffic/services/4/flowSegmentData/absolute/10/',
        TRAFFIC_INCIDENTS: '/traffic/services/5/incidentDetails',
        ROUTING: '/routing/1/calculateRoute/',
        SEARCH: '/search/2/search/',
        FLOW_TILES: '/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png',
        INCIDENT_TILES: '/traffic/map/4/tile/incidents/s3/{z}/{x}/{y}.png'
    };

    const BACKEND = { BASE: 'http://localhost:5000/api' };

    const MAP = { CENTER: [28.6139, 77.2090], ZOOM: 13, MIN_ZOOM: 10, MAX_ZOOM: 18 };

    const VEHICLE_TYPES = {
        TWO_WHEELER: { id: 'two_wheeler', label: 'Two-Wheeler', icon: '2W', pcu: 0.5, fuelPer100: { free: 2.5, congested: 4.2 }, co2: 2.31 },
        CAR: { id: 'car', label: 'Car', icon: 'CAR', pcu: 1.0, fuelPer100: { free: 7.5, congested: 14 }, co2: 2.31 },
        AUTO_RICKSHAW: { id: 'auto_rickshaw', label: 'Auto-Rickshaw', icon: 'AUTO', pcu: 0.75, fuelPer100: { free: 3.5, congested: 6 }, co2: 1.86 },
        BUS: { id: 'bus', label: 'Bus', icon: 'BUS', pcu: 3.0, fuelPer100: { free: 30, congested: 55 }, co2: 2.68 },
        TRUCK: { id: 'truck', label: 'Truck', icon: 'TRK', pcu: 3.5, fuelPer100: { free: 35, congested: 60 }, co2: 2.68 },
        E_RICKSHAW: { id: 'e_rickshaw', label: 'E-Rickshaw', icon: 'EV', pcu: 0.75, fuelPer100: { free: 0, congested: 0 }, co2: 0 }
    };

    const FUEL_PRICES = { PETROL: 104.61, DIESEL: 87.62, CNG: 76.59 };

    const SIGNAL = {
        MIN_GREEN: 10, MAX_GREEN: 90, YELLOW_DURATION: 3, ALL_RED: 2,
        MIN_CYCLE: 60, MAX_CYCLE: 180, LOST_TIME_PER_PHASE: 4,
        SATURATION_FLOW: 1800, UPDATE_INTERVAL: 5000
    };

    const CAMERA = {
        WIDTH: 640, HEIGHT: 360, FPS: 24, DETECTION_CONFIDENCE: 0.85,
        VEHICLE_COLORS: ['#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#dc2626', '#2563eb', '#f59e0b', '#fff', '#1e3a5f']
    };

    const MONITORING = { POLL_INTERVAL: 120000, HISTORY_LENGTH: 60 };

    return { TOMTOM, BACKEND, MAP, VEHICLE_TYPES, FUEL_PRICES, SIGNAL, CAMERA, MONITORING };
})();
