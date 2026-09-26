import csv
import os
import io
import queue
import sys
from datetime import datetime
import threading
import time
from flask import Flask, Response, jsonify, render_template, request, send_from_directory, send_file
from openpyxl import Workbook

app = Flask(__name__)

# ============================================================
# DEV MODE — live reload (no manual refresh, no manual re-run)
# ============================================================
# While True, a background thread watches this file plus everything in
# templates/ and static/ once a second. When something changes:
#   - a .py file changed        -> the whole app restarts itself
#                                   (webview window closes and reopens)
#   - a template/static file
#     changed (html/css/js/json) -> every open browser tab (phone or the
#                                   desktop window) is told to reload itself
# Set this to False for a "production" run out in the greenhouse — it
# removes the watcher thread and the /dev/reload-stream route entirely.
DEV_MODE = True

WATCH_PATHS = [__file__, "templates", "static"]

_reload_listeners = []
_reload_lock = threading.Lock()


def _collect_watched_files():
    files = []
    for path in WATCH_PATHS:
        if os.path.isfile(path):
            files.append(path)
        elif os.path.isdir(path):
            for root, _, names in os.walk(path):
                for name in names:
                    files.append(os.path.join(root, name))
    return files


def _snapshot_mtimes():
    snapshot = {}
    for f in _collect_watched_files():
        try:
            snapshot[f] = os.path.getmtime(f)
        except OSError:
            pass
    return snapshot


def _broadcast_reload():
    with _reload_lock:
        for q in _reload_listeners:
            q.put("reload")


def watch_for_changes():
    """Polls source files once a second. A Python change restarts the whole
    process; a template/static change just pings connected browsers."""
    last_snapshot = _snapshot_mtimes()
    while True:
        time.sleep(1)
        current = _snapshot_mtimes()
        changed_paths = {
            p for p in set(current) | set(last_snapshot)
            if current.get(p) != last_snapshot.get(p)
        }

        if changed_paths:
            if any(p.endswith(".py") for p in changed_paths):
                print(f"[DevReload] Python change detected: {changed_paths} — restarting SmartGrow...")
                os.execv(sys.executable, [sys.executable] + sys.argv)
            else:
                print(f"[DevReload] Frontend change detected: {changed_paths} — reloading connected browsers...")
                _broadcast_reload()

        last_snapshot = current


@app.route("/dev/reload-stream")
def dev_reload_stream():
    """Server-Sent-Events stream. Each connected browser tab holds one of
    these open; watch_for_changes() pushes a 'reload' message down it
    whenever a frontend file changes. If the whole server restarts (a .py
    change), this connection simply drops — the client's own reconnect logic
    (in index.html) treats that reconnect as a signal to reload too."""
    def event_stream():
        q = queue.Queue()
        with _reload_lock:
            _reload_listeners.append(q)
        try:
            while True:
                msg = q.get()
                yield f"data: {msg}\n\n"
        finally:
            with _reload_lock:
                if q in _reload_listeners:
                    _reload_listeners.remove(q)

    return Response(event_stream(), mimetype="text/event-stream")

# Global Sensor & Automation State
sensor_data = {
    "esp32Connected": False,
    "dhtConnected": False,
    "soilConnected": False,
    "lightConnected": False,
    "temp": 0.0,
    "hum": 0.0,
    "soil": 0,
    "light": 0,
    "pump": False,
    "lightState": False,
    "fan": False,
}

last_update_time = 0

# --- Optional HTTPS support (needed for the automatic PWA install prompt) ---
# Chrome/Edge/Samsung Internet on Android will ONLY offer to install this
# dashboard (and fire the automatic "Add to Home screen" prompt) when it is
# served over HTTPS. Plain HTTP is fine for the ESP32 and for the desktop
# app window (which talks to 127.0.0.1 == "localhost", which browsers always
# treat as secure), but a phone visiting your PC's LAN IP over HTTP will
# never see the real install prompt.
#
# Drop a cert.pem + key.pem next to this script (see the setup notes you
# were given) and a second HTTPS server will automatically start alongside
# the normal HTTP one. If the files aren't there, HTTPS is simply skipped
# and everything else behaves exactly as before.


