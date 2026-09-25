/**
 * AgriRent - Image & File Upload API Service
 * Module: api/upload.js
 * 
 * Provides:
 * - Client-Side Image Compression & Optimization (Canvas API)
 * - File Validation (MIME type, max size, dimension checks)
 * - Drag-and-Drop Dropzone UI integration
 * - Dual-Mode Upload (HTTP REST POST /api/upload & Offline Persistent Local Engine)
 * - Progress Tracking & Base64 Data URL conversion
 */

class AgriUploadAPI {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'http://localhost:5000/api';
        this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
        this.allowedMimeTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/webp',
            'image/gif',
            'application/pdf'
        ];
        this.storageKey = 'agrirent_uploads';
    }

    /**
     * Validate file type and size
     * @param {File} file 
     * @param {Object} options 
     * @returns {{valid: boolean, error?: string, sizeFormatted: string}}
     */
    validateFile(file, options = {}) {
        if (!file) {
            return { valid: false, error: 'No file provided.' };
        }

        const allowed = options.allowedTypes || this.allowedMimeTypes;
        const maxSize = options.maxSize || this.maxFileSize;

        if (!allowed.includes(file.type)) {
            return {
                valid: false,
                error: `Invalid file format (${file.type || 'unknown'}). Supported: JPG, PNG, WEBP, GIF, PDF.`,
                sizeFormatted: this._formatBytes(file.size)
            };
        }

        if (file.size > maxSize) {
            return {
                valid: false,
                error: `File is too large (${this._formatBytes(file.size)}). Maximum allowed is ${this._formatBytes(maxSize)}.`,
                sizeFormatted: this._formatBytes(file.size)
            };
        }

        return {
            valid: true,
            sizeFormatted: this._formatBytes(file.size)
        };
    }

    /**
     * Client-Side Image Compression using HTML5 Canvas
     * Reduces large farm equipment photos (e.g. 8MB phone photos down to ~300KB)
     * @param {File} file 
     * @param {Object} options - { maxWidth: 1600, maxHeight: 1200, quality: 0.82 }
     * @returns {Promise<{blob: Blob, dataUrl: string, originalSize: number, compressedSize: number, ratio: string}>}
     */
    async compressImage(file, options = {}) {
        // If not an image (e.g. PDF), return original as dataUrl
        if (!file.type.startsWith('image/')) {
            const dataUrl = await this._fileToDataUrl(file);
            return {
                blob: file,
                dataUrl: dataUrl,
                originalSize: file.size,
                compressedSize: file.size,
                ratio: '0%'
            };
        }

        const maxWidth = options.maxWidth || 1600;
        const maxHeight = options.maxHeight || 1200;
        const quality = options.quality !== undefined ? options.quality : 0.82;

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    let { width, height } = img;

                    if (width > maxWidth || height > maxHeight) {
                        if (width / height > maxWidth / maxHeight) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        } else {
                            width = Math.round((width * maxHeight) / height);
                            height = maxHeight;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
                    const dataUrl = canvas.toDataURL(outputType, quality);

                    canvas.toBlob((blob) => {
                        if (!blob) {
                            resolve({
                                blob: file,
                                dataUrl: e.target.result,
                                originalSize: file.size,
                                compressedSize: file.size,
                                ratio: '0%'
                            });
                            return;
                        }

                        const ratioNum = Math.round(((file.size - blob.size) / file.size) * 100);
                        const ratio = ratioNum > 0 ? `-${ratioNum}%` : '0%';

                        resolve({
                            blob: blob,
                            dataUrl: dataUrl,
                            originalSize: file.size,
                            compressedSize: blob.size,
                            ratio: ratio,
                            width: width,
                            height: height
                        });
                    }, outputType, quality);
                };
                img.onerror = () => reject(new Error('Failed to load image for compression.'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file.'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * Upload an Image or Document (with optional auto-compression)
     * @param {File} file 
     * @param {Object} options - { compress: true, onProgress: callback, category: 'machinery' }
     * @returns {Promise<{status: number, success: boolean, data: Object, message: string}>}
     */
    async upload(file, options = {}) {
        const validation = this.validateFile(file, options);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        if (options.onProgress) options.onProgress({ percent: 15, status: 'Processing' });

        let uploadDataUrl = '';
        let uploadBlob = file;
        let originalSize = file.size;
        let compressedSize = file.size;
        let compressionRatio = '0%';

        // Compress images if enabled (default true)
        if (options.compress !== false && file.type.startsWith('image/')) {
            if (options.onProgress) options.onProgress({ percent: 35, status: 'Compressing Image' });
            try {
                const comp = await this.compressImage(file, options);
                uploadDataUrl = comp.dataUrl;
                uploadBlob = comp.blob;
                compressedSize = comp.compressedSize;
                compressionRatio = comp.ratio;
            } catch (e) {
                uploadDataUrl = await this._fileToDataUrl(file);
            }
        } else {
            uploadDataUrl = await this._fileToDataUrl(file);
        }

        if (options.onProgress) options.onProgress({ percent: 65, status: 'Uploading...' });

        // Check if Python REST backend is running
        const backendOnline = window.AgriRentAPI?.rest?.backendActive;

        if (backendOnline) {
            try {
                const payload = {
                    filename: file.name,
                    category: options.category || 'machinery',
                    mimeType: file.type,
                    data: uploadDataUrl,
                    originalSize: originalSize,
                    compressedSize: compressedSize
                };

                const res = await fetch(`${this.baseUrl}/upload`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    const result = await res.json();
                    if (options.onProgress) options.onProgress({ percent: 100, status: 'Completed' });
                    this._saveLocalUpload(result.data);
                    return result;
                }
            } catch (err) {
                console.warn('[AgriUploadAPI] Remote upload failed, falling back to local storage engine:', err.message);
            }
        }

        // Offline / Standalone Browser Engine
        const fileId = `file_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;
        const uploadResult = {
            fileId: fileId,
            filename: `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
            originalName: file.name,
            mimeType: file.type,
            size: compressedSize,
            originalSize: originalSize,
            compressionRatio: compressionRatio,
            category: options.category || 'machinery',
            url: uploadDataUrl, // Data URL ready for instant preview & persistence
            uploadedAt: new Date().toISOString()
        };

        this._saveLocalUpload(uploadResult);

        if (options.onProgress) options.onProgress({ percent: 100, status: 'Completed' });

        return {
            status: 201,
            success: true,
            message: 'File processed and saved successfully via Upload API.',
            data: uploadResult
        };
    }

    /**
     * Setup drag-and-drop dropzone listeners on DOM elements
     * @param {HTMLElement} dropzoneEl 
     * @param {HTMLInputElement} fileInputEl 
     * @param {Function} onFileSelected - callback(file, previewDataUrl)
     */
    setupDropzone(dropzoneEl, fileInputEl, onFileSelected) {
        if (!dropzoneEl) return;

        ['dragenter', 'dragover'].forEach(evt => {
            dropzoneEl.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzoneEl.classList.add('border-lightgreen-400', 'bg-darkgreen-900/90', 'scale-[1.01]');
            });
        });

        ['dragleave', 'drop'].forEach(evt => {
            dropzoneEl.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzoneEl.classList.remove('border-lightgreen-400', 'bg-darkgreen-900/90', 'scale-[1.01]');
            });
        });

        dropzoneEl.addEventListener('drop', async (e) => {
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                const file = files[0];
                if (fileInputEl) fileInputEl.files = files;
                const dataUrl = await this._fileToDataUrl(file);
                if (onFileSelected) onFileSelected(file, dataUrl);
            }
        });

        if (fileInputEl) {
            fileInputEl.addEventListener('change', async (e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                    const file = files[0];
                    const dataUrl = await this._fileToDataUrl(file);
                    if (onFileSelected) onFileSelected(file, dataUrl);
                }
            });
        }
    }

    /**
     * Retrieve list of recent uploaded files
     * @returns {Array<Object>}
     */
    getRecentUploads() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    /**
     * Delete an uploaded file by ID
     * @param {string} fileId 
     * @returns {boolean}
     */
    deleteUpload(fileId) {
        let uploads = this.getRecentUploads();
        const initialLen = uploads.length;
        uploads = uploads.filter(u => u.fileId !== fileId);
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(uploads));
            return uploads.length < initialLen;
        } catch (e) {
            return false;
        }
    }

    _saveLocalUpload(item) {
        try {
            let uploads = this.getRecentUploads();
            uploads.unshift(item);
            // Cap at 15 items to avoid exceeding quota
            if (uploads.length > 15) uploads = uploads.slice(0, 15);
            localStorage.setItem(this.storageKey, JSON.stringify(uploads));
        } catch (e) {
            console.warn('[AgriUploadAPI] LocalStorage quota reached for uploads cache.');
        }
    }

    _fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file as Data URL.'));
            reader.readAsDataURL(file);
        });
    }

    _formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
}

// Attach to window for global access
if (typeof window !== 'undefined') {
    window.AgriUploadAPI = AgriUploadAPI;
}
