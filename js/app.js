/**
 * SAARTHI -- App Bootstrap (auto-launch + Python ML backend)
 */
window.TrafficSystem = window.TrafficSystem || {};

TrafficSystem.App = (() => {
    'use strict';

    function boot() {
        document.querySelector('.app').style.display = 'grid';
        document.getElementById('api-key-modal').style.display = 'none';
        initSystem();
    }

    async function initSystem() {
        console.log('[SAARTHI] Adaptive Traffic Intelligence (TomTom + ML)');
        try {
            TrafficSystem.MapEngine.init('map-container');
            TrafficSystem.TrafficMonitor.init();
            TrafficSystem.SignalControl.init();
            TrafficSystem.CameraFeed.initFeed('CAM1', 'camera-canvas');
            TrafficSystem.PredictionEngine.init();
            TrafficSystem.Dashboard.init();
            TrafficSystem.TrafficMonitor.startMonitoring();
            TrafficSystem.SignalControl.start();

            const mlOk = await TrafficSystem.MLClient.isAvailable();
            console.log(mlOk ? '  [OK] Python ML backend connected' : '  [!!] ML backend offline (run: python backend/server.py)');
        } catch (err) {
            console.error('SAARTHI init error:', err);
        }
    }

    document.addEventListener('DOMContentLoaded', boot);
    return { boot };
})();
