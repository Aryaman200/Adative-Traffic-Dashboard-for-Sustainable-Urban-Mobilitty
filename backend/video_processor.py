"""
SAARTHI -- Multi-Camera Real-Time Video Processor
YOLOv8 vehicle detection on multiple traffic camera feeds.
Supports: local files, webcam, RTSP/HTTP streams, YouTube live (via yt-dlp).
Each camera is geo-mapped to a Delhi intersection.
"""

import cv2
import numpy as np
import time
import threading
import os
import json
from collections import deque
from datetime import datetime

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("[WARN] ultralytics not installed. Run: pip install ultralytics")

try:
    import yt_dlp
    YTDLP_AVAILABLE = True
except ImportError:
    YTDLP_AVAILABLE = False
    print("[WARN] yt-dlp not installed. Run: pip install yt-dlp")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# COCO vehicle class IDs
VEHICLE_CLASSES = {2: 'Car', 3: 'Motorcycle', 5: 'Bus', 7: 'Truck'}
VEHICLE_COLORS_BGR = {
    'Car': (180, 130, 70),
    'Motorcycle': (0, 165, 255),
    'Bus': (60, 20, 220),
    'Truck': (34, 139, 34)
}

# ─── Delhi Intersection Camera Registry ────────────────────────
# Each camera is mapped to a real Delhi intersection with coordinates.
# 'source' can be: local file, YouTube URL, RTSP URL, or HTTP stream URL.
# The system tries YouTube live first, then falls back to the local file.
DELHI_CAMERAS = {
    'CAM_ITO': {
        'name': 'ITO Junction',
        'lat': 28.6289, 'lng': 77.2405,
        'intersection_id': 'ito',
        'local_file': os.path.join(BASE_DIR, 'cam_ito_junction.mp4'),
        'youtube_search': 'live traffic camera delhi ITO junction',
        'description': 'ITO Crossing - Major arterial junction'
    },
    'CAM_AIIMS': {
        'name': 'AIIMS Flyover',
        'lat': 28.5672, 'lng': 77.2100,
        'intersection_id': 'aiims',
        'local_file': os.path.join(BASE_DIR, 'cam_aiims_flyover.mp4'),
        'youtube_search': 'live traffic camera delhi AIIMS road',
        'description': 'AIIMS Ring Road - Mixed traffic corridor'
    },
    'CAM_ASHRAM': {
        'name': 'Ashram Chowk',
        'lat': 28.5800, 'lng': 77.2600,
        'intersection_id': 'ashram',
        'local_file': os.path.join(BASE_DIR, 'cam_ito_junction.mp4'),  # reuse
        'youtube_search': 'live traffic delhi ashram chowk',
        'description': 'Ashram Intersection - High density corridor'
    },
    'CAM_RAJIV': {
        'name': 'Rajiv Chowk',
        'lat': 28.6328, 'lng': 77.2197,
        'intersection_id': 'rajiv_chowk',
        'local_file': os.path.join(BASE_DIR, 'cam_aiims_flyover.mp4'),  # reuse
        'youtube_search': 'live traffic connaught place delhi',
        'description': 'Rajiv Chowk / Connaught Place junction'
    },
    'CAM_DHAULA': {
        'name': 'Dhaula Kuan',
        'lat': 28.5921, 'lng': 77.1660,
        'intersection_id': 'dhaula_kuan',
        'local_file': os.path.join(BASE_DIR, 'cam_ito_junction.mp4'),  # reuse
        'youtube_search': 'live traffic delhi dhaula kuan',
        'description': 'Dhaula Kuan flyover interchange'
    }
}


def resolve_youtube_stream(search_query):
    """Try to find a live YouTube stream and get its direct URL."""
    if not YTDLP_AVAILABLE:
        return None
    try:
        ydl_opts = {
            'quiet': True, 'no_warnings': True,
            'format': 'best[height<=480]',
            'default_search': 'ytsearch1',
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f'ytsearch1:{search_query}', download=False)
            entries = info.get('entries', [])
            for entry in entries:
                if entry.get('is_live'):
                    stream_url = entry.get('url')
                    if stream_url:
                        print(f"[YT] Found live stream: {entry.get('title', 'Unknown')}")
                        return stream_url
        return None
    except Exception as e:
        return None


