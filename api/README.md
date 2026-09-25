# 🚜 AgriRent API Suite Documentation

Welcome to the **AgriRent API Suite** — a full-stack collection of modern web APIs designed for smart agricultural machinery and equipment rental.

This folder (`/api`) provides five core API modules:
1. **Geolocation API** (`api/geolocation.js`)
2. **REST API** (`api/rest.js` & Python backend `api/server.py`)
3. **AI / Chatbot API** (`api/chatbot.js` - Kisan Mitra AI)
4. **Image & File Upload API** (`api/upload.js` & backend `POST /api/upload`)
5. **Speech-to-Text API** (`api/speech.js` - Voice Search for Farmers)
6. **Unified API Gateway** (`api/index.js`)

---

## 📂 Directory Structure

```text
api/
├── geolocation.js   # HTML5 GPS, OpenStreetMap reverse geocoding & Haversine distance
├── rest.js          # REST Client with persistent data engine & Open-Meteo weather
├── chatbot.js       # Kisan Mitra AI engine, agronomic NLP, voice input & LLM connector
├── upload.js        # HTML5 Canvas compression, validation, dropzones & multi-mode upload
├── speech.js        # Speech-to-Text API, Web Speech engine, regional languages & normalizer
├── index.js         # Unified entrypoint (window.AgriRentAPI)
├── server.py        # Standalone Python HTTP REST API Server (Zero pip dependencies)
├── data.json        # Persistent JSON storage for machinery, bookings & requests
└── README.md        # Complete API reference & integration documentation
uploads/             # Server-side physical uploaded files storage directory
```

---

## 1. 📍 Geolocation API (`api/geolocation.js`)

The **AgriGeolocationAPI** leverages browser HTML5 GPS, OpenStreetMap Nominatim reverse geocoding, and Haversine formula calculation.

### Key Methods

```javascript
// 1. Check if browser supports Geolocation
window.AgriRentAPI.geolocation.isSupported();

// 2. Request live GPS coordinates and reverse geocoded village/district
const loc = await window.AgriRentAPI.geolocation.getCurrentPosition();
console.log(loc.coords.latitude, loc.coords.longitude);
console.log(loc.address.locality, loc.address.district, loc.address.state);
console.log('Nearest Hub:', loc.nearestHub.hub.name, loc.nearestHub.distanceKm, 'km');

// 3. Calculate distance between two coordinates (Haversine formula in km)
const km = window.AgriRentAPI.geolocation.calculateDistance(28.8080, 79.0270, 28.3670, 79.4304);

// 4. Update machinery list with real-time road distance from user GPS
const updatedMachinery = window.AgriRentAPI.geolocation.calculateMachineryDistances(machineryList);
```

### Features
- **High Accuracy GPS**: Direct integration with `navigator.geolocation`.
- **Reverse Geocoding**: Converts raw (lat, lon) into Indian village, town, district, and PIN code.
- **Regional Hub Matching**: Automatically maps user to the closest of 6 regional machinery hubs (Rampur, Moradabad, Bareilly, Nainital, Ludhiana, Karnal).
- **Proximity Sorting**: Enables "Distance: Nearest First" filtering across all equipment.

---

## 2. 📡 REST API (`api/rest.js` & `api/server.py`)

The **AgriRestAPI** provides standard RESTful endpoints. It works in dual-mode:
1. **In-Browser Persistent Engine** (Default): Uses `localStorage` so everything works instantly without requiring a server.
2. **Python REST Server**: If `python api/server.py` is running on port 5000, it communicates via HTTP/JSON.

### Starting the Python REST Server

```bash
# In your terminal or command prompt:
python api/server.py
```
Server runs at `http://localhost:5000`.

### REST Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check & active endpoint directory |
| `GET` | `/api/machinery` | List equipment (filter by `category`, `search`, `maxPrice`, `sort`) |
| `GET` | `/api/machinery/:id` | Get detailed specifications of single machine |
| `POST` | `/api/machinery` | Create & publish new machine listing |
| `PUT` | `/api/machinery/:id` | Update machine details |
| `DELETE` | `/api/machinery/:id` | Delete machine listing |
| `GET` | `/api/bookings` | Retrieve user booking history |
| `POST` | `/api/bookings` | Create new equipment booking |
| `DELETE` | `/api/bookings/:id` | Cancel an active booking |
| `GET` | `/api/requests` | Retrieve owner incoming rental requests |
| `PUT` | `/api/requests/:id` | Update request status (`Accepted` / `Rejected`) |
| `GET` | `/api/stats` | Owner revenue analytics, rental metrics & chart data |
| `GET` | `/api/weather` | Live agricultural weather & spraying advisory (Open-Meteo) |
| `POST` | `/api/chat` | REST AI endpoint for Kisan Mitra chatbot queries |
| `POST` | `/api/upload` | Upload image or document with base64 payload & metadata |
| `GET` | `/api/uploads` | List recent uploaded files and metadata |
| `GET` | `/uploads/:filename` | Direct binary static delivery of stored uploaded files |

