/**
 * AgriRent - Geolocation API Service
 * Module: api/geolocation.js
 * 
 * Provides HTML5 Geolocation, OpenStreetMap Reverse Geocoding,
 * Geodesic Haversine Distance Calculation, Regional Hub Proximity Sorting,
 * and Agricultural District Resolution.
 */

class AgriGeolocationAPI {
    constructor() {
        this.currentCoords = null; // { latitude, longitude, accuracy }
        this.currentAddress = null; // { name, village, town, district, state, country, postcode }
        this.watchId = null;
        this.cache = new Map();
        this.isLocating = false;

        // Default Agricultural Machinery Hubs in the region
        this.knownHubs = [
            { id: 'hub-rampur', name: 'Rampur Village Hub', district: 'Rampur', state: 'Uttar Pradesh', lat: 28.8080, lon: 79.0270, machines: 14 },
            { id: 'hub-kisan-seva', name: 'Kisan Seva Central Hub', district: 'Moradabad', state: 'Uttar Pradesh', lat: 28.8386, lon: 78.7733, machines: 22 },
            { id: 'hub-green-valley', name: 'Green Valley Agro Hub', district: 'Bareilly', state: 'Uttar Pradesh', lat: 28.3670, lon: 79.4304, machines: 18 },
            { id: 'hub-agritech', name: 'AgriTech Regional Center', district: 'Nainital', state: 'Uttarakhand', lat: 29.3919, lon: 79.4542, machines: 9 },
            { id: 'hub-punjab-central', name: 'Punjab Kisan Hub', district: 'Ludhiana', state: 'Punjab', lat: 30.9010, lon: 75.8573, machines: 31 },
            { id: 'hub-haryana-south', name: 'Karnal Agri Implement Depot', district: 'Karnal', state: 'Haryana', lat: 29.6857, lon: 76.9905, machines: 25 }
        ];
    }

    /**
     * Check if Geolocation is supported in current environment
     * @returns {boolean}
     */
    isSupported() {
        return typeof window !== 'undefined' && 'geolocation' in navigator;
    }

    /**
     * Request current device position via Browser Geolocation API
     * @param {PositionOptions} options
     * @returns {Promise<{coords: GeolocationCoordinates, address: Object, nearestHub: Object}>}
     */
    async getCurrentPosition(options = {}) {
        if (!this.isSupported()) {
            throw new Error('Geolocation is not supported by your browser.');
        }

        const defaultOptions = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000,
            ...options
        };