class VehicleDetector:
    """YOLOv8-based vehicle detector."""
    def __init__(self, model_size='yolov8n'):
        self.model = None
        if YOLO_AVAILABLE:
            model_path = os.path.join(BASE_DIR, f'{model_size}.pt')
            if not os.path.exists(model_path):
                model_path = f'{model_size}.pt'
            print(f"[CV] Loading {model_size} model...")
            self.model = YOLO(model_path)
            print(f"[CV] Model ready")

    def detect(self, frame, conf=0.35):
        if self.model is None:
            return []
        results = self.model(frame, conf=conf, verbose=False)
        detections = []
        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0])
                if cls_id not in VEHICLE_CLASSES:
                    continue
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                detections.append({
                    'bbox': (x1, y1, x2, y2),
                    'class': VEHICLE_CLASSES[cls_id],
                    'confidence': round(float(box.conf[0]), 2),
                    'center': ((x1+x2)//2, (y1+y2)//2),
                    'area': (x2-x1)*(y2-y1)
                })
        return detections

    def draw(self, frame, detections):
        for det in detections:
            x1, y1, x2, y2 = det['bbox']
            label = det['class']
            conf = det['confidence']
            color = VEHICLE_COLORS_BGR.get(label, (200, 200, 200))
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            text = f"{label} {conf:.0%}"
            (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)
            cv2.rectangle(frame, (x1, y1-th-5), (x1+tw+3, y1), color, -1)
            cv2.putText(frame, text, (x1+2, y1-3), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255,255,255), 1)
        return frame


class TrafficMetrics:
    """Compute traffic metrics from detections."""
    def __init__(self):
        self.history = deque(maxlen=300)
        self.start = time.time()
        self.frames = 0

    def update(self, detections):
        self.frames += 1
        now = time.time()
        counts = {}
        for d in detections:
            counts[d['class']] = counts.get(d['class'], 0) + 1
        total = len(detections)
        self.history.append({'t': now, 'n': total, 'c': counts})
        return self._compute(total, counts)

    def _compute(self, total, counts):
        now = time.time()
        elapsed = max(now - self.start, 1)
        recent = [h for h in self.history if now - h['t'] < 10]
        avg = sum(h['n'] for h in recent) / max(len(recent), 1)
        flow = avg * 6
        density = min(100, int(avg * 5))
        queue = max(0, int(total * 0.6))

        if len(self.history) > 20:
            hist_list = list(self.history)
            old = sum(h['n'] for h in hist_list[:10]) / 10
            new_vals = [h['n'] for h in hist_list[-10:]]
            new = sum(new_vals) / len(new_vals)
            trend = 'INCREASING' if new > old * 1.15 else 'DECREASING' if new < old * 0.85 else 'STABLE'
        else:
            trend = 'STABLE'

        if density > 70: cong = 'HEAVY'
        elif density > 40: cong = 'MODERATE'
        elif density > 15: cong = 'LIGHT'
        else: cong = 'FREE FLOW'

        return {
            'vehicle_count': total,
            'avg_count': round(avg, 1),
            'flow_rate': round(flow, 1),
            'density': density,
            'queue_length': queue,
            'trend': trend,
            'congestion_level': cong,
            'class_counts': counts,
            'fps': round(self.frames / elapsed, 1),
            'timestamp': datetime.now().strftime('%H:%M:%S')
        }

    def empty(self):
        return {
            'vehicle_count': 0, 'avg_count': 0, 'flow_rate': 0,
            'density': 0, 'queue_length': 0, 'trend': 'STABLE',
            'congestion_level': 'FREE FLOW', 'class_counts': {},
            'fps': 0, 'timestamp': datetime.now().strftime('%H:%M:%S')
        }