# --- Absolute static path (fixes silent 404s on manifest.json/sw.js) ---
# send_from_directory('static', ...) resolves 'static' relative to the
# process's CURRENT WORKING DIRECTORY, not this file's location. If the app
# is ever launched from a different folder (a shortcut, a different
# terminal, a packaged build), that relative lookup fails and /manifest.json
# / /sw.js quietly 404 — which is exactly what makes Chrome refuse to offer
# the install prompt even though the site is on HTTPS. Using an absolute
# path tied to __file__ makes this work no matter where it's launched from.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")


def check_pwa_files():
    """Startup diagnostic: prints exactly which required PWA files are
    missing, so a broken install prompt is obvious immediately instead of
    requiring DevTools guesswork."""
    required = [
        "manifest.json", "sw.js", "styles.css", "script.js",
        "icon-192.png", "icon-512.png",
    ]
    missing = [f for f in required if not os.path.exists(os.path.join(STATIC_DIR, f))]
    if missing:
        print(f"[PWA CHECK] WARNING — missing from {STATIC_DIR}: {', '.join(missing)}")
        print("[PWA CHECK] The app will still run, but Chrome will refuse to")
        print("[PWA CHECK] show the install prompt until these files exist there.")
    else:
        print(f"[PWA CHECK] OK — all required PWA files found in {STATIC_DIR}")


