import os
import json
import time
from flask import Flask, Response, jsonify, render_template, request, send_from_directory
import redis

app = Flask(__name__)

# Connect to Vercel KV (Upstash Redis) using environment variables.
# Vercel automatically injects KV_URL when you link a database in their dashboard.
redis_client = redis.from_url(os.environ.get("KV_URL", "redis://localhost:6379"))

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Default state if the database is empty
DEFAULT_STATE = {
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
    "last_update_time": 0
}

def get_sensor_data():
    """Fetch the latest state from Vercel KV Redis"""
    try:
        data = redis_client.get("sensor_data")
        if data:
            state = json.loads(data)
            # Evaluate timeout logic dynamically on read (5 seconds)
            if time.time() - state.get("last_update_time", 0) > 5:
                state["esp32Connected"] = False
                state["dhtConnected"] = False
                state["soilConnected"] = False
                state["lightConnected"] = False
            return state
    except Exception as e:
        print(f"Redis Connection Error: {e}")
    
    return DEFAULT_STATE.copy()

def save_sensor_data(data):
    """Save the current state to Vercel KV Redis"""
    try:
        redis_client.set("sensor_data", json.dumps(data))
    except Exception as e:
        print(f"Redis Connection Error: {e}")

@app.route("/")
def index():
    return render_template("index.html", dev_mode=False)

@app.route("/api/sensors")
def api_sensors():
    return jsonify(get_sensor_data())

@app.route("/api/control", methods=["POST"])
def api_control():
    data = request.json or {}
    target = data.get("target")
    state = bool(data.get("state"))

    current_data = get_sensor_data()

    if target == "pump":
        current_data["pump"] = state
    elif target == "light":
        current_data["lightState"] = state
    elif target == "fan":
        current_data["fan"] = state
    else:
        return jsonify({"status": "error", "message": f"unknown target '{target}'"}), 400

    save_sensor_data(current_data)
    return jsonify({"status": "success", "sensor_data": current_data})

@app.route("/update", methods=["POST"])
def update_from_esp32():
    data = request.json
    if data:
        current_data = get_sensor_data()
        
        current_data["last_update_time"] = time.time()
        current_data["temp"] = data.get("temperature", 0.0)
        current_data["hum"] = data.get("humidity", 0.0)
        current_data["soil"] = data.get("soil_moisture", 0)
        current_data["esp32Connected"] = True
        
        current_data["fan"] = (data.get("fan") == "ON")
        current_data["pump"] = (data.get("water_pump") == "ON")
        current_data["lightState"] = (data.get("light") == "ON")
        
        current_data["dhtConnected"] = data.get("dht_connected", True)
        current_data["soilConnected"] = data.get("soil_connected", True)
        current_data["lightConnected"] = True
        
        save_sensor_data(current_data)
        
    return jsonify({"status": "success"})

@app.route('/manifest.json')
def serve_manifest():
    return send_from_directory(STATIC_DIR, 'manifest.json', mimetype='application/manifest+json')

@app.route('/sw.js')
def serve_sw():
    return send_from_directory(STATIC_DIR, 'sw.js', mimetype='application/javascript')

# Vercel uses a read-only filesystem. Local CSVs cannot be generated or downloaded.
@app.route("/sensor_data.csv")
@app.route("/download/excel")
def disabled_exports():
    return "Data exports are disabled in the Vercel serverless environment due to read-only filesystem constraints.", 403