/**
 * AgriRent - Unified API Entrypoint
 * Module: api/index.js
 * 
 * Aggregates:
 * 1. AgriGeolocationAPI (Browser HTML5 GPS + OpenStreetMap Reverse Geocoding + Haversine Distance)
 * 2. AgriRestAPI (Machinery, Bookings, Requests, Stats, Weather REST Endpoints)
 * 3. AgriChatbotAPI (Kisan Mitra AI Agronomic Engine + Speech Recognition + LLM Connectors)
 */

(function () {
    'use strict';

    if (typeof window === 'undefined') return;

    // Instantiate Services
    const geolocationService = window.AgriGeolocationAPI ? new window.AgriGeolocationAPI() : null;
    const restService = window.AgriRestAPI ? new window.AgriRestAPI() : null;
    const chatbotService = window.AgriChatbotAPI ? new window.AgriChatbotAPI() : null;
    const uploadService = window.AgriUploadAPI ? new window.AgriUploadAPI() : null;
    const speechService = window.AgriSpeechAPI ? new window.AgriSpeechAPI() : null;

    // Export Master AgriRentAPI Object
    window.AgriRentAPI = {
        version: '2.0.0',
        name: 'AgriRent Farm Machinery API Suite',
        geolocation: geolocationService,
        rest: restService,
        chatbot: chatbotService,
        upload: uploadService,
        speech: speechService,

        /**
         * Initialize API Suite & check system health
         */
        async init() {
            console.log('%c🚜 AgriRent API Suite Initialized [v2.0.0]', 'color: #4ade80; font-weight: bold; font-size: 13px;');
            
            // Check REST backend health
            if (this.rest) {
                await this.rest.checkBackendHealth();
            }

            // Dispatch global event for listeners
            window.dispatchEvent(new CustomEvent('agrirent:api-ready', {
                detail: {
                    hasGeolocation: Boolean(this.geolocation?.isSupported()),
                    hasRest: Boolean(this.rest),
                    backendConnected: Boolean(this.rest?.backendActive),
                    hasChatbot: Boolean(this.chatbot),
                    hasUpload: Boolean(this.upload),
                    hasSpeech: Boolean(this.speech?.isSupported())
                }
            }));

            return {
                geolocationReady: Boolean(this.geolocation),
                restReady: Boolean(this.rest),
                chatbotReady: Boolean(this.chatbot),
                uploadReady: Boolean(this.upload),
                speechReady: Boolean(this.speech)
            };
        },

        /**
         * Diagnostic report of all APIs
         */
        getDiagnostics() {
            return {
                timestamp: new Date().toISOString(),
                geolocation: {
                    supported: this.geolocation ? this.geolocation.isSupported() : false,
                    currentCoords: this.geolocation?.currentCoords || null,
                    currentAddress: this.geolocation?.currentAddress || null
                },
                rest: {
                    backendServerActive: this.rest?.backendActive || false,
                    localEngineActive: true,
                    endpoints: [
                        '/api/machinery',
                        '/api/bookings',
                        '/api/requests',
                        '/api/stats',
                        '/api/weather',
                        '/api/upload',
                        '/api/uploads'
                    ]
                },
                chatbot: {
                    online: Boolean(this.chatbot),
                    voiceSupported: Boolean(this.chatbot?.recognition),
                    externalProvider: this.chatbot?.externalConfig?.provider || 'offline'
                },
                upload: {
                    ready: Boolean(this.upload),
                    supportedFormats: this.upload?.allowedMimeTypes || [],
                    maxSizeBytes: this.upload?.maxFileSize || 10485760
                },
                speech: {
                    supported: this.speech ? this.speech.isSupported() : false,
                    activeLanguage: this.speech?.currentLanguage || 'en-IN',
                    availableLanguages: this.speech ? this.speech.getSupportedLanguages() : []
                }
            };
        }
    };

    // Auto-init on script load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.AgriRentAPI.init());
    } else {
        window.AgriRentAPI.init();
    }
})();