class SingleCameraStream:
    """Manages one camera feed -- capture, detect, annotate."""
    def __init__(self, cam_id, cam_info, detector):
        self.cam_id = cam_id
        self.info = cam_info
        self.detector = detector
        self.metrics = TrafficMetrics()
        self.cap = None
        self.running = False
        self.lock = threading.Lock()
        self.latest_frame = None
        self.latest_metrics = self.metrics.empty()
        self.source_type = 'none'
        self.W, self.H = 640, 360

    def start(self):
        self.stop()
        name = self.info['name']

        # 1) Try YouTube live stream
        yt_query = self.info.get('youtube_search')
        if yt_query:
            print(f"[{self.cam_id}] Searching for live stream: {yt_query}")
            url = resolve_youtube_stream(yt_query)
            if url:
                try:
                    self.cap = cv2.VideoCapture(url)
                    if self.cap.isOpened():
                        self.source_type = 'youtube_live'
                        print(f"[{self.cam_id}] Connected to YouTube live stream")
                        self._start_loop()
                        return True
                except Exception:
                    pass

        # 2) Fall back to local file
        local = self.info.get('local_file')
        if local and os.path.exists(local):
            self.cap = cv2.VideoCapture(local)
            if self.cap.isOpened():
                self.source_type = 'local_file'
                print(f"[{self.cam_id}] Using local file: {os.path.basename(local)}")
                self._start_loop()
                return True

        # 3) Placeholder
        print(f"[{self.cam_id}] No source available, using placeholder")
        self.source_type = 'placeholder'
        self._start_placeholder()
        return False

    def start_from_url(self, url):
        """Start from a custom URL (RTSP, HTTP, or YouTube)."""
        self.stop()
        # Check if it's a YouTube URL
        if 'youtube.com' in url or 'youtu.be' in url:
            if YTDLP_AVAILABLE:
                try:
                    ydl_opts = {'quiet': True, 'format': 'best[height<=480]'}
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        info = ydl.extract_info(url, download=False)
                        stream_url = info.get('url')
                        if stream_url:
                            url = stream_url
                except Exception as e:
                    print(f"[{self.cam_id}] yt-dlp error: {e}")

        try:
            self.cap = cv2.VideoCapture(url)
            if self.cap.isOpened():
                self.source_type = 'custom_stream'
                self._start_loop()
                return True
        except Exception:
            pass
        return False

    def _start_loop(self):
        self.running = True
        self.metrics = TrafficMetrics()
        t = threading.Thread(target=self._capture_loop, daemon=True)
        t.start()

    def _capture_loop(self):
        while self.running and self.cap and self.cap.isOpened():
            ret, frame = self.cap.read()
            if not ret:
                if self.source_type == 'local_file':
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                else:
                    # Live stream ended -- try reconnecting
                    print(f"[{self.cam_id}] Stream lost, reconnecting...")
                    time.sleep(2)
                    self.start()
                    return

            frame = cv2.resize(frame, (self.W, self.H))
            dets = self.detector.detect(frame)
            annotated = self.detector.draw(frame.copy(), dets)
            metrics = self.metrics.update(dets)
            annotated = self._draw_hud(annotated, metrics)

            _, jpeg = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 75])
            with self.lock:
                self.latest_frame = jpeg.tobytes()
                self.latest_metrics = metrics

            time.sleep(0.08)

    def _draw_hud(self, frame, m):
        h, w = frame.shape[:2]
        name = self.info['name']
        src_label = {'youtube_live': 'LIVE', 'custom_stream': 'STREAM',
                     'local_file': 'FILE', 'placeholder': 'OFFLINE'}.get(self.source_type, '?')

        # Top bar
        ov = frame.copy()
        cv2.rectangle(ov, (0, 0), (w, 30), (20, 20, 20), -1)
        frame = cv2.addWeighted(ov, 0.7, frame, 0.3, 0)
        cv2.putText(frame, f"{name} [{src_label}]", (8, 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1)
        # Live dot
        dot_color = (0, 0, 220) if self.source_type in ('youtube_live', 'custom_stream') else (0, 140, 255)
        cv2.circle(frame, (w-18, 15), 5, dot_color, -1)
        cv2.putText(frame, src_label, (w-65, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.35, dot_color, 1)

        # Bottom bar
        ov2 = frame.copy()
        cv2.rectangle(ov2, (0, h-40), (w, h), (20, 20, 20), -1)
        frame = cv2.addWeighted(ov2, 0.75, frame, 0.25, 0)

        cong_color = {'FREE FLOW': (0,180,0), 'LIGHT': (0,200,200),
                      'MODERATE': (0,165,255), 'HEAVY': (0,0,220)}.get(m['congestion_level'], (200,200,200))

        stats = f"Vehicles: {m['vehicle_count']}  Flow: {m['flow_rate']} v/min  Density: {m['density']}%  Queue: {m['queue_length']}  {m['congestion_level']}"
        cv2.putText(frame, stats, (8, h-14), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (200,200,200), 1)

        # Timestamp
        cv2.putText(frame, m['timestamp'], (w-68, h-14), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (180,180,180), 1)

        # Detection panel (top right)
        cc = m.get('class_counts', {})
        if cc:
            ov3 = frame.copy()
            cv2.rectangle(ov3, (w-120, 34), (w, 34 + len(cc)*16 + 22), (20,20,20), -1)
            frame = cv2.addWeighted(ov3, 0.6, frame, 0.4, 0)
            cv2.putText(frame, "DETECTION", (w-112, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.3, (180,180,180), 1)
            by = 64
            for cls_name, cnt in cc.items():
                if cnt > 0:
                    c = VEHICLE_COLORS_BGR.get(cls_name, (200,200,200))
                    cv2.putText(frame, f"{cls_name}: {cnt}", (w-112, by), cv2.FONT_HERSHEY_SIMPLEX, 0.3, c, 1)
                    by += 14

        return frame

    def _start_placeholder(self):
        self.running = True
        t = threading.Thread(target=self._placeholder_loop, daemon=True)
        t.start()

    def _placeholder_loop(self):
        while self.running:
            frame = np.zeros((self.H, self.W, 3), dtype=np.uint8)
            frame[:] = (30, 25, 20)
            cv2.putText(frame, f"Camera: {self.info['name']}", (140, 100),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200,200,200), 2)
            cv2.putText(frame, "Searching for live feed...", (160, 140),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.45, (150,150,150), 1)
            cv2.putText(frame, f"Location: {self.info.get('description', '')}", (80, 190),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.38, (180,140,60), 1)
            cv2.putText(frame, f"Lat: {self.info['lat']:.4f}  Lng: {self.info['lng']:.4f}", (120, 220),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.38, (150,150,150), 1)
            _, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            with self.lock:
                self.latest_frame = jpeg.tobytes()
                self.latest_metrics = self.metrics.empty()
            time.sleep(1)

    def get_frame(self):
        with self.lock:
            return self.latest_frame

    def get_metrics(self):
        with self.lock:
            return dict(self.latest_metrics)

    def generate_mjpeg(self):
        while self.running:
            f = self.get_frame()
            if f:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + f + b'\r\n')
            time.sleep(0.08)

    def stop(self):
        self.running = False
        if self.cap:
            self.cap.release()
            self.cap = None


class MultiCameraManager:
    """Manages multiple camera streams simultaneously."""
    def __init__(self):
        self.detector = VehicleDetector('yolov8n')
        self.cameras = {}
        self.active_cam_id = None

        # Register all Delhi cameras
        for cam_id, info in DELHI_CAMERAS.items():
            self.cameras[cam_id] = SingleCameraStream(cam_id, info, self.detector)

    def start_all(self):
        """Start all cameras."""
        for cam_id, cam in self.cameras.items():
            cam.start()
        if self.cameras:
            self.active_cam_id = list(self.cameras.keys())[0]

    def start_camera(self, cam_id, url=None):
        """Start or restart a specific camera."""
        cam = self.cameras.get(cam_id)
        if not cam:
            return False
        if url:
            return cam.start_from_url(url)
        return cam.start()

    def switch_camera(self, cam_id):
        """Switch the active camera for the main stream."""
        if cam_id in self.cameras:
            self.active_cam_id = cam_id
            return True
        return False

    def get_active_stream(self):
        """Get MJPEG stream for active camera."""
        cam = self.cameras.get(self.active_cam_id)
        if cam:
            return cam.generate_mjpeg()
        return iter([])

    def get_camera_stream(self, cam_id):
        """Get MJPEG stream for a specific camera."""
        cam = self.cameras.get(cam_id)
        if cam:
            return cam.generate_mjpeg()
        return iter([])

    def get_active_metrics(self):
        """Get metrics for the active camera."""
        cam = self.cameras.get(self.active_cam_id)
        if cam:
            m = cam.get_metrics()
            m['camera_id'] = self.active_cam_id
            m['camera_name'] = cam.info['name']
            m['source_type'] = cam.source_type
            m['lat'] = cam.info['lat']
            m['lng'] = cam.info['lng']
            return m
        return {'camera_id': None}

    def get_all_metrics(self):
        """Get metrics from ALL cameras -- used for map overlay."""
        all_m = {}
        for cam_id, cam in self.cameras.items():
            m = cam.get_metrics()
            m['camera_id'] = cam_id
            m['camera_name'] = cam.info['name']
            m['source_type'] = cam.source_type
            m['lat'] = cam.info['lat']
            m['lng'] = cam.info['lng']
            m['intersection_id'] = cam.info.get('intersection_id', '')
            all_m[cam_id] = m
        return all_m

    def get_camera_list(self):
        """Get list of all cameras with status."""
        return [{
            'id': cid,
            'name': cam.info['name'],
            'lat': cam.info['lat'],
            'lng': cam.info['lng'],
            'description': cam.info.get('description', ''),
            'source_type': cam.source_type,
            'active': cid == self.active_cam_id,
            'running': cam.running
        } for cid, cam in self.cameras.items()]

    def stop_all(self):
        for cam in self.cameras.values():
            cam.stop()


# Global instance
camera_manager = MultiCameraManager()