        this.isLocating = true;

        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, defaultOptions);
            });

            this.currentCoords = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: position.timestamp
            };

            // Attempt reverse geocoding to retrieve readable address
            const address = await this.reverseGeocode(this.currentCoords.latitude, this.currentCoords.longitude);
            this.currentAddress = address;

            const nearestHub = this.findNearestHub(this.currentCoords.latitude, this.currentCoords.longitude);

            this.isLocating = false;
            return {
                coords: this.currentCoords,
                address: this.currentAddress,
                nearestHub: nearestHub
            };
        } catch (err) {
            this.isLocating = false;
            let message = 'Unable to retrieve location.';
            if (err.code === 1) message = 'Location permission was denied. Please allow location access in your browser.';
            else if (err.code === 2) message = 'Location position unavailable. Please check GPS/network.';
            else if (err.code === 3) message = 'Location request timed out.';
            throw new Error(message);
        }
    }

    /**
     * Start live position watching
     * @param {Function} onUpdate - callback(locationData)
     * @param {Function} onError - callback(error)
     * @param {PositionOptions} options
     * @returns {number} watchId
     */
    watchPosition(onUpdate, onError, options = {}) {
        if (!this.isSupported()) {
            if (onError) onError(new Error('Geolocation not supported.'));
            return null;
        }

        const defaultOptions = {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 10000,
            ...options
        };

        this.watchId = navigator.geolocation.watchPosition(
            async (pos) => {
                this.currentCoords = {
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    timestamp: pos.timestamp
                };
                const address = await this.reverseGeocode(pos.coords.latitude, pos.coords.longitude);
                this.currentAddress = address;
                const nearestHub = this.findNearestHub(pos.coords.latitude, pos.coords.longitude);
                if (onUpdate) {
                    onUpdate({
                        coords: this.currentCoords,
                        address: this.currentAddress,
                        nearestHub: nearestHub
                    });
                }
            },
            (err) => {
                if (onError) onError(err);
            },
            defaultOptions
        );

        return this.watchId;
    }

    /**
     * Stop watching position
     */
    clearWatch() {
        if (this.watchId !== null && this.isSupported()) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
    }

    /**
     * Reverse geocode latitude and longitude into human-readable Indian location details
     * Uses OpenStreetMap Nominatim with fallback to BigDataCloud / local heuristic
     * @param {number} lat 
     * @param {number} lon 
     * @returns {Promise<Object>}
     */
    async reverseGeocode(lat, lon) {
        const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            // First attempt: OpenStreetMap Nominatim API
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`;
            const response = await fetch(url, {
                headers: {
                    'Accept-Language': 'en'
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                const addr = data.address || {};

                const locality = addr.village || addr.suburb || addr.town || addr.city_district || addr.city || 'Local Area';
                const district = addr.county || addr.state_district || addr.city || 'Regional District';
                const state = addr.state || 'India';
                const postcode = addr.postcode || '';

                const result = {
                    displayName: `${locality}, ${district}`,
                    fullAddress: data.display_name,
                    locality: locality,
                    district: district,
                    state: state,
                    postcode: postcode,
                    latitude: lat,
                    longitude: lon,
                    source: 'OpenStreetMap'
                };

                this.cache.set(cacheKey, result);
                return result;
            }
        } catch (e) {
            // Fallback gracefully if offline or CORS/rate-limited
            console.warn('[AgriGeolocationAPI] Remote reverse geocoding failed or timed out, applying heuristic fallback:', e.message);
        }

        // Offline / Fallback Heuristic using nearest known regional hub
        const nearest = this.findNearestHub(lat, lon);
        const fallbackResult = {
            displayName: `${nearest.hub.district} Area (~${nearest.distanceKm} km from ${nearest.hub.name})`,
            locality: nearest.hub.district,
            district: nearest.hub.district,
            state: nearest.hub.state,
            postcode: '244901',
            latitude: lat,
            longitude: lon,
            source: 'Offline Hub Match'
        };

        this.cache.set(cacheKey, fallbackResult);
        return fallbackResult;
    }

    /**
     * Calculate Great-Circle distance using Haversine formula
     * @param {number} lat1 
     * @param {number} lon1 
     * @param {number} lat2 
     * @param {number} lon2 
     * @returns {number} distance in kilometers (rounded to 1 decimal)
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in KM
        const dLat = this._toRadians(lat2 - lat1);
        const dLon = this._toRadians(lon2 - lon1);

        const a = 
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this._toRadians(lat1)) * Math.cos(this._toRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        return Number(distance.toFixed(1));
    }

    /**
     * Find nearest agricultural machinery hub to the provided coordinates
     * @param {number} lat 
     * @param {number} lon 
     * @returns {{hub: Object, distanceKm: number, etaMinutes: number}}
     */
    findNearestHub(lat, lon) {
        let nearestHub = this.knownHubs[0];
        let minDistance = Infinity;

        for (const hub of this.knownHubs) {
            const dist = this.calculateDistance(lat, lon, hub.lat, hub.lon);
            if (dist < minDistance) {
                minDistance = dist;
                nearestHub = hub;
            }
        }

        // Assume average tractor transport speed of 20 km/h
        const etaMinutes = Math.max(10, Math.round((minDistance / 20) * 60));

        return {
            hub: nearestHub,
            distanceKm: minDistance,
            etaMinutes: etaMinutes
        };
    }

    /**
     * Update an array of machinery items with real calculated distance from user's coordinates
     * @param {Array<Object>} machineryList 
     * @param {number} [userLat]
     * @param {number} [userLon]
     * @returns {Array<Object>}
     */
    calculateMachineryDistances(machineryList, userLat, userLon) {
        const lat = userLat !== undefined ? userLat : this.currentCoords?.latitude;
        const lon = userLon !== undefined ? userLon : this.currentCoords?.longitude;

        if (!lat || !lon) {
            return machineryList;
        }

        return machineryList.map(item => {
            // Find hub coordinates or default to Rampur hub
            const matchedHub = this.knownHubs.find(h => 
                (item.hub && item.hub.toLowerCase().includes(h.district.toLowerCase())) ||
                (item.hub && item.hub.toLowerCase().includes(h.name.toLowerCase()))
            ) || this.knownHubs[0];

            // If item has specific coordinates, use them; otherwise use matched hub coordinates with minor realistic jitter
            const itemLat = item.lat || matchedHub.lat;
            const itemLon = item.lon || matchedHub.lon;

            const distKm = this.calculateDistance(lat, lon, itemLat, itemLon);
            
            return {
                ...item,
                calculatedDistanceKm: distKm,
                distance: `${distKm} km away`
            };
        });
    }

    _toRadians(deg) {
        return deg * (Math.PI / 180);
    }
}

// Attach to window for global browser access
if (typeof window !== 'undefined') {
    window.AgriGeolocationAPI = AgriGeolocationAPI;
}
