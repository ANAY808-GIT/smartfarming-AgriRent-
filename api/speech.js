/**
 * AgriRent - Speech-to-Text API Service (AgriSpeechAPI)
 * Module: api/speech.js
 * 
 * Provides:
 * - HTML5 Web Speech Recognition Engine (SpeechRecognition / webkitSpeechRecognition)
 * - Multilingual Speech-to-Text tailored for Indian farmers:
 *   (en-IN: Indian English, hi-IN: Hindi, pa-IN: Punjabi, mr-IN: Marathi, 
 *    te-IN: Telugu, ta-IN: Tamil, bn-IN: Bengali, en-US: English US)
 * - Real-time interim & final speech streaming
 * - Agricultural Voice Query Normalizer & Phonetic Entity Matcher
 *   (Tractor, Rotavator, Combine Harvester, Drone, Sprayer, Seed Drill, Crops, Operations)
 * - Automated Search Input Voice Binder (bindSearchInput)
 * - Zero-failure fallback simulation for offline/non-mic test environments
 */

class AgriSpeechAPI {
    constructor(options = {}) {
        this.currentLanguage = options.defaultLanguage || 'en-IN';
        this.recognition = null;
        this.isListening = false;
        this.lastTranscript = '';
        this.lastConfidence = 0;
        this.audioVisualizerInterval = null;

        // Supported Regional & Agricultural Languages
        this.supportedLanguages = [
            { code: 'en-IN', name: 'English (India)', native: 'Indian English', flag: '🇮🇳' },
            { code: 'hi-IN', name: 'Hindi', native: 'हिन्दी', flag: '🇮🇳' },
            { code: 'pa-IN', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', flag: '🇮🇳' },
            { code: 'mr-IN', name: 'Marathi', native: 'मराठी', flag: '🇮🇳' },
            { code: 'te-IN', name: 'Telugu', native: 'తెలుగు', flag: '🇮🇳' },
            { code: 'ta-IN', name: 'Tamil', native: 'தமிழ்', flag: '🇮🇳' },
            { code: 'bn-IN', name: 'Bengali', native: 'বাংলা', flag: '🇮🇳' },
            { code: 'en-US', name: 'English (US)', native: 'English', flag: '🇺🇸' }
        ];

        // Agricultural Phonetic Dictionary & Multilingual Term Mapping
        this.agriDictionary = {
            tractor: {
                canonical: 'Tractor',
                terms: ['tractor', 'trator', 'traktor', 'trector', 'tracter', 'ट्रैक्टर', 'ट्रेक्टर', 'ਟਰੈਕਟਰ', 'ट्रॅक्टर', 'ట్రాక్టర్', 'டிராக்டர்'],
                category: 'tractors'
            },
            harvester: {
                canonical: 'Combine Harvester',
                terms: ['harvester', 'combine', 'combine harvester', 'reaper', 'cutter', 'crop cutter', 'हार्वेस्टर', 'कंबाइन', 'कटाई मशीन', 'ਹਾਰਵੈਸਟਰ', 'हार्वेस्टर', 'కోత యంత్రం'],
                category: 'harvesters'
            },
            rotavator: {
                canonical: 'Rotary Tiller (Rotavator)',
                terms: ['rotavator', 'rotary tiller', 'rotovator', 'tiller', 'cultivator', 'plough', 'plow', 'रोटावेटर', 'रोटावेटर', 'टिलर', 'ਜੋਤਾ', 'రోటవేటర్'],
                category: 'tractors'
            },
            drone: {
                canonical: 'Smart AI Drone Sprayer',
                terms: ['drone', 'drone sprayer', 'ai drone', 'uav', 'flying sprayer', 'ड्रोन', 'ड्रोन स्प्रेयर', 'ਡਰੋਨ', 'డ్రోన్', 'ட்ரோன்'],
                category: 'spraying'
            },
            sprayer: {
                canonical: 'Power Mist Sprayer',
                terms: ['sprayer', 'mist sprayer', 'spray machine', 'spray pump', 'pesticide sprayer', 'स्प्रेयर', 'स्प्रे मशीन', 'ਸਪ੍ਰੇਅਰ', 'స్ప్రేయర్', 'தெளிப்பான்'],
                category: 'spraying'
            },
            seeder: {
                canonical: 'Precision Seed Drill',
                terms: ['seeder', 'seed drill', 'sowing machine', 'planter', 'seed planter', 'सीडर', 'बीज बोने की मशीन', 'ਬੀਜ ਡਰਿੱਲ', 'విత్తనాలు వేసే యంత్రం'],
                category: 'sowing'
            }
        };

        // Curated Spoken Voice Demo Prompts for Farmers & Testing
        this.sampleVoiceQueries = [
            { query: 'Find heavy duty tractor for paddy field', lang: 'en-IN', category: 'tractors' },
            { query: 'Combine harvester for wheat crop', lang: 'en-IN', category: 'harvesters' },
            { query: 'धान की जुताई के लिए ट्रैक्टर', lang: 'hi-IN', category: 'tractors' },
            { query: 'गेहूं कटाई के लिए कंबाइन हार्वेस्टर', lang: 'hi-IN', category: 'harvesters' },
            { query: 'Smart AI drone sprayer under 2000 rupees', lang: 'en-IN', category: 'spraying' },
            { query: 'Rotary tiller for soil pulverization', lang: 'en-IN', category: 'tractors' },
            { query: 'कीटनाशक छिड़काव के लिए ड्रोन स्प्रेयर', lang: 'hi-IN', category: 'spraying' },
            { query: 'Precision seed drill for wheat sowing', lang: 'en-IN', category: 'sowing' }
        ];

        this._initSpeechEngine();
    }

    /**
     * Check if Web Speech API is supported
     * @returns {boolean}
     */
    isSupported() {
        return typeof window !== 'undefined' && 
               Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    /**
     * Initialize Web Speech Engine
     */
    _initSpeechEngine() {
        if (!this.isSupported()) {
            console.info('[AgriSpeechAPI] Web Speech API not native in this browser; fallback simulation active.');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        try {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.maxAlternatives = 3;
            this.recognition.lang = this.currentLanguage;
        } catch (e) {
            console.warn('[AgriSpeechAPI] Could not instantiate SpeechRecognition:', e);
            this.recognition = null;
        }
    }

    /**
     * Get list of supported languages
     */
    getSupportedLanguages() {
        return this.supportedLanguages;
    }

    /**
     * Set active speech recognition language
     * @param {string} langCode - e.g. 'en-IN', 'hi-IN'
     */
    setLanguage(langCode) {
        const found = this.supportedLanguages.find(l => l.code === langCode);
        if (found) {
            this.currentLanguage = langCode;
            if (this.recognition) {
                this.recognition.lang = langCode;
            }
            return found;
        }
        console.warn(`[AgriSpeechAPI] Unsupported language code: ${langCode}. Retaining ${this.currentLanguage}`);
        return null;
    }

    /**
     * Normalizes conversational speech into agricultural search keywords
     * @param {string} rawTranscript 
     * @returns {Object} { raw, normalized, matchedEquipment, category, confidence }
     */
    normalizeAgriQuery(rawTranscript) {
        if (!rawTranscript || typeof rawTranscript !== 'string') {
            return { raw: '', normalized: '', matchedEquipment: null, category: null };
        }

        const clean = rawTranscript.trim();
        const lower = clean.toLowerCase();

        let matchedKey = null;
        let matchedCategory = null;
        let matchedCanonical = null;

        // Search in agricultural phonetic dictionary
        for (const [key, def] of Object.entries(this.agriDictionary)) {
            for (const term of def.terms) {
                if (lower.includes(term.toLowerCase())) {
                    matchedKey = key;
                    matchedCategory = def.category;
                    matchedCanonical = def.canonical;
                    break;
                }
            }
            if (matchedKey) break;
        }

        // Additional farming keyword cleaners
        let searchPhrase = clean;
        if (matchedKey) {
            // Keep canonical term for optimal search matching
            searchPhrase = matchedKey;
        }

        return {
            raw: clean,
            normalized: searchPhrase,
            canonicalName: matchedCanonical,
            matchedKey: matchedKey,
            category: matchedCategory
        };
    }

    /**
     * Start listening for voice input
     * @param {Object} options 
     * {
     *   lang?: string,
     *   continuous?: boolean,
     *   interimResults?: boolean,
     *   onStart?: Function,
     *   onInterim?: Function(interimText),
     *   onResult?: Function(finalResult),
     *   onError?: Function(err),
     *   onEnd?: Function
     * }
     */
    startListening(options = {}) {
        if (!this.isSupported()) {
            const err = new Error('Web Speech API is not supported in this browser. Please use Chrome/Edge or click a sample voice query.');
            if (options.onError) options.onError(err);
            return false;
        }

        if (this.isListening) {
            this.stopListening();
        }

        const lang = options.lang || this.currentLanguage;
        this.recognition.lang = lang;
        this.recognition.continuous = Boolean(options.continuous);
        this.recognition.interimResults = options.interimResults !== false; // default true

        let finalTranscript = '';
        let interimTranscript = '';
        let confidenceScore = 0.95;

        this.recognition.onstart = () => {
            this.isListening = true;
            this._dispatchSpeechEvent('start', { lang });
            if (options.onStart) options.onStart();
        };

        this.recognition.onresult = (event) => {
            interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const res = event.results[i];
                const text = res[0].transcript;
                if (res.isFinal) {
                    finalTranscript += text;
                    if (res[0].confidence) {
                        confidenceScore = Math.round(res[0].confidence * 100) / 100;
                    }
                } else {
                    interimTranscript += text;
                }
            }

            // Stream interim results
            if (interimTranscript && options.onInterim) {
                options.onInterim(interimTranscript);
                this._dispatchSpeechEvent('interim', { interim: interimTranscript });
            }

            // Emit final results when available
            if (finalTranscript) {
                const normalized = this.normalizeAgriQuery(finalTranscript);
                const resultPayload = {
                    transcript: finalTranscript.trim(),
                    confidence: confidenceScore,
                    lang: lang,
                    normalized: normalized.normalized,
                    matchedCategory: normalized.category,
                    canonicalName: normalized.canonicalName,
                    raw: finalTranscript
                };

                this.lastTranscript = finalTranscript.trim();
                this.lastConfidence = confidenceScore;
                this._dispatchSpeechEvent('result', resultPayload);

                if (options.onResult) {
                    options.onResult(resultPayload);
                }
            }
        };

        this.recognition.onerror = (event) => {
            this.isListening = false;
            const errInfo = {
                error: event.error,
                message: this._getFriendlyErrorMessage(event.error)
            };
            this._dispatchSpeechEvent('error', errInfo);
            if (options.onError) options.onError(errInfo);
        };

        this.recognition.onend = () => {
            this.isListening = false;
            this._dispatchSpeechEvent('end', { lastTranscript: this.lastTranscript });
            if (options.onEnd) options.onEnd();
        };

        try {
            this.recognition.start();
            return true;
        } catch (err) {
            this.isListening = false;
            console.error('[AgriSpeechAPI] recognition.start() error:', err);
            if (options.onError) {
                options.onError({
                    error: 'start-failed',
                    message: err.message || 'Could not start speech recognition'
                });
            }
            return false;
        }
    }

    /**
     * Stop speech recognition
     */
    stopListening() {
        if (this.recognition && this.isListening) {
            try {
                this.recognition.stop();
            } catch (e) {
                // Ignore if already stopped
            }
        }
        this.isListening = false;
    }

    /**
     * Abort speech recognition immediately
     */
    abortListening() {
        if (this.recognition) {
            try {
                this.recognition.abort();
            } catch (e) {}
        }
        this.isListening = false;
    }

    /**
     * High-level binder: Attach Voice Search directly to a Search Input & Trigger Button
     * @param {string|HTMLInputElement} inputEl - Target search input element or selector
     * @param {Object} config - { buttonEl, langSelectorEl, onSearch, indicatorEl }
     */
    bindSearchInput(inputEl, config = {}) {
        const input = typeof inputEl === 'string' ? document.querySelector(inputEl) : inputEl;
        if (!input) {
            console.warn('[AgriSpeechAPI] Search input element not found for voice binding.');
            return null;
        }

        const button = typeof config.buttonEl === 'string' ? document.querySelector(config.buttonEl) : config.buttonEl;
        const originalPlaceholder = input.getAttribute('placeholder') || 'Search machinery...';

        const updateUiState = (state, details = '') => {
            if (button) {
                if (state === 'listening') {
                    button.classList.add('voice-active', 'bg-red-500', 'text-white', 'animate-pulse');
                    button.classList.remove('bg-darkgreen-900', 'text-lightgreen-400', 'border-lightgreen-400/30');
                    button.setAttribute('title', 'Listening... Click to stop voice search');
                } else {
                    button.classList.remove('voice-active', 'bg-red-500', 'text-white', 'animate-pulse');
                    button.classList.add('bg-darkgreen-900', 'text-lightgreen-400');
                    button.setAttribute('title', 'Search using voice (Speech-to-Text API)');
                }
            }

            if (state === 'listening') {
                input.placeholder = '🎙️ Listening... Speak equipment name (e.g. Tractor, Drone)';
                input.classList.add('ring-2', 'ring-lightgreen-400', 'border-lightgreen-400');
            } else {
                input.placeholder = originalPlaceholder;
                input.classList.remove('ring-2', 'ring-lightgreen-400');
            }
        };

        const toggleVoice = () => {
            if (this.isListening) {
                this.stopListening();
                updateUiState('idle');
                return;
            }

            const activeLang = config.lang || this.currentLanguage;

            if (!this.isSupported()) {
                // Show graceful simulation selector
                this._promptSimulationModal(input, (selectedText) => {
                    input.value = selectedText;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('keyup', { bubbles: true }));
                    if (config.onSearch) config.onSearch(selectedText);
                });
                return;
            }

            updateUiState('listening');

            this.startListening({
                lang: activeLang,
                onStart: () => {
                    updateUiState('listening');
                },
                onInterim: (interimText) => {
                    input.value = interimText;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                },
                onResult: (result) => {
                    updateUiState('idle');
                    const searchTerm = result.normalized || result.transcript;
                    input.value = searchTerm;
                    
                    // Trigger input and keyup events for existing listeners (e.g. filterCatalog)
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('keyup', { bubbles: true }));

                    if (config.onSearch) {
                        config.onSearch(searchTerm, result);
                    }
                },
                onError: (err) => {
                    updateUiState('idle');
                    console.warn('[AgriSpeechAPI] Voice search error:', err.message);
                    this._showSpeechToast(`🎙️ Voice input notice: ${err.message}`, 'warning');
                },
                onEnd: () => {
                    updateUiState('idle');
                }
            });
        };

        if (button) {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                toggleVoice();
            });
        }

        return {
            toggle: toggleVoice,
            stop: () => {
                this.stopListening();
                updateUiState('idle');
            }
        };
    }

    /**
     * Fallback Interactive Voice Simulator (Ideal for local testing without mic access)
     */
    simulateVoiceInput(sampleQuery, callbacks = {}) {
        const query = sampleQuery || this.sampleVoiceQueries[0].query;
        let index = 0;
        this.isListening = true;

        if (callbacks.onStart) callbacks.onStart();

        const words = query.split(' ');
        let accumulated = '';

        const timer = setInterval(() => {
            if (index < words.length) {
                accumulated += (index > 0 ? ' ' : '') + words[index];
                if (callbacks.onInterim) callbacks.onInterim(accumulated);
                index++;
            } else {
                clearInterval(timer);
                this.isListening = false;
                const normalized = this.normalizeAgriQuery(query);
                const resultPayload = {
                    transcript: query,
                    confidence: 0.98,
                    simulated: true,
                    normalized: normalized.normalized,
                    matchedCategory: normalized.category,
                    canonicalName: normalized.canonicalName
                };
                if (callbacks.onResult) callbacks.onResult(resultPayload);
                if (callbacks.onEnd) callbacks.onEnd();
            }
        }, 180);
    }

    /**
     * Dispatch custom DOM events for UI components
     */
    _dispatchSpeechEvent(type, detail) {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(`agrirent:speech-${type}`, { detail }));
        }
    }

    /**
     * Human-readable speech error mappings
     */
    _getFriendlyErrorMessage(errCode) {
        switch (errCode) {
            case 'not-allowed':
            case 'permission-denied':
                return 'Microphone access was denied. Please allow microphone permission in your browser.';
            case 'no-speech':
                return 'No voice was detected. Please tap the microphone and speak clearly.';
            case 'audio-capture':
                return 'No microphone found on this device.';
            case 'network':
                return 'Speech recognition network connection interrupted. Check your internet connection.';
            case 'language-not-supported':
                return 'Selected language is not supported by your speech engine.';
            default:
                return `Speech recognition notice (${errCode}).`;
        }
    }

    /**
     * Lightweight Toast Notification Helper
     */
    _showSpeechToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl text-xs font-bold transition-all transform duration-300 translate-y-10 opacity-0 ${
            type === 'warning' ? 'bg-amber-500 text-darkgreen-950' : 'bg-lightgreen-400 text-darkgreen-950'
        }`;
        toast.innerHTML = `<span>🎙️</span><span>${message}</span>`;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-10', 'opacity-0');
        });

        setTimeout(() => {
            toast.classList.add('translate-y-10', 'opacity-0');
            setTimeout(() => toast.remove(), 400);
        }, 3500);
    }

    /**
     * Simulation Modal if Speech API is blocked or unsupported
     */
    _promptSimulationModal(inputEl, onSelect) {
        const modalId = 'agri-voice-sim-modal';
        let modal = document.getElementById(modalId);
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-darkgreen-950/80 backdrop-blur-sm animate-fade-in';
        modal.innerHTML = `
            <div class="bg-darkgreen-900 border border-lightgreen-400/40 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
                <div class="flex items-center justify-between border-b border-lightgreen-400/20 pb-3">
                    <div class="flex items-center gap-2">
                        <span class="text-2xl">🎙️</span>
                        <div>
                            <h3 class="font-bold text-white text-sm">Voice Search Demo Prompts</h3>
                            <p class="text-[11px] text-emerald-300/80">Speech Recognition Simulation for Testing</p>
                        </div>
                    </div>
                    <button onclick="document.getElementById('${modalId}').remove()" class="text-emerald-400 hover:text-white text-lg font-bold">&times;</button>
                </div>
                <p class="text-xs text-emerald-200">
                    Your current browser environment has restricted native microphone permissions. Choose any agricultural prompt below to test Voice Search functionality:
                </p>
                <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
                    ${this.sampleVoiceQueries.map(item => `
                        <button type="button" data-query="${item.query}" class="voice-sample-btn w-full text-left p-2.5 rounded-xl bg-darkgreen-950 hover:bg-lightgreen-400/20 border border-lightgreen-400/20 hover:border-lightgreen-400 text-xs text-white flex items-center justify-between transition-colors">
                            <span class="font-medium">${item.query}</span>
                            <span class="text-[10px] bg-lightgreen-400/20 text-lightgreen-300 px-2 py-0.5 rounded font-mono">${item.lang}</span>
                        </button>
                    `).join('')}
                </div>
                <div class="pt-2 text-center">
                    <button onclick="document.getElementById('${modalId}').remove()" class="text-xs text-emerald-400 hover:underline">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelectorAll('.voice-sample-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const q = btn.getAttribute('data-query');
                modal.remove();
                this.simulateVoiceInput(q, {
                    onInterim: (text) => {
                        inputEl.value = text;
                        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    },
                    onResult: (res) => {
                        onSelect(res.normalized || res.transcript);
                    }
                });
            });
        });
    }
}

// Attach to window namespace
if (typeof window !== 'undefined') {
    window.AgriSpeechAPI = AgriSpeechAPI;
}
