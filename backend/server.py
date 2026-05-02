"""
SAARTHI - Flask Backend API
Serves ML predictions for traffic, congestion, and signal optimization.
Also serves the frontend static files.
"""

import os
import json
import math
import time
from datetime import datetime

import numpy as np
import pandas as pd
import joblib
from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS

from video_processor import camera_manager

# ── Paths ──────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)
MODEL_DIR = os.path.join(BASE_DIR, 'models')

# ── Load models + metadata ────────────────────────────────────
travel_time_model = joblib.load(os.path.join(MODEL_DIR, 'travel_time_model.pkl'))
congestion_model = joblib.load(os.path.join(MODEL_DIR, 'congestion_classifier.pkl'))
signal_cycle_model = joblib.load(os.path.join(MODEL_DIR, 'signal_cycle_model.pkl'))
signal_green_model = joblib.load(os.path.join(MODEL_DIR, 'signal_green_model.pkl'))

with open(os.path.join(MODEL_DIR, 'metadata.json'), 'r') as f:
    metadata = json.load(f)

encoders = metadata['encoders']

# ── Flask App ─────────────────────────────────────────────────
app = Flask(__name__, static_folder=PROJECT_DIR)
CORS(app)

# ── Signal state (in-memory) ──────────────────────────────────
signal_states = {}


# ═══ STATIC FILE SERVING ══════════════════════════════════════

@app.route('/')
def index():
    return send_from_directory(PROJECT_DIR, 'index.html')

@app.route('/css/<path:filename>')
def css(filename):
    return send_from_directory(os.path.join(PROJECT_DIR, 'css'), filename)

@app.route('/js/<path:filename>')
def js(filename):
    return send_from_directory(os.path.join(PROJECT_DIR, 'js'), filename)


# ═══ ML PREDICTION ENDPOINTS ═════════════════════════════════

def safe_encode(encoder_name, value):
    """Encode a value using saved label encoder, with fallback."""
    enc = encoders.get(encoder_name, {})
    return enc.get(str(value), 0)


