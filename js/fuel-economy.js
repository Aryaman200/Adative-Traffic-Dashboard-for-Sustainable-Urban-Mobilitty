/**
 * SAARTHI — Fuel Economy Module
 */
window.TrafficSystem = window.TrafficSystem || {};

TrafficSystem.FuelEconomy = (() => {
    'use strict';

    function compareVehicles(routeData) {
        if (!routeData) return [];
        return Object.keys(TrafficSystem.Config.VEHICLE_TYPES).map(key => {
            return TrafficSystem.RoutingEngine.calcFuelForVehicle(routeData, key);
        }).filter(Boolean);
    }

    function getNetworkFuelEstimate() {
        const statuses = TrafficSystem.TrafficMonitor.getCorridorStatus();
        let totalWaste = 0, totalCO2 = 0;
        statuses.forEach(s => {
            if (!s.corridor) return;
            const excessSpeed = Math.max(0, (s.freeFlowSpeed || 40) - (s.currentSpeed || 30));
            const fuelWaste = excessSpeed * 0.8 * (s.congestion || 0);
            totalWaste += fuelWaste;
            totalCO2 += fuelWaste * 2.31;
        });
        return {
            fuelWasteLitres: Math.round(totalWaste),
            co2ExcessKg: Math.round(totalCO2),
            savingsINR: Math.round(totalWaste * TrafficSystem.Config.FUEL_PRICES.PETROL)
        };
    }

    return { compareVehicles, getNetworkFuelEstimate };
})();