### Example JavaScript REST Calls

```javascript
// Fetch all tractors under ₹1,500/day
const res = await window.AgriRentAPI.rest.machinery.getAll({
    category: 'tractors',
    maxPrice: 1500,
    sort: 'price-low'
});
console.log(res.data);

// Create a new booking
const booking = await window.AgriRentAPI.rest.bookings.create({
    machineId: 'tractor',
    machineName: 'Heavy Duty Tractor',
    date: '2026-10-05',
    duration: 3,
    location: 'Rampur North Farm',
    farmerName: 'Ramesh Kumar',
    totalCost: 3600
});

// Get Agricultural Weather Advisory
const weather = await window.AgriRentAPI.rest.weather.getAgriWeather(28.8080, 79.0270);
console.log(weather.data.temperature + '°C', weather.data.spraying.status);
```

---

## 3. 🤖 AI / Chatbot API (`api/chatbot.js` - Kisan Mitra AI)

An intelligent conversational agent built specifically for agricultural machinery, soil preparation, crop timelines, and rental guidance.

### Capabilities
- **Agronomic Intent Recognition**:
  - Recommends tractors and rotary tillers for paddy puddling, cotton tillage, sugarcane, and wheat.
  - Compares Combine Harvesters vs manual labor.
  - Suggests AI Drone Sprayers vs Power Mist Sprayers based on field size.
- **REST Data-Aware**: Directly queries available machinery and live pricing to embed interactive "Book Now" action chips inside chat messages.
- **Agricultural Weather Advisory**: Checks live wind speed and precipitation to guide farmers whether it is safe to spray chemicals today.
- **Hands-Free Voice Recognition**: Integrated Web Speech API (`startVoiceInput()`) for voice commands.
- **Extensible LLM Integration**: Can optionally connect to cloud AI models (Google Gemini API, Hugging Face Inference API, or local Ollama).

### Example Usage

```javascript
// Query Kisan Mitra AI
const reply = await window.AgriRentAPI.chatbot.sendMessage("Best tractor for 5 acres paddy field?");
console.log(reply.reply);
console.log(reply.suggestions);

// Start voice input
window.AgriRentAPI.chatbot.startVoiceInput((recognizedText) => {
    console.log('Farmer spoke:', recognizedText);
});
```

---

## 4. 📁 Image & File Upload API (`api/upload.js` & `POST /api/upload`)

The **AgriUploadAPI** provides a complete solution for machinery photos, land records, vehicle RC papers, and farmer identity documents.

### Key Capabilities
- **Client-Side Compression**: Automatically compresses high-resolution camera photos (e.g. 10MB phone camera shots down to ~250KB WebP/JPEG) using HTML5 Canvas before network transmission, saving rural cellular bandwidth.
- **Drag-and-Drop Dropzone Engine**: Reusable dropzone listener (`setupDropzone(element, onFileSelected)`) with drag-hover animations and file validation.
- **Dual-Mode Upload Pipeline**:
  - **Backend REST Server**: When `python api/server.py` is active, transmits base64 data to `POST /api/upload`, writes the file to the `./uploads/` physical folder, and serves it publicly at `http://localhost:5000/uploads/<filename>`.
  - **In-Browser Fallback Engine**: If the Python server is offline, saves the data URI in browser `localStorage` under `agrirent_uploads` so the app functions 100% offline.
- **Strict File Validation**: Enforces MIME type checks (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`) and maximum file size limits (default 15MB).

### Example JavaScript Upload Calls

```javascript
// 1. Client-Side Image Compression
const { file: compressedFile, savedRatio } = await window.AgriRentAPI.upload.compressImage(rawFile, {
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 0.82,
    mimeType: 'image/jpeg'
});
console.log(`Saved ${savedRatio}% file size before upload`);

// 2. Upload File (Machinery Image / Document)
const result = await window.AgriRentAPI.upload.uploadFile(compressedFile, {
    category: 'machinery',
    description: 'Mahindra 575 DI Front View'
});

console.log('Upload Result:', result);
// result => {
//   success: true,
//   fileId: "file_1727202300000_a1b2c",
//   filename: "1727202300000_tractor.jpg",
//   url: "http://localhost:5000/uploads/1727202300000_tractor.jpg",
//   size: 142850,
//   mimeType: "image/jpeg",
//   storage: "disk"
// }

// 3. Setup a Drag-and-Drop Dropzone
window.AgriRentAPI.upload.setupDropzone(document.getElementById('my-dropzone'), (file) => {
    console.log('Farmer dropped file:', file.name);
});

// 4. Retrieve Upload History
const recentUploads = await window.AgriRentAPI.upload.getRecentUploads(10);
console.log('Recent uploads:', recentUploads);
```

### Backend REST Upload Endpoints

#### `POST /api/upload`
- **Request Body (JSON)**:
  ```json
  {
    "filename": "john_deere_5050.jpg",
    "contentType": "image/jpeg",
    "data": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...",
    "category": "machinery",
    "description": "50HP tractor image"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "fileId": "file_1727202400000_9f2a1b",
    "filename": "1727202400000_john_deere_5050.jpg",
    "url": "http://localhost:5000/uploads/1727202400000_john_deere_5050.jpg",
    "size": 182390,
    "mimeType": "image/jpeg",
    "storage": "disk",
    "category": "machinery"
  }
  ```

#### `GET /uploads/:filename`
Direct binary static file serving with automatic MIME detection (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`).