@app.route('/api/predict/travel-time', methods=['POST'])
def predict_travel_time():
    """Predict travel time for a route."""
    data = request.json
    try:
        distance = float(data.get('distance_km', 10))
        speed = float(data.get('average_speed', 30))
        time_of_day = data.get('time_of_day', 'Off Peak')
        day_of_week = data.get('day_of_week', 'Weekday')
        weather = data.get('weather', 'Clear')
        density = data.get('traffic_density', 'Medium')
        road_type = data.get('road_type', 'Main Road')
        start_area = data.get('start_area', 'Unknown')
        end_area = data.get('end_area', 'Unknown')

        features = np.array([[
            safe_encode('start_area', start_area),
            safe_encode('end_area', end_area),
            distance,
            safe_encode('time_of_day', time_of_day),
            safe_encode('day_of_week', day_of_week),
            safe_encode('weather_condition', weather),
            safe_encode('traffic_density_level', density),
            safe_encode('road_type', road_type),
            speed,
            1 if time_of_day in ['Morning Peak', 'Evening Peak'] else 0,
            1 if day_of_week == 'Weekend' else 0,
            1 if weather in ['Rain', 'Fog'] else 0,
            1 if road_type == 'Highway' else 0,
            speed / (distance + 0.01)
        ]])

        predicted_time = travel_time_model.predict(features)[0]

        return jsonify({
            'success': True,
            'predicted_travel_time_minutes': round(float(predicted_time), 1),
            'input': {
                'distance_km': distance,
                'speed_kmph': speed,
                'time_of_day': time_of_day,
                'weather': weather,
                'density': density
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/predict/congestion', methods=['POST'])
def predict_congestion():
    """Predict congestion level for given conditions."""
    data = request.json
    try:
        distance = float(data.get('distance_km', 10))
        speed = float(data.get('average_speed', 30))
        time_of_day = data.get('time_of_day', 'Off Peak')
        day_of_week = data.get('day_of_week', 'Weekday')
        weather = data.get('weather', 'Clear')
        road_type = data.get('road_type', 'Main Road')

        is_peak = 1 if time_of_day in ['Morning Peak', 'Evening Peak'] else 0
        is_weekend = 1 if day_of_week == 'Weekend' else 0
        is_rain = 1 if weather in ['Rain', 'Fog'] else 0
        is_highway = 1 if road_type == 'Highway' else 0
        congestion_score = distance / (speed + 0.01) * 60

        features = np.array([[
            distance,
            safe_encode('time_of_day', time_of_day),
            safe_encode('day_of_week', day_of_week),
            safe_encode('weather_condition', weather),
            safe_encode('road_type', road_type),
            speed,
            is_peak, is_weekend, is_rain, is_highway,
            speed / (distance + 0.01),
            congestion_score
        ]])

        predicted_level = congestion_model.predict(features)[0]
        probabilities = congestion_model.predict_proba(features)[0]

        level_names = list(encoders.get('traffic_density_level', {}).keys())
        prob_dict = {level_names[i]: round(float(p), 3) for i, p in enumerate(probabilities) if i < len(level_names)}

        predicted_name = level_names[predicted_level] if predicted_level < len(level_names) else 'Unknown'

        return jsonify({
            'success': True,
            'predicted_level': predicted_name,
            'predicted_code': int(predicted_level),
            'probabilities': prob_dict,
            'input': {'distance_km': distance, 'speed': speed, 'time_of_day': time_of_day}
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/predict/signal', methods=['POST'])
def predict_signal():
    """Predict optimal signal timing for an intersection."""
    data = request.json
    try:
        speed = float(data.get('average_speed', 30))
        distance = float(data.get('distance_km', 5))
        density = data.get('traffic_density', 'Medium')
        time_of_day = data.get('time_of_day', 'Off Peak')
        day_of_week = data.get('day_of_week', 'Weekday')
        weather = data.get('weather', 'Clear')
        road_type = data.get('road_type', 'Main Road')
        queue_length = float(data.get('queue_length', 10))

        density_map = {'Low': 0, 'Medium': 1, 'High': 2, 'Very High': 3}
        density_enc = density_map.get(density, 1)

        is_peak = 1 if time_of_day in ['Morning Peak', 'Evening Peak'] else 0
        is_weekend = 1 if day_of_week == 'Weekend' else 0
        is_rain = 1 if weather in ['Rain', 'Fog'] else 0
        congestion_score = distance / (speed + 0.01) * 60
        demand_ratio = min(0.9, 0.15 + density_enc * 0.25 + (1 - speed / 80) * 0.2)

        features = np.array([[
            distance,
            safe_encode('time_of_day', time_of_day),
            safe_encode('day_of_week', day_of_week),
            safe_encode('weather_condition', weather),
            safe_encode('road_type', road_type),
            speed,
            density_enc,
            is_peak, is_weekend, is_rain,
            congestion_score, demand_ratio
        ]])

        optimal_cycle = int(signal_cycle_model.predict(features)[0])
        optimal_green = int(signal_green_model.predict(features)[0])

        # Calculate phase splits
        n_phases = int(data.get('num_phases', 3))
        lost_time = n_phases * 4
        effective_green = optimal_cycle - lost_time
        remaining_green = effective_green - optimal_green

        phases = [{'phase': 'Main', 'green': optimal_green, 'yellow': 3, 'red': optimal_cycle - optimal_green - 3}]
        if n_phases >= 2:
            p2_green = max(10, int(remaining_green * 0.6))
            phases.append({'phase': 'Secondary', 'green': p2_green, 'yellow': 3, 'red': optimal_cycle - p2_green - 3})
        if n_phases >= 3:
            p3_green = max(10, remaining_green - phases[1]['green'] if len(phases) > 1 else 15)
            phases.append({'phase': 'Left Turn', 'green': p3_green, 'yellow': 3, 'red': optimal_cycle - p3_green - 3})

        return jsonify({
            'success': True,
            'optimal_cycle_seconds': optimal_cycle,
            'optimal_main_green_seconds': optimal_green,
            'demand_ratio': round(demand_ratio, 3),
            'phases': phases,
            'recommendation': (
                'EXTEND GREEN' if demand_ratio > 0.7 else
                'REDUCE CYCLE' if demand_ratio < 0.2 else
                'OPTIMAL'
            ),
            'input': {
                'speed': speed, 'density': density, 'time': time_of_day,
                'queue': queue_length, 'weather': weather
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/predict/batch-signals', methods=['POST'])
def batch_signal_predictions():
    """Predict signals for multiple intersections at once."""
    data = request.json
    intersections = data.get('intersections', [])
    results = []

    for intx in intersections:
        try:
            speed = float(intx.get('average_speed', 30))
            density = intx.get('traffic_density', 'Medium')
            density_map = {'Low': 0, 'Medium': 1, 'High': 2, 'Very High': 3}
            density_enc = density_map.get(density, 1)

            tod = intx.get('time_of_day', 'Off Peak')
            is_peak = 1 if tod in ['Morning Peak', 'Evening Peak'] else 0
            congestion_score = float(intx.get('distance_km', 5)) / (speed + 0.01) * 60
            demand_ratio = min(0.9, 0.15 + density_enc * 0.25 + (1 - speed / 80) * 0.2)

            features = np.array([[
                float(intx.get('distance_km', 5)),
                safe_encode('time_of_day', tod),
                safe_encode('day_of_week', intx.get('day_of_week', 'Weekday')),
                safe_encode('weather_condition', intx.get('weather', 'Clear')),
                safe_encode('road_type', intx.get('road_type', 'Main Road')),
                speed, density_enc, is_peak,
                1 if intx.get('day_of_week') == 'Weekend' else 0,
                1 if intx.get('weather') in ['Rain', 'Fog'] else 0,
                congestion_score, demand_ratio
            ]])

            results.append({
                'intersection_id': intx.get('id', ''),
                'optimal_cycle': int(signal_cycle_model.predict(features)[0]),
                'optimal_green': int(signal_green_model.predict(features)[0]),
                'demand_ratio': round(demand_ratio, 3)
            })
        except Exception as e:
            results.append({'intersection_id': intx.get('id', ''), 'error': str(e)})

    return jsonify({'success': True, 'predictions': results})


@app.route('/api/model-info', methods=['GET'])
def model_info():
    """Return model metadata and encoder mappings."""
    return jsonify({
        'models': {
            'travel_time': 'Random Forest Regressor (150 trees)',
            'congestion': 'Gradient Boosting Classifier (120 trees)',
            'signal_cycle': 'Random Forest Regressor (100 trees)',
            'signal_green': 'Random Forest Regressor (100 trees)'
        },
        'dataset': '4000 Delhi trip records',
        'encoders': encoders,
        'feature_columns': {
            'travel_time': metadata['feature_cols_travel_time'],
            'congestion': metadata['feature_cols_congestion'],
            'signal': metadata['feature_cols_signal']
        }
    })


# ═══ SIGNAL STATE MANAGEMENT ═════════════════════════════════

@app.route('/api/signals/state', methods=['GET'])
def get_signal_states():
    """Get current signal states for all intersections."""
    return jsonify({'success': True, 'signals': signal_states})


@app.route('/api/signals/update', methods=['POST'])
def update_signal_state():
    """Update signal state from frontend."""
    data = request.json
    intx_id = data.get('intersection_id')
    if intx_id:
        signal_states[intx_id] = {
            'state': data.get('state', 'GREEN'),
            'phase': data.get('phase', 0),
            'timer': data.get('timer', 0),
            'cycle_time': data.get('cycle_time', 90),
            'queues': data.get('queues', {}),
            'updated_at': datetime.now().isoformat()
        }
    return jsonify({'success': True})


# ═══ CAMERA / VIDEO ENDPOINTS ════════════════════════════════

@app.route('/api/camera/stream')
def camera_mjpeg_stream():
    """MJPEG stream for the active camera (YOLO-processed)."""
    cam_id = request.args.get('cam')
    if cam_id:
        gen = camera_manager.get_camera_stream(cam_id)
    else:
        gen = camera_manager.get_active_stream()
    return Response(gen, mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/api/camera/metrics')
def camera_metrics():
    """Get metrics for the active camera."""
    return jsonify({'success': True, **camera_manager.get_active_metrics()})


@app.route('/api/camera/all-metrics')
def camera_all_metrics():
    """Get metrics from ALL cameras -- used for map overlay."""
    return jsonify({'success': True, 'cameras': camera_manager.get_all_metrics()})


@app.route('/api/camera/list')
def camera_list():
    """Get list of all cameras with status."""
    return jsonify({'success': True, 'cameras': camera_manager.get_camera_list()})


@app.route('/api/camera/switch', methods=['GET', 'POST'])
def camera_switch():
    """Switch the active camera. Query param: cam=CAM_ITO"""
    cam_id = request.args.get('cam') or (request.json or {}).get('cam')
    if cam_id:
        ok = camera_manager.switch_camera(cam_id)
        return jsonify({'success': ok, 'active': cam_id})
    return jsonify({'success': False, 'error': 'No cam parameter'})


@app.route('/api/camera/start', methods=['GET', 'POST'])
def camera_start():
    """Start a camera with optional custom URL."""
    cam_id = request.args.get('cam', 'CAM_ITO')
    url = request.args.get('url') or (request.json or {}).get('url')
    if url:
        ok = camera_manager.start_camera(cam_id, url)
    else:
        ok = camera_manager.start_camera(cam_id)
    return jsonify({'success': ok, 'cam': cam_id})


@app.route('/api/camera/stop', methods=['POST'])
def camera_stop():
    """Stop all cameras."""
    camera_manager.stop_all()
    return jsonify({'success': True})


# ═══ RUN ══════════════════════════════════════════════════════

if __name__ == '__main__':
    print("[SAARTHI] Python Backend Starting...")
    print(f"  Models loaded from: {MODEL_DIR}")
    print(f"  Frontend served from: {PROJECT_DIR}")
    print(f"  Server: http://localhost:5000")
    print("  Endpoints:")
    print("    POST /api/predict/travel-time")
    print("    POST /api/predict/congestion")
    print("    POST /api/predict/signal")
    print("    POST /api/predict/batch-signals")
    print("    GET  /api/model-info")
    print("    GET  /api/camera/stream       (MJPEG)")
    print("    GET  /api/camera/stream?cam=X  (per-camera)")
    print("    GET  /api/camera/metrics")
    print("    GET  /api/camera/all-metrics")
    print("    GET  /api/camera/list")
    print("    GET  /api/camera/switch?cam=X")

    # Start all 5 Delhi cameras
    camera_manager.start_all()

    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)

