/**
 * SAARTHI -- Camera Feed (Multi-Camera + YOLO Backend)
 * Connects to Python backend for real-time multi-camera MJPEG streams.
 * Polls /api/camera/all-metrics for traffic data from ALL cameras.
 * Feeds detection metrics into the signal control system.
 */
window.TrafficSystem = window.TrafficSystem || {};

TrafficSystem.CameraFeed = (() => {
    'use strict';

    let activeCamId = 'CAM_ITO';
    let metricsTimer = null;
    let allCameraMetrics = {};
    let streamImg = null;

    const backendUrl = () => {
        return (TrafficSystem.Config && TrafficSystem.Config.ML_BACKEND)
            ? TrafficSystem.Config.ML_BACKEND.BASE_URL
            : 'http://localhost:5000';
    };

    /**
     * Initialize: replace canvas with MJPEG <img> and start metrics polling.
     */
    function initFeed(cameraId, canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        // Replace canvas with <img> for MJPEG stream
        const img = document.createElement('img');
        img.id = 'camera-stream-img';
        img.style.display = 'block';
        img.style.width = canvas.style.width || '460px';
        img.style.height = canvas.style.height || '260px';
        img.style.objectFit = 'cover';
        img.style.background = '#1c1917';
        img.alt = 'Traffic Camera Feed';
        img.src = backendUrl() + '/api/camera/stream';

        img.onerror = function() {
            img.alt = 'Camera offline -- start backend';
        };

        canvas.parentNode.replaceChild(img, canvas);
        streamImg = img;

        // Populate camera selector with multi-camera options
        loadCameraList();

        // Start polling ALL camera metrics
        startMetricsPolling();
    }

    /**
     * Load camera list from backend and populate selector.
     */
    async function loadCameraList() {
        try {
            const resp = await fetch(backendUrl() + '/api/camera/list');
            if (!resp.ok) return;
            const data = await resp.json();
            if (!data.success) return;

            const sel = document.getElementById('camera-select');
            if (sel) {
                sel.innerHTML = '';
                (data.cameras || []).forEach(cam => {
                    const opt = document.createElement('option');
                    opt.value = cam.id;
                    opt.textContent = cam.name + ' [' + (cam.source_type || 'loading') + ']';
                    sel.appendChild(opt);
                });

                sel.removeEventListener('change', handleCameraSwitch);
                sel.addEventListener('change', handleCameraSwitch);
            }
        } catch (e) {
            // Backend offline
        }
    }

    function handleCameraSwitch(e) {
        setActiveCamera(e.target.value);
    }

    /**
     * Switch the active camera -- tells backend and updates MJPEG stream.
     */
    async function setActiveCamera(camId) {
        activeCamId = camId;

        // Tell backend to switch active camera
        try {
            await fetch(backendUrl() + '/api/camera/switch?cam=' + camId);
        } catch (e) {}

        // Update MJPEG stream URL to the specific camera
        if (streamImg) {
            streamImg.src = backendUrl() + '/api/camera/stream?cam=' + camId;
        }

        // Update label
        const label = document.getElementById('camera-label');
        if (label) {
            const metrics = allCameraMetrics[camId];
            label.textContent = metrics ? metrics.camera_name : camId;
        }
    }

    /**
     * Poll ALL camera metrics from backend.
     * This gives us detection data from every camera simultaneously.
     */
    function startMetricsPolling() {
        if (metricsTimer) clearInterval(metricsTimer);

        metricsTimer = setInterval(async () => {
            try {
                const resp = await fetch(backendUrl() + '/api/camera/all-metrics');
                if (!resp.ok) return;
                const data = await resp.json();
                if (!data.success) return;

                allCameraMetrics = data.cameras || {};

                // Feed each camera's metrics into its mapped intersection
                feedAllMetricsToSignals(allCameraMetrics);

            } catch (e) {
                // Backend offline
            }
        }, 3000);
    }

    /**
     * Feed detection metrics from ALL cameras into signal control.
     * Each camera is mapped to a Delhi intersection.
     */
    function feedAllMetricsToSignals(allMetrics) {
        if (!TrafficSystem.SignalControl) return;

        for (const [camId, m] of Object.entries(allMetrics)) {
            const intxId = m.intersection_id;
            if (!intxId) continue;

            const flowRate = m.flow_rate || 0;
            const density = m.density || 0;

            // Map detection flow to signal approach demand
            const intx = TrafficSystem.Data?.INTERSECTIONS?.find(i => i.id === intxId);
            if (intx && intx.approaches) {
                intx.approaches.forEach((a, i) => {
                    const variation = 0.7 + Math.random() * 0.6;
                    const demand = (flowRate / 4) * variation;
                    TrafficSystem.SignalControl.setApproachDemand(intxId, a.id, demand);
                });
            }
        }
    }

    function getLatestMetrics() {
        return allCameraMetrics[activeCamId] || {};
    }

    function getAllCameraMetrics() {
        return allCameraMetrics;
    }

    // No-op: MJPEG renders via <img> tag
    function renderAll() {}

    return {
        initFeed,
        setActiveCamera,
        renderAll,
        getLatestMetrics,
        getAllCameraMetrics
    };
})();