---

## 5. 🎙️ Speech-to-Text API (`api/speech.js` & Voice Search)

The **AgriSpeechAPI** brings accessibility to rural farmers who prefer speaking rather than typing complex machinery names. It integrates browser HTML5 Web Speech recognition, multilingual regional models, and a smart agricultural phonetic normalizer.

### Key Capabilities
- **HTML5 Web Speech Recognition**: High-accuracy real-time speech engine (`window.SpeechRecognition` / `window.webkitSpeechRecognition`).
- **Multilingual Support for Indian Agriculture**:
  - `en-IN`: Indian English (default)
  - `hi-IN`: हिन्दी (Hindi)
  - `pa-IN`: ਪੰਜਾਬੀ (Punjabi)
  - `mr-IN`: मराठी (Marathi)
  - `te-IN`: తెలుగు (Telugu)
  - `ta-IN`: தமிழ் (Tamil)
  - `bn-IN`: বাংলা (Bengali)
  - `en-US`: English (US)
- **Real-Time Interim & Final Transcription**: Streams spoken syllables live into the search input while the farmer speaks, followed by immediate catalog filtering upon sentence completion.
- **Agricultural Phonetic & Entity Normalizer**: Automatically resolves common farmer pronunciations and bilingual dialect variations to fleet catalogue categories:
  - Spoken `"ट्रैक्टर"` or `"trator"` ➔ Maps to `"tractor"`
  - Spoken `"हार्वेस्टर"` or `"combine"` ➔ Maps to `"harvester"`
  - Spoken `"रोटावेटर"` or `"rotary tiller"` ➔ Maps to `"rotavator"`
  - Spoken `"ड्रोन स्प्रेयर"` or `"mist sprayer"` ➔ Maps to `"drone"` / `"sprayer"`
  - Spoken `"बीज बोने की मशीन"` ➔ Maps to `"seeder"`
- **Direct Search Input Voice Binder (`bindSearchInput`)**: Auto-binds any search bar and mic button with interactive listening indicators, pulsing animations, and instant results.
- **Zero-Failure Fallback Simulator**: If a browser environment blocks microphone access or lacks SSL, provides interactive spoken voice sample prompts so farmers and evaluators can test voice search without friction.

### Example JavaScript Speech-to-Text Calls

```javascript
// 1. Check browser speech support
if (window.AgriRentAPI.speech.isSupported()) {
    console.log('Web Speech API is available');
}

// 2. Switch recognition language (e.g. Hindi)
window.AgriRentAPI.speech.setLanguage('hi-IN');

// 3. Start voice recognition
window.AgriRentAPI.speech.startListening({
    lang: 'en-IN',
    interimResults: true,
    onStart: () => console.log('Microphone listening...'),
    onInterim: (liveText) => {
        document.getElementById('catalog-search').value = liveText;
    },
    onResult: (result) => {
        console.log('Final Transcript:', result.transcript);
        console.log('Normalized Term:', result.normalized);
        console.log('Matched Category:', result.matchedCategory);
        // Execute search filter
        filterCatalog();
    },
    onError: (err) => console.warn('Voice error:', err.message),
    onEnd: () => console.log('Listening stopped')
});

// 4. Normalize agricultural query
const parsed = window.AgriRentAPI.speech.normalizeAgriQuery('Find 50hp tractor for paddy field');
console.log(parsed.normalized, parsed.canonicalName); // "tractor", "Heavy Duty Tractor"

// 5. Automatic Search Input Voice Binding
window.AgriRentAPI.speech.bindSearchInput('#catalog-search', {
    buttonEl: '#catalog-voice-search-btn',
    onSearch: (searchTerm, result) => {
        filterCatalog();
    }
});
```

---

## 6. ⚡ Unified Gateway (`window.AgriRentAPI`)

`api/index.js` brings all modules together into a unified namespace:

```javascript
// Access any service directly:
window.AgriRentAPI.geolocation   // GPS & regional hubs
window.AgriRentAPI.rest          // Equipment, bookings & speech endpoints
window.AgriRentAPI.chatbot       // Kisan Mitra AI
window.AgriRentAPI.upload        // Image/file upload & compression
window.AgriRentAPI.speech        // Speech-to-Text API & voice normalizer

// Check system diagnostics
const report = window.AgriRentAPI.getDiagnostics();
console.log(report);

// Listen for API Ready event
window.addEventListener('agrirent:api-ready', (e) => {
    console.log('AgriRent APIs Ready:', e.detail);
});
```
