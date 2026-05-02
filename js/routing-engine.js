/**
 * SAARTHI — Routing Engine (TomTom Routing + Search API)
 * Supports free-text location input via TomTom Search
 */
window.TrafficSystem = window.TrafficSystem || {};

TrafficSystem.RoutingEngine = (() => {
    'use strict';

    let lastResults = null;

    // ── TomTom Search API (geocode text → lat/lng) ────────────────
    async function searchLocation(query) {
        const key = TrafficSystem.Config.TOMTOM.API_KEY;
        const url = `${TrafficSystem.Config.TOMTOM.BASE}${TrafficSystem.Config.TOMTOM.SEARCH}${encodeURIComponent(query)}.json?key=${key}&countrySet=IN&lat=28.6139&lon=77.2090&radius=50000&limit=5`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Search failed');
        const data = await resp.json();
        return (data.results || []).map(r => ({
            name: r.address?.freeformAddress || r.poi?.name || query,
            lat: r.position.lat,
            lng: r.position.lon,
            type: r.type,
            address: r.address?.freeformAddress
        }));
    }

    // ── Find routes between two locations ─────────────────────────
    async function findRoutes(fromLat, fromLng, toLat, toLng, options = {}) {
        const key = TrafficSystem.Config.TOMTOM.API_KEY;
        const coords = `${fromLat},${fromLng}:${toLat},${toLng}`;
        const params = new URLSearchParams({
            key, traffic: 'true', travelMode: 'car', maxAlternatives: '2',
            computeTravelTimeFor: 'all', routeType: options.routeType || 'fastest', departAt: 'now'
        });
        if (options.avoidTolls) params.set('avoid', 'tollRoads');

        const url = `${TrafficSystem.Config.TOMTOM.BASE}${TrafficSystem.Config.TOMTOM.ROUTING}${coords}/json?${params}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Routing error: ${resp.status}`);
        const data = await resp.json();
        lastResults = data;
        return parseRoutes(data);
    }

    function parseRoutes(data) {
        if (!data.routes) return [];
        return data.routes.map((route, i) => {
            const s = route.summary;
            const distKm = s.lengthInMeters / 1000;
            const durMin = s.travelTimeInSeconds / 60;
            const delayMin = (s.trafficDelayInSeconds || 0) / 60;
            const ffMin = (s.noTrafficTravelTimeInSeconds || s.travelTimeInSeconds) / 60;
            const cong = ffMin > 0 ? Math.min(1, delayMin / ffMin) : 0;

            const v = TrafficSystem.Config.VEHICLE_TYPES.CAR;
            const fuelRate = v.fuelPer100.free + (v.fuelPer100.congested - v.fuelPer100.free) * cong;
            const fuel = (distKm / 100) * fuelRate;
            const co2 = fuel * v.co2;
            const cost = fuel * TrafficSystem.Config.FUEL_PRICES.PETROL;
            const ecoScore = Math.round(Math.min(100, (distKm * 0.065 / Math.max(fuel, 0.01)) * 100));

            const points = route.legs[0].points.map(p => [p.latitude, p.longitude]);

            return {
                index: i, label: i === 0 ? 'Recommended' : `Alternative ${i}`,
                distance: { km: Math.round(distKm * 10) / 10, text: distKm < 1 ? Math.round(distKm * 1000) + ' m' : Math.round(distKm * 10) / 10 + ' km' },
                duration: { min: Math.round(durMin), text: Math.round(durMin) + ' min' },
                trafficDelay: { min: Math.round(delayMin), text: Math.round(delayMin) + ' min delay' },
                freeFlow: { min: Math.round(ffMin) },
                congestion: Math.round(cong * 100),
                fuel: { litres: Math.round(fuel * 100) / 100, costINR: Math.round(cost) },
                co2: Math.round(co2 * 100) / 100, ecoScore, points,
                departure: s.departureTime, arrival: s.arrivalTime
            };
        });
    }

    function calcFuelForVehicle(routeData, vKey) {
        const v = TrafficSystem.Config.VEHICLE_TYPES[vKey];
        if (!v || !routeData) return null;
        const c = routeData.congestion / 100;
        const rate = v.fuelPer100.free + (v.fuelPer100.congested - v.fuelPer100.free) * c;
        const fuel = (routeData.distance.km / 100) * rate;
        const price = vKey === 'AUTO_RICKSHAW' ? TrafficSystem.Config.FUEL_PRICES.CNG :
                      (vKey === 'BUS' || vKey === 'TRUCK') ? TrafficSystem.Config.FUEL_PRICES.DIESEL : TrafficSystem.Config.FUEL_PRICES.PETROL;
        return { vehicle: v.label, fuel: Math.round(fuel * 100) / 100, cost: Math.round(fuel * price), co2: Math.round(fuel * v.co2 * 100) / 100 };
    }

    return { searchLocation, findRoutes, calcFuelForVehicle, getLastResults: () => lastResults };
})();
