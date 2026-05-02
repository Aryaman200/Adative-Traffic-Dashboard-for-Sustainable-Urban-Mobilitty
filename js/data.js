/**
 * SAARTHI — Delhi Data: Locations, Corridors, Intersections, Cameras
 */
window.TrafficSystem = window.TrafficSystem || {};

TrafficSystem.Data = (() => {
    'use strict';

    const LOCATIONS = [
        { id: 'L1',  name: 'Rajiv Chowk / CP',    lat: 28.6328, lng: 77.2197 },
        { id: 'L2',  name: 'ITO Junction',         lat: 28.6285, lng: 77.2410 },
        { id: 'L3',  name: 'India Gate',            lat: 28.6129, lng: 77.2295 },
        { id: 'L4',  name: 'AIIMS',                lat: 28.5672, lng: 77.2100 },
        { id: 'L5',  name: 'Dhaula Kuan',          lat: 28.5921, lng: 77.1665 },
        { id: 'L6',  name: 'Nehru Place',          lat: 28.5494, lng: 77.2529 },
        { id: 'L7',  name: 'Ashram Chowk',         lat: 28.5697, lng: 77.2567 },
        { id: 'L8',  name: 'Kashmere Gate ISBT',   lat: 28.6675, lng: 77.2280 },
        { id: 'L9',  name: 'Karol Bagh',           lat: 28.6514, lng: 77.1907 },
        { id: 'L10', name: 'Saket',                lat: 28.5244, lng: 77.2066 },
        { id: 'L11', name: 'Dwarka Sec 21',        lat: 28.5565, lng: 77.0588 },
        { id: 'L12', name: 'Moolchand',            lat: 28.5734, lng: 77.2339 },
        { id: 'L13', name: 'Pragati Maidan',       lat: 28.6175, lng: 77.2480 },
        { id: 'L14', name: 'Chandni Chowk',        lat: 28.6506, lng: 77.2300 },
        { id: 'L15', name: 'Hauz Khas',            lat: 28.5494, lng: 77.2001 },
        { id: 'L16', name: 'IGI Airport T3',       lat: 28.5562, lng: 77.1000 },
        { id: 'L17', name: 'Noida Sec 18',         lat: 28.5706, lng: 77.3219 },
        { id: 'L18', name: 'Gurgaon Cyber City',   lat: 28.4949, lng: 77.0889 },
        { id: 'L19', name: 'Mayur Vihar',          lat: 28.6093, lng: 77.2929 },
        { id: 'L20', name: 'Lajpat Nagar',         lat: 28.5700, lng: 77.2400 },
    ];

    // ── Corridors for TomTom flow monitoring ──────────────────────
    const CORRIDORS = [
        { id: 'C1',  name: 'Ring Road (Dhaula Kuan → AIIMS)',    from: 'L5',  to: 'L4',  freeFlowMin: 15, lat: 28.5796, lng: 77.1882 },
        { id: 'C2',  name: 'Ring Road (AIIMS → Ashram)',         from: 'L4',  to: 'L7',  freeFlowMin: 20, lat: 28.5684, lng: 77.2333 },
        { id: 'C3',  name: 'Mathura Road (ITO → Ashram)',        from: 'L2',  to: 'L7',  freeFlowMin: 18, lat: 28.5991, lng: 77.2488 },
        { id: 'C4',  name: 'NH-48 (Dhaula Kuan → Gurgaon)',     from: 'L5',  to: 'L18', freeFlowMin: 35, lat: 28.5435, lng: 77.1277 },
        { id: 'C5',  name: 'DND Flyway (Ashram → Noida)',       from: 'L7',  to: 'L17', freeFlowMin: 20, lat: 28.5701, lng: 77.2893 },
        { id: 'C6',  name: 'GT Karnal Road (KG → North)',       from: 'L8',  to: 'L8',  freeFlowMin: 15, lat: 28.6900, lng: 77.2200 },
        { id: 'C7',  name: 'Outer Ring Road (Saket → Nehru Pl)',from: 'L10', to: 'L6',  freeFlowMin: 18, lat: 28.5369, lng: 77.2297 },
        { id: 'C8',  name: 'Airport Expressway (CP → IGI)',     from: 'L1',  to: 'L16', freeFlowMin: 30, lat: 28.5945, lng: 77.1598 },
    ];

    // ── Intersections with traffic signals ────────────────────────
    const INTERSECTIONS = [
        {
            id: 'INT1', name: 'ITO Junction', lat: 28.6285, lng: 77.2410,
            approaches: [
                { id: 'N', label: 'From Kashmere Gate', bearing: 0,   lanes: 3 },
                { id: 'E', label: 'From Pragati Maidan', bearing: 90, lanes: 3 },
                { id: 'S', label: 'From Nizamuddin', bearing: 180,    lanes: 3 },
                { id: 'W', label: 'From Mandi House', bearing: 270,   lanes: 2 }
            ],
            phases: [
                { id: 'P1', green: ['N', 'S'], label: 'N-S Through' },
                { id: 'P2', green: ['E', 'W'], label: 'E-W Through' },
                { id: 'P3', green: ['N'],      label: 'N Left Turn' },
                { id: 'P4', green: ['E'],      label: 'E Left Turn' }
            ]
        },
        {
            id: 'INT2', name: 'AIIMS Flyover', lat: 28.5672, lng: 77.2100,
            approaches: [
                { id: 'N', label: 'From Ring Road North', bearing: 0,   lanes: 3 },
                { id: 'E', label: 'From Lodi Road', bearing: 90,        lanes: 2 },
                { id: 'S', label: 'From Mehrauli', bearing: 180,        lanes: 3 },
                { id: 'W', label: 'From Aurobindo Marg', bearing: 270,  lanes: 2 }
            ],
            phases: [
                { id: 'P1', green: ['N', 'S'], label: 'N-S Through' },
                { id: 'P2', green: ['E', 'W'], label: 'E-W Through' }
            ]
        },
        {
            id: 'INT3', name: 'Ashram Chowk', lat: 28.5697, lng: 77.2567,
            approaches: [
                { id: 'N', label: 'From Ring Road', bearing: 0,    lanes: 3 },
                { id: 'E', label: 'From DND Flyway', bearing: 90,  lanes: 3 },
                { id: 'S', label: 'From Mathura Rd', bearing: 180,  lanes: 3 },
                { id: 'W', label: 'From Lajpat Nagar', bearing: 270, lanes: 2 }
            ],
            phases: [
                { id: 'P1', green: ['N', 'S'], label: 'N-S Through' },
                { id: 'P2', green: ['E', 'W'], label: 'E-W Through' },
                { id: 'P3', green: ['N', 'E'], label: 'N-E Turn' }
            ]
        },
        {
            id: 'INT4', name: 'Rajiv Chowk', lat: 28.6328, lng: 77.2197,
            approaches: [
                { id: 'N', label: 'From Kashmere Gate', bearing: 0,   lanes: 2 },
                { id: 'E', label: 'From Barakhamba', bearing: 90,     lanes: 2 },
                { id: 'S', label: 'From Janpath', bearing: 180,       lanes: 2 },
                { id: 'W', label: 'From Pusa Road', bearing: 270,     lanes: 2 }
            ],
            phases: [
                { id: 'P1', green: ['N', 'S'], label: 'N-S Through' },
                { id: 'P2', green: ['E', 'W'], label: 'E-W Through' }
            ]
        },
        {
            id: 'INT5', name: 'Dhaula Kuan', lat: 28.5921, lng: 77.1665,
            approaches: [
                { id: 'N', label: 'From Patel Road', bearing: 0,      lanes: 3 },
                { id: 'E', label: 'From Ring Road', bearing: 90,      lanes: 4 },
                { id: 'S', label: 'From NH-48', bearing: 180,          lanes: 4 },
                { id: 'W', label: 'From Airport', bearing: 270,       lanes: 3 }
            ],
            phases: [
                { id: 'P1', green: ['N', 'S'], label: 'N-S Through' },
                { id: 'P2', green: ['E', 'W'], label: 'E-W Through' },
                { id: 'P3', green: ['S', 'W'], label: 'S-W Turn' }
            ]
        }
    ];

    const CAMERAS = [
        { id: 'CAM1', name: 'ITO Junction',     lat: 28.6285, lng: 77.2410, intersectionId: 'INT1', direction: 'N-S' },
        { id: 'CAM2', name: 'AIIMS Flyover',    lat: 28.5672, lng: 77.2100, intersectionId: 'INT2', direction: 'N-S' },
        { id: 'CAM3', name: 'Ashram Chowk',     lat: 28.5697, lng: 77.2567, intersectionId: 'INT3', direction: 'All' },
        { id: 'CAM4', name: 'Rajiv Chowk',      lat: 28.6328, lng: 77.2197, intersectionId: 'INT4', direction: 'E-W' },
        { id: 'CAM5', name: 'Dhaula Kuan',      lat: 28.5921, lng: 77.1665, intersectionId: 'INT5', direction: 'E-W' },
    ];

    const INCIDENT_TYPES = [
        { type: 'accident',     label: 'Road Accident',    icon: 'ACC' },
        { type: 'construction', label: 'Construction',     icon: 'WRK' },
        { type: 'waterlogging', label: 'Waterlogging',     icon: 'FLD' },
        { type: 'closure',      label: 'Road Closure',     icon: 'CLO' },
        { type: 'protest',      label: 'Protest/Rally',    icon: 'EVT' },
    ];

    function getLocationById(id) { return LOCATIONS.find(l => l.id === id); }
    function getCorridorById(id) { return CORRIDORS.find(c => c.id === id); }
    function getIntersectionById(id) { return INTERSECTIONS.find(i => i.id === id); }

    return { LOCATIONS, CORRIDORS, INTERSECTIONS, CAMERAS, INCIDENT_TYPES, getLocationById, getCorridorById, getIntersectionById };
})();
