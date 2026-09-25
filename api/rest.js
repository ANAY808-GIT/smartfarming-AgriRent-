/**
 * AgriRent - REST API Client & Persistent Data Service
 * Module: api/rest.js
 * 
 * Implements RESTful architecture for:
 * - /api/machinery (GET, POST, PUT, DELETE)
 * - /api/bookings (GET, POST, DELETE)
 * - /api/requests (GET, POST, PUT)
 * - /api/stats (GET)
 * - /api/weather (GET - Open-Meteo REST endpoint)
 * 
 * Works seamlessly in both Standalone Browser Mode (using localStorage persistence & simulated HTTP envelopes)
 * and Backend Mode (connecting to Python HTTP REST server at http://localhost:5000/api when available).
 */

class AgriRestAPI {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'http://localhost:5000/api';
        this.backendActive = false;
        this.storagePrefix = 'agrirent_';
        this.checkBackendHealth();
    }

    /**
     * Check if local Python REST API server is running
     */
    async checkBackendHealth() {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 1200);
            const res = await fetch(`${this.baseUrl}/health`, { signal: controller.signal });
            clearTimeout(timer);
            if (res.ok) {
                this.backendActive = true;
                console.log('✅ [AgriRestAPI] Connected to Python REST backend server at', this.baseUrl);
            } else {
                this.backendActive = false;
            }
        } catch (e) {
            this.backendActive = false;
            // Silent fallback to local storage REST engine
        }
        return this.backendActive;
    }

    /**
     * Helper to simulate HTTP REST response envelope
     */
    _createResponse(status, data, message = 'Success') {
        const isSuccess = status >= 200 && status < 300;
        return {
            status: status,
            success: isSuccess,
            timestamp: new Date().toISOString(),
            message: message,
            data: data
        };
    }

    // ==========================================
    // 1. MACHINERY REST CONTROLLER (/api/machinery)
    // ==========================================
    get machinery() {
        const self = this;
        return {
            /**
             * GET /api/machinery
             * Optional query params: category, search, minPrice, maxPrice, sort, userLat, userLon
             */
            async getAll(params = {}) {
                if (self.backendActive) {
                    try {
                        const query = new URLSearchParams(params).toString();
                        const res = await fetch(`${self.baseUrl}/machinery?${query}`);
                        if (res.ok) return await res.json();
                    } catch (e) {
                        console.warn('[AgriRestAPI] Backend request failed, falling back to local storage engine');
                    }
                }

                // Local REST Engine
                let items = self._getLocalData('machinery');
                if (!items || items.length === 0) {
                    items = self._getDefaultMachinery();
                    self._setLocalData('machinery', items);
                }

                // Filters
                if (params.category && params.category !== 'all') {
                    items = items.filter(m => m.category === params.category);
                }
                if (params.search) {
                    const q = params.search.toLowerCase().trim();
                    items = items.filter(m => 
                        m.name.toLowerCase().includes(q) ||
                        m.tag.toLowerCase().includes(q) ||
                        m.description.toLowerCase().includes(q) ||
                        (m.hub && m.hub.toLowerCase().includes(q))
                    );
                }
                if (params.maxPrice) {
                    items = items.filter(m => m.dailyRate <= Number(params.maxPrice));
                }

                // Sorting
                if (params.sort) {
                    switch (params.sort) {
                        case 'price-low':
                            items.sort((a, b) => a.dailyRate - b.dailyRate);
                            break;
                        case 'price-high':
                            items.sort((a, b) => b.dailyRate - a.dailyRate);
                            break;
                        case 'rating':
                            items.sort((a, b) => (b.rating || 0) - (a.rating || 0));
                            break;
                        case 'distance':
                            if (params.userLat && params.userLon && window.AgriRentAPI?.geolocation) {
                                items = window.AgriRentAPI.geolocation.calculateMachineryDistances(items, Number(params.userLat), Number(params.userLon));
                                items.sort((a, b) => (a.calculatedDistanceKm || 999) - (b.calculatedDistanceKm || 999));
                            }
                            break;
                        case 'popular':
                        default:
                            items.sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
                            break;
                    }
                }

                return self._createResponse(200, items, `Retrieved ${items.length} machinery items.`);
            },

            /**
             * GET /api/machinery/:id
             */
            async getById(id) {
                if (self.backendActive) {
                    try {
                        const res = await fetch(`${self.baseUrl}/machinery/${id}`);
                        if (res.ok) return await res.json();
                    } catch (e) { /* fallback */ }
                }

                const items = self._getLocalData('machinery') || self._getDefaultMachinery();
                const item = items.find(m => m.id === id);
                if (!item) {
                    return self._createResponse(404, null, `Machine with id '${id}' not found.`);
                }
                return self._createResponse(200, item, 'Machine details retrieved.');
            },

            /**
             * POST /api/machinery
             */
            async create(machineData) {
                if (!machineData.name || !machineData.dailyRate) {
                    return self._createResponse(400, null, 'Validation error: name and dailyRate are required.');
                }

                const newMachine = {
                    id: machineData.id || `custom-${Date.now()}`,
                    name: machineData.name,
                    category: machineData.category || 'tractors',
                    image: machineData.image || 'images/tractor.png',
                    dailyRate: Number(machineData.dailyRate),
                    hourlyRate: Number(machineData.hourlyRate) || Math.round(Number(machineData.dailyRate) / 6),
                    status: machineData.status || 'Available Now',
                    statusBg: machineData.statusBg || 'bg-lightgreen-400 text-darkgreen-950',
                    hp: machineData.hp || '45 HP',
                    fuel: machineData.fuel || '4.0 L/hr',
                    distance: machineData.distance || '1.5 km away',
                    hub: machineData.hub || 'Local Village Hub',
                    district: machineData.district || 'Rampur District',
                    rating: 5.0,
                    reviews: 1,
                    tag: machineData.tag || 'Farmer Listed',
                    description: machineData.description || 'Verified agricultural machinery listed by local farmer.',
                    crops: machineData.crops || ['paddy', 'wheat', 'sugarcane'],
                    activities: machineData.activities || ['tillage'],
                    owner: machineData.owner || 'Verified Farmer',
                    isCustom: true,
                    createdAt: new Date().toISOString()
                };

                if (self.backendActive) {
                    try {
                        const res = await fetch(`${self.baseUrl}/machinery`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(newMachine)
                        });
                        if (res.ok) return await res.json();
                    } catch (e) { /* fallback */ }
                }

                const items = self._getLocalData('machinery') || self._getDefaultMachinery();
                items.unshift(newMachine);
                self._setLocalData('machinery', items);

                // Also update legacy custom machines key for backward compatibility
                const customs = self._getLocalData('custom_machinery') || [];
                customs.unshift(newMachine);
                self._setLocalData('custom_machinery', customs);

                return self._createResponse(201, newMachine, 'Machinery listed successfully via REST API.');
            },

            /**
             * PUT /api/machinery/:id
             */
            async update(id, updateData) {
                const items = self._getLocalData('machinery') || self._getDefaultMachinery();
                const index = items.findIndex(m => m.id === id);
                if (index === -1) {
                    return self._createResponse(404, null, `Machine with id '${id}' not found.`);
                }

                items[index] = { ...items[index], ...updateData, updatedAt: new Date().toISOString() };
                self._setLocalData('machinery', items);

                return self._createResponse(200, items[index], 'Machinery updated successfully.');
            },

            /**
             * DELETE /api/machinery/:id
             */
            async delete(id) {
                let items = self._getLocalData('machinery') || self._getDefaultMachinery();
                const initialLen = items.length;
                items = items.filter(m => m.id !== id);

                if (items.length === initialLen) {
                    return self._createResponse(404, null, `Machine with id '${id}' not found.`);
                }

                self._setLocalData('machinery', items);

                // Update legacy
                let customs = self._getLocalData('custom_machinery') || [];
                customs = customs.filter(m => m.id !== id);
                self._setLocalData('custom_machinery', customs);

                return self._createResponse(200, { deletedId: id }, 'Machinery deleted successfully.');
            }
        };
    }

    // ==========================================
    // 2. BOOKINGS REST CONTROLLER (/api/bookings)
    // ==========================================
    get bookings() {
        const self = this;
        return {
            /**
             * GET /api/bookings
             */
            async getAll() {
                if (self.backendActive) {
                    try {
                        const res = await fetch(`${self.baseUrl}/bookings`);
                        if (res.ok) return await res.json();
                    } catch (e) { /* fallback */ }
                }

                const bookings = self._getLocalData('bookings') || [];
                return self._createResponse(200, bookings, `Found ${bookings.length} bookings.`);
            },

            /**
             * POST /api/bookings
             */
            async create(bookingData) {
                if (!bookingData.machineId || !bookingData.date || !bookingData.duration) {
                    return self._createResponse(400, null, 'Validation error: machineId, date, and duration are required.');
                }

                const newBooking = {
                    id: bookingData.id || `AGRI-2026-${Math.floor(1000 + Math.random() * 9000)}`,
                    machineId: bookingData.machineId,
                    machineName: bookingData.machineName || 'Farm Machine',
                    date: bookingData.date,
                    duration: Number(bookingData.duration) || 1,
                    location: bookingData.location || 'Local Farm',
                    farmerName: bookingData.farmerName || 'Registered Farmer',
                    phone: bookingData.phone || '+91 98765 43210',
                    hasOperator: Boolean(bookingData.hasOperator),
                    totalCost: Number(bookingData.totalCost) || 0,
                    status: 'Confirmed',
                    paymentStatus: 'Paid / Guaranteed',
                    createdAt: new Date().toISOString()
                };

                if (self.backendActive) {
                    try {
                        const res = await fetch(`${self.baseUrl}/bookings`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(newBooking)
                        });
                        if (res.ok) return await res.json();
                    } catch (e) { /* fallback */ }
                }

                const bookings = self._getLocalData('bookings') || [];
                bookings.unshift(newBooking);
                self._setLocalData('bookings', bookings);

                // Also automatically create a corresponding owner rental request
                const request = {
                    id: `REQ-${Math.floor(100 + Math.random() * 900)}`,
                    farmerName: newBooking.farmerName,
                    machineId: newBooking.machineId,
                    machineName: newBooking.machineName,
                    dates: `${newBooking.date} (${newBooking.duration} Days)`,
                    location: newBooking.location,
                    totalAmount: newBooking.totalCost,
                    status: 'Pending',
                    createdAt: new Date().toISOString()
                };
                const requests = self._getLocalData('rental_requests') || [];
                requests.unshift(request);
                self._setLocalData('rental_requests', requests);

                return self._createResponse(201, newBooking, 'Booking created and confirmed successfully.');
            },

            /**
             * DELETE /api/bookings/:id
             */
            async cancel(id) {
                let bookings = self._getLocalData('bookings') || [];
                const b = bookings.find(item => item.id === id);
                if (!b) {
                    return self._createResponse(404, null, `Booking '${id}' not found.`);
                }
                b.status = 'Cancelled';
                self._setLocalData('bookings', bookings);
                return self._createResponse(200, b, `Booking '${id}' cancelled.`);
            }
        };
    }

    // ==========================================
    // 3. RENTAL REQUESTS REST CONTROLLER (/api/requests)
    // ==========================================
    get requests() {
        const self = this;
        return {
            async getAll() {
                const requests = self._getLocalData('rental_requests') || [];
                return self._createResponse(200, requests, `Found ${requests.length} requests.`);
            },

            async updateStatus(id, newStatus) {
                const requests = self._getLocalData('rental_requests') || [];
                const req = requests.find(r => r.id === id);
                if (!req) {
                    return self._createResponse(404, null, `Request '${id}' not found.`);
                }
                req.status = newStatus;
                self._setLocalData('rental_requests', requests);
                return self._createResponse(200, req, `Request '${id}' marked as ${newStatus}.`);
            }
        };
    }

    // ==========================================
    // 4. STATS & ANALYTICS REST CONTROLLER (/api/stats)
    // ==========================================
    get stats() {
        const self = this;
        return {
            async getOwnerStats() {
                const requests = self._getLocalData('rental_requests') || [];
                const bookings = self._getLocalData('bookings') || [];
                
                const confirmed = requests.filter(r => r.status === 'Accepted').length;
                const totalRevenue = requests
                    .filter(r => r.status === 'Accepted')
                    .reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 25400);

                const data = {
                    totalEarnings: totalRevenue,
                    formattedEarnings: `₹${totalRevenue.toLocaleString('en-IN')}`,
                    activeRentals: requests.filter(r => r.status === 'Pending').length + 2,
                    completedRentals: confirmed + 18,
                    avgRating: 4.8,
                    totalReviews: 34,
                    monthlyTrends: [
                        { month: 'Jan', revenue: 14000 },
                        { month: 'Feb', revenue: 19500 },
                        { month: 'Mar', revenue: 22000 },
                        { month: 'Apr', revenue: 25400 }
                    ]
                };

                return self._createResponse(200, data, 'Owner dashboard analytics retrieved.');
            }
        };
    }

    // ==========================================
    // 5. WEATHER & AGRI-ADVISORY REST CONTROLLER (/api/weather)
    // ==========================================
    get weather() {
        const self = this;
        return {
            /**
             * GET /api/weather?lat=...&lon=...
             * Uses free Open-Meteo REST API with agricultural conditions evaluation
             */
            async getAgriWeather(lat = 28.8080, lon = 79.0270) {
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 3500);

                    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`;
                    
                    const res = await fetch(url, { signal: controller.signal });
                    clearTimeout(timer);

                    if (res.ok) {
                        const json = await res.json();
                        const current = json.current || {};
                        const daily = json.daily || {};

                        const temp = current.temperature_2m !== undefined ? Math.round(current.temperature_2m) : 28;
                        const humidity = current.relative_humidity_2m || 55;
                        const windSpeed = current.wind_speed_10m || 8.5;
                        const precipitation = current.precipitation || 0;

                        // Assess agricultural condition for operations (Spraying, Harvesting, Ploughing)
                        let sprayStatus = 'Optimal';
                        let sprayColor = 'text-lightgreen-400';
                        let sprayReason = 'Low wind & clear skies. Ideal for drone or power spraying.';

                        if (precipitation > 0 || (daily.precipitation_probability_max && daily.precipitation_probability_max[0] > 40)) {
                            sprayStatus = 'Avoid Spraying';
                            sprayColor = 'text-red-400';
                            sprayReason = 'Rain or high precipitation chance will wash away pesticides/fertilizers.';
                        } else if (windSpeed > 15) {
                            sprayStatus = 'Caution (Drift Risk)';
                            sprayColor = 'text-yellow-400';
                            sprayReason = 'Wind speed > 15 km/h causes chemical drift away from target crops.';
                        }

                        const harvestStatus = precipitation === 0 ? 'Ideal (Dry Grain)' : 'Delay (Moist Field)';

                        const weatherData = {
                            temperature: temp,
                            humidity: humidity,
                            windSpeed: windSpeed,
                            precipitation: precipitation,
                            conditionCode: current.weather_code || 0,
                            spraying: {
                                status: sprayStatus,
                                color: sprayColor,
                                advice: sprayReason
                            },
                            harvesting: {
                                status: harvestStatus
                            },
                            forecastMaxTemp: daily.temperature_2m_max ? Math.round(daily.temperature_2m_max[0]) : temp + 4,
                            forecastMinTemp: daily.temperature_2m_min ? Math.round(daily.temperature_2m_min[0]) : temp - 5,
                            rainChance: daily.precipitation_probability_max ? daily.precipitation_probability_max[0] : 10,
                            source: 'Open-Meteo Agricultural API'
                        };

                        return self._createResponse(200, weatherData, 'Live agricultural weather retrieved.');
                    }
                } catch (e) {
                    console.warn('[AgriRestAPI] Remote weather API unreachable, returning simulated agricultural advisory:', e.message);
                }

                // Fallback realistic weather advisory
                const fallbackWeather = {
                    temperature: 28,
                    humidity: 52,
                    windSpeed: 7.2,
                    precipitation: 0,
                    conditionCode: 1,
                    spraying: {
                        status: 'Optimal',
                        color: 'text-lightgreen-400',
                        advice: 'Low wind (7.2 km/h) & dry weather. Excellent condition for drone crop protection.'
                    },
                    harvesting: {
                        status: 'Ideal (Dry Grain)'
                    },
                    forecastMaxTemp: 32,
                    forecastMinTemp: 21,
                    rainChance: 5,
                    source: 'AgriRent Offline Climate Model'
                };

                return self._createResponse(200, fallbackWeather, 'Simulated farm climate data loaded.');
            }
        };
    }

    // ==========================================
    // 6. SPEECH-TO-TEXT REST ENDPOINTS (/api/speech)
    // ==========================================
    get speech() {
        const self = this;
        return {
            async getLanguages() {
                if (self.backendActive) {
                    try {
                        const res = await self._fetchBackend('/api/speech/languages');
                        if (res) return res;
                    } catch (e) {}
                }
                const speechApi = window.AgriSpeechAPI ? new window.AgriSpeechAPI() : null;
                return {
                    status: 200,
                    success: true,
                    data: speechApi ? speechApi.getSupportedLanguages() : []
                };
            },
            async transcribe(text, lang = 'en-IN') {
                if (self.backendActive) {
                    try {
                        const res = await self._fetchBackend('/api/speech/transcribe', {
                            method: 'POST',
                            body: JSON.stringify({ text, lang })
                        });
                        if (res) return res;
                    } catch (e) {}
                }
                const speechApi = window.AgriSpeechAPI ? new window.AgriSpeechAPI() : null;
                const normalized = speechApi ? speechApi.normalizeAgriQuery(text) : { normalized: text };
                return {
                    status: 200,
                    success: true,
                    transcript: text,
                    normalized: normalized.normalized,
                    matchedEquipment: normalized.matchedKey,
                    lang: lang,
                    confidence: 0.98
                };
            }
        };
    }

    // ==========================================
    // INTERNAL STORAGE & DEFAULT DATA
    // ==========================================
    _getLocalData(key) {
        try {
            const raw = localStorage.getItem(`${this.storagePrefix}${key}`);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    _setLocalData(key, val) {
        try {
            localStorage.setItem(`${this.storagePrefix}${key}`, JSON.stringify(val));
        } catch (e) {
            console.error('[AgriRestAPI] LocalStorage write error:', e);
        }
    }

    _getDefaultMachinery() {
        return [
            {
                id: 'tractor',
                name: 'Heavy Duty Tractor',
                category: 'tractors',
                image: 'images/tractor.png',
                dailyRate: 1200,
                hourlyRate: 200,
                status: 'Available Now',
                statusBg: 'bg-lightgreen-400 text-darkgreen-950',
                hp: '50 HP Engine',
                fuel: '4.5 L/hr',
                distance: '3.2 km away',
                hub: 'Rampur Village Hub',
                district: 'Rampur',
                rating: 4.9,
                reviews: 124,
                tag: 'Tillage & Hauling',
                description: 'High-torque 50+ HP diesel engine suitable for deep ploughing, disc harrowing, and heavy crop hauling.',
                crops: ['paddy', 'wheat', 'sugarcane', 'cotton', 'maize', 'vegetables'],
                activities: ['tillage', 'hauling', 'sowing'],
                owner: 'Sukhwinder Singh'
            },
            {
                id: 'harvester',
                name: 'Combine Harvester',
                category: 'harvesters',
                image: 'images/harvester.png',
                dailyRate: 3500,
                hourlyRate: 600,
                status: 'In High Demand',
                statusBg: 'bg-earth-400 text-darkgreen-950',
                hp: '75 HP Engine',
                fuel: '8.0 L/hr',
                distance: '5.8 km away',
                hub: 'Green Valley Hub',
                district: 'Bareilly',
                rating: 4.8,
                reviews: 98,
                tag: 'Grain Harvesting',
                description: 'Integrated cutting, threshing, winnowing machinery for high-speed paddy and wheat harvesting.',
                crops: ['paddy', 'wheat', 'maize'],
                activities: ['harvesting'],
                owner: 'Gurpreet Singh'
            },
            {
                id: 'seeder',
                name: 'Precision Seed Drill',
                category: 'sowing',
                image: 'images/seeder.png',
                dailyRate: 800,
                hourlyRate: 150,
                status: 'Available Now',
                statusBg: 'bg-lightgreen-400 text-darkgreen-950',
                hp: '35 HP Req.',
                fuel: '2.0 L/hr',
                distance: '2.1 km away',
                hub: 'Kisan Seva Hub',
                district: 'Moradabad',
                rating: 4.7,
                reviews: 64,
                tag: 'Precision Sowing',
                description: 'Ensures uniform seed depth and distance spacing for max crop germination and reduced seed waste.',
                crops: ['wheat', 'cotton', 'maize', 'vegetables'],
                activities: ['sowing'],
                owner: 'Ramesh Patel'
            },
            {
                id: 'sprayer',
                name: 'Power Crop Sprayer',
                category: 'spraying',
                image: 'images/sprayer.png',
                dailyRate: 600,
                hourlyRate: 100,
                status: 'Booked till Tomorrow',
                statusBg: 'bg-blue-400 text-darkgreen-950',
                hp: '12 HP Engine',
                fuel: '1.2 L/hr',
                distance: '4.5 km away',
                hub: 'Kisan Seva Hub',
                district: 'Moradabad',
                rating: 4.9,
                reviews: 82,
                tag: 'Crop Protection',
                description: 'High-pressure mist sprayer for uniform fertilizer, organic pest control, and liquid nutrient coverage.',
                crops: ['paddy', 'cotton', 'vegetables', 'sugarcane'],
                activities: ['spraying'],
                owner: 'Balwinder Kumar'
            },
            {
                id: 'rotavator',
                name: 'Rotary Tiller / Rotavator',
                category: 'tractors',
                image: 'images/rotavator.png',
                dailyRate: 950,
                hourlyRate: 180,
                status: 'Available Now',
                statusBg: 'bg-lightgreen-400 text-darkgreen-950',
                hp: '45 HP Req.',
                fuel: '3.0 L/hr',
                distance: '1.8 km away',
                hub: 'Rampur Village Hub',
                district: 'Rampur',
                rating: 4.8,
                reviews: 53,
                tag: 'Soil Pulverization',
                description: 'High-speed rotating blades pulverize soil clods into fine seedbeds in a single pass.',
                crops: ['paddy', 'wheat', 'vegetables', 'cotton'],
                activities: ['tillage'],
                owner: 'Vikram Singh'
            },
            {
                id: 'drone',
                name: 'Smart AI Drone Sprayer',
                category: 'spraying',
                image: 'images/drone.png',
                dailyRate: 1500,
                hourlyRate: 300,
                status: 'Available Now',
                statusBg: 'bg-lightgreen-400 text-darkgreen-950',
                hp: 'Battery / Auto',
                fuel: 'Electric',
                distance: '3.0 km away',
                hub: 'AgriTech Hub',
                district: 'Nainital',
                rating: 4.9,
                reviews: 41,
                tag: 'Precision Aerial Spraying',
                description: 'Autonomous flight path spraying capable of treating 10 acres per hour with millimeter accuracy.',
                crops: ['paddy', 'wheat', 'cotton', 'sugarcane', 'vegetables'],
                activities: ['spraying'],
                owner: 'TechAgri Hub'
            }
        ];
    }
}

// Attach to window
if (typeof window !== 'undefined') {
    window.AgriRestAPI = AgriRestAPI;
}
