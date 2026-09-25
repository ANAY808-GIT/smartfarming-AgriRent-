#!/usr/bin/env python3
"""
AgriRent - Farm Machinery Marketplace REST API Server
Module: api/server.py

Zero-dependency Python REST server using standard library 'http.server'.
Run with:
    python api/server.py
Access API at:
    http://localhost:5000/api/health
    http://localhost:5000/api/machinery
    http://localhost:5000/api/bookings
    http://localhost:5000/api/stats
    http://localhost:5000/api/weather
"""

import sys
import os
import json
import urllib.parse
import base64
import mimetypes
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime

PORT = 5000
DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data.json')
UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'uploads')
os.makedirs(UPLOADS_DIR, exist_ok=True)

def load_data():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                d = json.load(f)
                if "uploads" not in d:
                    d["uploads"] = []
                return d
        except Exception as e:
            print(f"[Error loading data.json] {e}")
    return {"machinery": [], "bookings": [], "requests": [], "uploads": []}

def save_data(data):
    try:
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[Error saving data.json] {e}")

class AgriRestRequestHandler(BaseHTTPRequestHandler):

    def _set_cors_headers(self, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_cors_headers(204)

    def _send_json(self, status, payload):
        self._set_cors_headers(status)
        response_bytes = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.wfile.write(response_bytes)

    def _read_json_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > 0:
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                return json.loads(body)
            except json.JSONDecodeError:
                return None
        return {}

    # ==========================================
    # GET HANDLER
    # ==========================================
    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path.rstrip('/')
        query_params = urllib.parse.parse_qs(parsed_url.query)

        data = load_data()

        # 1. Health check
        if path == '/api/health' or path == '/api':
            return self._send_json(200, {
                "status": "online",
                "service": "AgriRent Python REST Backend",
                "version": "2.0.0",
                "timestamp": datetime.now().isoformat(),
                "endpoints": [
                    "/api/machinery",
                    "/api/bookings",
                    "/api/requests",
                    "/api/stats",
                    "/api/weather",
                    "/api/hubs"
                ]
            })

        # 2. Machinery list: GET /api/machinery
        if path == '/api/machinery':
            items = data.get("machinery", [])
            category = query_params.get("category", [None])[0]
            search = query_params.get("search", [None])[0]
            max_price = query_params.get("maxPrice", [None])[0]

            if category and category != 'all':
                items = [m for m in items if m.get("category") == category]
            if search:
                q = search.lower().strip()
                items = [m for m in items if q in m.get("name", "").lower() or q in m.get("tag", "").lower() or q in m.get("hub", "").lower()]
            if max_price:
                try:
                    limit = float(max_price)
                    items = [m for m in items if float(m.get("dailyRate", 0)) <= limit]
                except ValueError:
                    pass

            return self._send_json(200, {
                "status": 200,
                "success": True,
                "count": len(items),
                "data": items
            })

        # 3. Single machine: GET /api/machinery/<id>
        if path.startswith('/api/machinery/'):
            machine_id = path.split('/')[-1]
            items = data.get("machinery", [])
            found = next((m for m in items if m.get("id") == machine_id), None)
            if found:
                return self._send_json(200, {"status": 200, "success": True, "data": found})
            return self._send_json(404, {"status": 404, "success": False, "message": f"Machine '{machine_id}' not found."})

        # 4. Bookings: GET /api/bookings
        if path == '/api/bookings':
            bookings = data.get("bookings", [])
            return self._send_json(200, {"status": 200, "success": True, "count": len(bookings), "data": bookings})

        # 5. Rental Requests: GET /api/requests
        if path == '/api/requests':
            requests = data.get("requests", [])
            return self._send_json(200, {"status": 200, "success": True, "count": len(requests), "data": requests})

        # 6. Analytics Stats: GET /api/stats
        if path == '/api/stats':
            requests = data.get("requests", [])
            confirmed = [r for r in requests if r.get("status") == "Accepted"]
            total_revenue = sum([float(r.get("totalAmount", 0)) for r in confirmed]) + 25400

            stats_data = {
                "totalEarnings": total_revenue,
                "formattedEarnings": f"₹{total_revenue:,.0f}",
                "activeRentals": len([r for r in requests if r.get("status") == "Pending"]) + 2,
                "completedRentals": len(confirmed) + 18,
                "averageRating": 4.8,
                "monthlyRevenue": [
                    {"month": "Jan", "amount": 14000},
                    {"month": "Feb", "amount": 19500},
                    {"month": "Mar", "amount": 22000},
                    {"month": "Apr", "amount": total_revenue}
                ]
            }
            return self._send_json(200, {"status": 200, "success": True, "data": stats_data})

        # 7. Agricultural Weather REST: GET /api/weather
        if path == '/api/weather':
            weather_data = {
                "temperature": 29,
                "humidity": 54,
                "windSpeed": 8.0,
                "precipitation": 0,
                "condition": "Partly Cloudy",
                "spraying": {
                    "status": "Optimal",
                    "color": "text-lightgreen-400",
                    "advice": "Wind speed under 10 km/h and dry canopy. Perfect conditions for drone spraying."
                },
                "harvesting": {
                    "status": "Ideal (Dry Grain)"
                },
                "forecastMaxTemp": 33,
                "forecastMinTemp": 22,
                "rainChance": 10
            }
            return self._send_json(200, {"status": 200, "success": True, "data": weather_data})

        # 8. Regional Hubs: GET /api/hubs
        if path == '/api/hubs':
            hubs = [
                {"id": "hub-rampur", "name": "Rampur Village Hub", "district": "Rampur", "lat": 28.8080, "lon": 79.0270, "capacity": 14},
                {"id": "hub-kisan-seva", "name": "Kisan Seva Central Hub", "district": "Moradabad", "lat": 28.8386, "lon": 78.7733, "capacity": 22},
                {"id": "hub-green-valley", "name": "Green Valley Agro Hub", "district": "Bareilly", "lat": 28.3670, "lon": 79.4304, "capacity": 18},
                {"id": "hub-agritech", "name": "AgriTech Regional Center", "district": "Nainital", "lat": 29.3919, "lon": 79.4542, "capacity": 9}
            ]
            return self._send_json(200, {"status": 200, "success": True, "count": len(hubs), "data": hubs})

        # 9. List Uploaded Files: GET /api/uploads
        if path == '/api/uploads':
            uploads = data.get("uploads", [])
            return self._send_json(200, {"status": 200, "success": True, "count": len(uploads), "data": uploads})

        # 10. Speech Languages: GET /api/speech/languages
        if path == '/api/speech/languages':
            langs = [
                {"code": "en-IN", "name": "English (India)", "native": "Indian English", "flag": "🇮🇳"},
                {"code": "hi-IN", "name": "Hindi", "native": "हिन्दी", "flag": "🇮🇳"},
                {"code": "pa-IN", "name": "Punjabi", "native": "ਪੰਜਾਬੀ", "flag": "🇮🇳"},
                {"code": "mr-IN", "name": "Marathi", "native": "मराठी", "flag": "🇮🇳"},
                {"code": "te-IN", "name": "Telugu", "native": "తెలుగు", "flag": "🇮🇳"},
                {"code": "ta-IN", "name": "Tamil", "native": "தமிழ்", "flag": "🇮🇳"},
                {"code": "bn-IN", "name": "Bengali", "native": "বাংলা", "flag": "🇮🇳"},
                {"code": "en-US", "name": "English (US)", "native": "English", "flag": "🇺🇸"}
            ]
            return self._send_json(200, {"status": 200, "success": True, "data": langs})

        # 10. Serve Static Uploaded Files: GET /uploads/<filename>
        if path.startswith('/uploads/'):
            filename = os.path.basename(path)
            file_path = os.path.join(UPLOADS_DIR, filename)
            if os.path.exists(file_path) and os.path.isfile(file_path):
                mime_type, _ = mimetypes.guess_type(file_path)
                mime_type = mime_type or 'application/octet-stream'
                try:
                    with open(file_path, 'rb') as f:
                        content = f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', mime_type)
                    self.send_header('Content-Length', str(len(content)))
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(content)
                    return
                except Exception as e:
                    return self._send_json(500, {"status": 500, "success": False, "message": f"Error reading file: {e}"})
            return self._send_json(404, {"status": 404, "success": False, "message": f"File '{filename}' not found."})

        # 404 fallback
        return self._send_json(404, {"status": 404, "success": False, "message": f"Endpoint '{path}' not found."})

    # ==========================================
    # POST HANDLER
    # ==========================================
    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path.rstrip('/')
        body = self._read_json_body()
        data = load_data()

        # 1. Add Machinery: POST /api/machinery
        if path == '/api/machinery':
            if not body.get("name") or not body.get("dailyRate"):
                return self._send_json(400, {"status": 400, "success": False, "message": "name and dailyRate are required fields."})

            new_machine = {
                "id": body.get("id") or f"custom-{int(datetime.now().timestamp()*1000)}",
                "name": body.get("name"),
                "category": body.get("category", "tractors"),
                "image": body.get("image", "images/tractor.png"),
                "dailyRate": int(body.get("dailyRate")),
                "hourlyRate": int(body.get("hourlyRate", int(body.get("dailyRate")) // 6)),
                "status": "Available Now",
                "statusBg": "bg-lightgreen-400 text-darkgreen-950",
                "hp": body.get("hp", "45 HP"),
                "fuel": body.get("fuel", "4.0 L/hr"),
                "distance": body.get("distance", "1.5 km away"),
                "hub": body.get("hub", "Local Village Hub"),
                "district": body.get("district", "Rampur"),
                "rating": 5.0,
                "reviews": 1,
                "tag": body.get("tag", "Farmer Listed"),
                "description": body.get("description", "High quality verified farm equipment."),
                "crops": body.get("crops", ["paddy", "wheat"]),
                "activities": body.get("activities", ["tillage"]),
                "owner": body.get("owner", "Registered Farmer"),
                "createdAt": datetime.now().isoformat()
            }

            data["machinery"].insert(0, new_machine)
            save_data(data)

            return self._send_json(201, {"status": 201, "success": True, "message": "Machinery listed successfully.", "data": new_machine})

        # 2. Create Booking: POST /api/bookings
        if path == '/api/bookings':
            if not body.get("machineId") or not body.get("date"):
                return self._send_json(400, {"status": 400, "success": False, "message": "machineId and date are required."})

            new_booking = {
                "id": body.get("id") or f"AGRI-2026-{int(datetime.now().timestamp()) % 10000}",
                "machineId": body.get("machineId"),
                "machineName": body.get("machineName", "Farm Machine"),
                "date": body.get("date"),
                "duration": int(body.get("duration", 1)),
                "location": body.get("location", "Local Farm"),
                "farmerName": body.get("farmerName", "Registered Farmer"),
                "totalCost": int(body.get("totalCost", 0)),
                "status": "Confirmed",
                "createdAt": datetime.now().isoformat()
            }

            data["bookings"].insert(0, new_booking)

            # Auto-create owner request
            new_req = {
                "id": f"REQ-{int(datetime.now().timestamp()) % 1000}",
                "farmerName": new_booking["farmerName"],
                "machineId": new_booking["machineId"],
                "machineName": new_booking["machineName"],
                "dates": f"{new_booking['date']} ({new_booking['duration']} Days)",
                "location": new_booking["location"],
                "totalAmount": new_booking["totalCost"],
                "status": "Pending"
            }
            data["requests"].insert(0, new_req)

            save_data(data)
            return self._send_json(201, {"status": 201, "success": True, "message": "Booking created.", "data": new_booking})

        # 3. AI / Chatbot Endpoint: POST /api/chat
        if path == '/api/chat':
            user_msg = body.get("message", "").lower().strip()
            reply = "I am Kisan Mitra AI. How can I assist your farm machinery needs today?"
            suggestions = ["Tractor for paddy", "Combine harvester rate", "How to list equipment"]

            if "tractor" in user_msg or "paddy" in user_msg or "tillage" in user_msg:
                reply = "🌾 For paddy land preparation, our 50 HP Heavy Duty Tractor (₹1,200/day) with a Rotary Tiller (₹950/day) achieves 98% puddling efficiency across 5 acres."
                suggestions = ["Book Tractor", "Calculate 3-day cost", "Do I need operator?"]
            elif "harvest" in user_msg:
                reply = "🚜 Combine Harvester (75 HP) is available at ₹3,500/day or ₹600/hr with certified operator option."
                suggestions = ["Book Harvester", "Harvester availability", "Harvester fuel consumption"]
            elif "list" in user_msg or "earn" in user_msg:
                reply = "💰 Switch to Machine Owner mode and click '+ List Your Machinery' to earn ~₹25,000/month by renting to neighboring farms."
                suggestions = ["Switch to Owner Mode", "Open Listing Form"]

            return self._send_json(200, {
                "status": 200,
                "success": True,
                "data": {
                    "reply": reply,
                    "suggestions": suggestions
                }
            })

        # 4. Upload Image/File: POST /api/upload
        if path == '/api/upload':
            raw_data = body.get("data", "")
            original_filename = body.get("filename", "upload.jpg")
            category = body.get("category", "machinery")
            mime_type = body.get("mimeType", "image/jpeg")

            if not raw_data:
                return self._send_json(400, {"status": 400, "success": False, "message": "File data (base64) is required."})

            try:
                if "," in raw_data:
                    header, base64_str = raw_data.split(",", 1)
                    if "image/" in header or "application/" in header:
                        guessed = header.split(";")[0].replace("data:", "")
                        if guessed:
                            mime_type = guessed
                else:
                    base64_str = raw_data

                binary_content = base64.b64decode(base64_str)
                timestamp = int(datetime.now().timestamp())
                safe_name = original_filename.replace(" ", "_").replace("/", "").replace("\\", "")
                saved_filename = f"upload_{timestamp}_{safe_name}"
                saved_path = os.path.join(UPLOADS_DIR, saved_filename)

                with open(saved_path, "wb") as f:
                    f.write(binary_content)

                file_record = {
                    "fileId": f"file_{timestamp}_{len(data.get('uploads', [])) + 1}",
                    "filename": saved_filename,
                    "originalName": original_filename,
                    "mimeType": mime_type,
                    "size": len(binary_content),
                    "originalSize": body.get("originalSize", len(binary_content)),
                    "compressedSize": len(binary_content),
                    "category": category,
                    "url": f"/uploads/{saved_filename}",
                    "uploadedAt": datetime.now().isoformat()
                }

                if "uploads" not in data:
                    data["uploads"] = []
                data["uploads"].insert(0, file_record)
                save_data(data)

                return self._send_json(201, {
                    "status": 201,
                    "success": True,
                    "message": "File uploaded and stored successfully.",
                    "data": file_record
                })
            except Exception as e:
                return self._send_json(500, {"status": 500, "success": False, "message": f"Upload processing failed: {str(e)}"})

        # 5. Speech Transcribe Relay: POST /api/speech/transcribe
        if path == '/api/speech/transcribe':
            audio_text = body.get("text", "")
            lang = body.get("lang", "en-IN")
            lower = audio_text.lower()
            equipment = None
            if any(w in lower for w in ["tractor", "ट्रैक्टर", "traktor", "trator"]):
                equipment = "tractor"
            elif any(w in lower for w in ["harvester", "combine", "हार्वेस्टर", "कंबाइन"]):
                equipment = "harvester"
            elif any(w in lower for w in ["rotavator", "tiller", "रोटावेटर", "टिलर"]):
                equipment = "rotavator"
            elif any(w in lower for w in ["drone", "ड्रोन"]):
                equipment = "drone"
            elif any(w in lower for w in ["spray", "sprayer", "स्प्रेयर", "स्प्रे"]):
                equipment = "sprayer"
            elif any(w in lower for w in ["seeder", "seed drill", "सीडर", "बुवाई"]):
                equipment = "seeder"

            return self._send_json(200, {
                "status": 200,
                "success": True,
                "transcript": audio_text,
                "normalized": equipment or audio_text,
                "matchedEquipment": equipment,
                "lang": lang,
                "confidence": 0.98
            })

        return self._send_json(404, {"status": 404, "success": False, "message": f"Endpoint '{path}' not found."})

    # ==========================================
    # PUT HANDLER
    # ==========================================
    def do_PUT(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path.rstrip('/')
        body = self._read_json_body()
        data = load_data()

        # Update Request Status: PUT /api/requests/<id>
        if path.startswith('/api/requests/'):
            req_id = path.split('/')[-1]
            requests = data.get("requests", [])
            req = next((r for r in requests if r.get("id") == req_id), None)
            if not req:
                return self._send_json(404, {"status": 404, "success": False, "message": f"Request '{req_id}' not found."})

            new_status = body.get("status", "Accepted")
            req["status"] = new_status
            save_data(data)
            return self._send_json(200, {"status": 200, "success": True, "message": f"Request {req_id} updated to {new_status}.", "data": req})

        return self._send_json(404, {"status": 404, "success": False, "message": f"Endpoint '{path}' not found."})

    # ==========================================
    # DELETE HANDLER
    # ==========================================
    def do_DELETE(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path.rstrip('/')
        data = load_data()

        if path.startswith('/api/machinery/'):
            machine_id = path.split('/')[-1]
            initial_count = len(data.get("machinery", []))
            data["machinery"] = [m for m in data.get("machinery", []) if m.get("id") != machine_id]

            if len(data["machinery"]) == initial_count:
                return self._send_json(404, {"status": 404, "success": False, "message": f"Machine '{machine_id}' not found."})

            save_data(data)
            return self._send_json(200, {"status": 200, "success": True, "message": f"Machine '{machine_id}' deleted."})

        return self._send_json(404, {"status": 404, "success": False, "message": f"Endpoint '{path}' not found."})

    def log_message(self, format, *args):
        # Clean terminal output formatting
        try:
            sys.stderr.write(f"[{datetime.now().strftime('%H:%M:%S')}] {args[0]} - {args[1]}\n")
        except Exception:
            pass

def run_server():
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
            sys.stderr.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass

    server_address = ('', PORT)
    httpd = HTTPServer(server_address, AgriRestRequestHandler)
    print("=" * 65)
    print(f"[*] AgriRent REST API Server running at http://localhost:{PORT}")
    print(f"[*] Available REST Endpoints:")
    print(f"    - GET    http://localhost:{PORT}/api/health")
    print(f"    - GET    http://localhost:{PORT}/api/machinery")
    print(f"    - POST   http://localhost:{PORT}/api/machinery")
    print(f"    - GET    http://localhost:{PORT}/api/bookings")
    print(f"    - POST   http://localhost:{PORT}/api/bookings")
    print(f"    - GET    http://localhost:{PORT}/api/requests")
    print(f"    - PUT    http://localhost:{PORT}/api/requests/<id>")
    print(f"    - GET    http://localhost:{PORT}/api/stats")
    print(f"    - GET    http://localhost:{PORT}/api/weather")
    print(f"    - POST   http://localhost:{PORT}/api/chat")
    print("=" * 65)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping AgriRent server...")
        httpd.server_close()

if __name__ == '__main__':
    run_server()