def log_to_csv(temp, hum, soil, light, pump, light_state, fan):
    """Logs real-time data or 'ERR' to sensor_data.csv every 2 seconds"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    row = [timestamp, temp, hum, soil, light, pump, light_state, fan]

    with open("sensor_data.csv", mode="a", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        if csv_file.tell() == 0:
            writer.writerow([
                "Timestamp", "Temperature_C", "Humidity_pct",
                "Soil_Moisture_pct", "Light_Lux", "Pump_Active",
                "Grow_Light_Active", "Exhaust_Fan_Active",
            ])
        writer.writerow(row)

def background_logging():
    """Background loop exclusively for CSV logging and timeout detection"""
    global sensor_data, last_update_time
    while True:
        time.sleep(2)
        
        # If we haven't received an update from the ESP32 in 5 seconds, mark as disconnected
        if time.time() - last_update_time > 5:
            sensor_data["esp32Connected"] = False
            sensor_data["dhtConnected"] = False
            sensor_data["soilConnected"] = False
            sensor_data["lightConnected"] = False

        # Save record to CSV log file
        log_to_csv(
            sensor_data["temp"] if sensor_data["dhtConnected"] else "ERR",
            sensor_data["hum"] if sensor_data["dhtConnected"] else "ERR",
            sensor_data["soil"] if sensor_data["soilConnected"] else "ERR",
            sensor_data["light"] if sensor_data["lightConnected"] else "ERR",
            sensor_data["pump"],
            sensor_data["lightState"],
            sensor_data["fan"],
        )

@app.route("/")
def index():
    return render_template("index.html", dev_mode=DEV_MODE)

@app.route("/api/sensors")
def api_sensors():
    return jsonify(sensor_data)

@app.route("/api/toggle/<sensor_name>")
def toggle_sensor(sensor_name):
    global sensor_data
    if sensor_name == "dht":
        sensor_data["dhtConnected"] = not sensor_data["dhtConnected"]
    elif sensor_name == "soil":
        sensor_data["soilConnected"] = not sensor_data["soilConnected"]
    elif sensor_name == "light":
        sensor_data["lightConnected"] = not sensor_data["lightConnected"]
    return jsonify(sensor_data)

# --- NEW: handles the manual pump/light/fan buttons in the dashboard UI ---
# (script.js already POSTs here — this route was missing, so the buttons
# updated the UI locally but the command was silently dropped.)
@app.route("/api/control", methods=["POST"])
def api_control():
    global sensor_data
    data = request.json or {}
    target = data.get("target")
    state = bool(data.get("state"))

    if target == "pump":
        sensor_data["pump"] = state
    elif target == "light":
        sensor_data["lightState"] = state
    elif target == "fan":
        sensor_data["fan"] = state
    else:
        return jsonify({"status": "error", "message": f"unknown target '{target}'"}), 400

    return jsonify({"status": "success", "sensor_data": sensor_data})

# --- NEW ROUTE: Receives live JSON from the physical ESP32 ---
@app.route("/update", methods=["POST"])
def update_from_esp32():
    global sensor_data, last_update_time
    data = request.json
    
    if data:
        last_update_time = time.time()
        
        # Map ESP32 JSON keys to Flask dictionary keys
        sensor_data["temp"] = data.get("temperature", 0.0)
        sensor_data["hum"] = data.get("humidity", 0.0)
        sensor_data["soil"] = data.get("soil_moisture", 0)
        sensor_data["esp32Connected"] = True
        # Convert "ON"/"OFF" strings from ESP32 to Booleans for Flask UI
        sensor_data["fan"] = (data.get("fan") == "ON")
        sensor_data["pump"] = (data.get("water_pump") == "ON")
        sensor_data["lightState"] = (data.get("light") == "ON")
        
        # Use the real per-sensor status the ESP32 reports (soil_connected /
        # dht_connected), falling back to True for older firmware that
        # doesn't send these fields yet.
        sensor_data["dhtConnected"] = data.get("dht_connected", True)
        sensor_data["soilConnected"] = data.get("soil_connected", True)
        sensor_data["lightConnected"] = True
        
    return jsonify({"status": "success"})

@app.route('/manifest.json')
def serve_manifest():
    return send_from_directory(STATIC_DIR, 'manifest.json', mimetype='application/manifest+json')

@app.route('/sw.js')
def serve_sw():
    return send_from_directory(STATIC_DIR, 'sw.js', mimetype='application/javascript')


@app.route("/sensor_data.csv")
def download_csv_file():
    # 1. Find the exact folder where this Python file is saved
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 2. Check if the CSV file exists in this folder
    if os.path.exists(os.path.join(current_dir, "sensor_data.csv")):
        # 3. Safely send the file to the browser
        return send_from_directory(current_dir, "sensor_data.csv", as_attachment=True)
    else:
        return "File not found! Ensure background_logging() has created sensor_data.csv", 404
    
# --- NEW ROUTE: Converts CSV to Multi-Sheet Excel ---
@app.route("/download/excel")
def download_excel_file():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(current_dir, "sensor_data.csv")
    
    if not os.path.exists(csv_path):
        return "No data to export.", 404

    wb = Workbook()
    wb.remove(wb.active) # Remove the default empty sheet

    days_data = {}
    headers = []

    # Read the existing CSV
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        try:
            headers = next(reader)
        except StopIteration:
            return "CSV is empty.", 404

        # Sort the data by date
        for row in reader:
            if not row or row[0].startswith("---"): 
                continue
            
            # Extract just the date (e.g., "2026-09-25") from the timestamp
            date_str = row[0].split(" ")[0] 
            
            if date_str not in days_data:
                days_data[date_str] = []
            days_data[date_str].append(row)

    # Create a new sheet for each date
    if days_data:
        for date_str, rows in days_data.items():
            ws = wb.create_sheet(title=date_str)
            ws.append(headers) # Put headers at the top of every sheet
            for r in rows:
                ws.append(r)
    else:
        ws = wb.create_sheet(title="Data")
        ws.append(headers)

    # Save to memory and send it to the browser
    mem = io.BytesIO()
    wb.save(mem)
    mem.seek(0)

    return send_file(
        mem,
        as_attachment=True,
        download_name="SmartGrow_Data.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

check_pwa_files()
log_thread = threading.Thread(target=background_logging, daemon=True)
log_thread.start()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), debug=False)