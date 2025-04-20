/**
 * Camera handling module
 */

// DOM Elements
let video;
let canvas;
let context;
let startCameraButton;
let stopCameraButton;
let captureFrameButton;
let detectObjectsButton;
let detectionStatus;
let debugInfo;
let cameraSelect;

// Stream reference
let stream = null;

// App state reference
let appState = null;

// iOS detection
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// Available cameras
let availableCameras = [];

// Log iOS detection result immediately
if (typeof window.debugInfo !== 'undefined') {
    const iosMessage = isIOS 
        ? `Detected iOS device: ${navigator.userAgent}` 
        : `Not an iOS device: ${navigator.userAgent}`;
    
    if (typeof window.updateDebugInfo === 'function') {
        window.updateDebugInfo(iosMessage);
    } else {
        console.log(iosMessage);
        const timestamp = new Date().toISOString().substring(11, 19);
        if (window.debugInfo) {
            window.debugInfo.textContent += `\n[${timestamp}] ${iosMessage}`;
        }
    }
}

/**
 * Initialize camera handling
 * @param {Object} state - Application state object
 */
function initCamera(state) {
    // Store reference to app state
    appState = state;
    
    try {
        // Get DOM elements
        video = document.getElementById('video');
        canvas = document.getElementById('canvas');
        context = canvas.getContext('2d', { willReadFrequently: true }); // Optimize for iOS
        startCameraButton = document.getElementById('start-camera');
        stopCameraButton = document.getElementById('stop-camera');
        captureFrameButton = document.getElementById('capture-frame');
        detectObjectsButton = document.getElementById('detect-objects');
        detectionStatus = document.getElementById('detection-status');
        debugInfo = document.getElementById('debug-info');
        cameraSelect = document.getElementById('camera-select');
        
        // Verify elements were found
        if (!video || !canvas || !startCameraButton) {
            throw new Error('Required DOM elements not found');
        }
        
        // Set up event listeners
        startCameraButton.addEventListener('click', startCamera);
        stopCameraButton.addEventListener('click', stopCamera);
        captureFrameButton.addEventListener('click', captureFrame);
        detectObjectsButton.addEventListener('click', runObjectDetection);
        
        // Camera switching
        if (cameraSelect) {
            cameraSelect.addEventListener('change', () => {
                if (stream) {
                    // If camera is active, restart it with new device
                    stopCamera();
                    startCamera();
                }
            });
        }
        
        // Enumerate available cameras
        enumerateCameras();
        
        // Add additional debug info
        updateDebugInfo('Camera module initialized successfully');
        
        // Log environment info
        updateDebugInfo(`Environment: iOS=${isIOS}, screen=${window.innerWidth}x${window.innerHeight}`);
        
        // Try to initialize detection model in the background
        if (typeof initDetectionModel === 'function') {
            updateDebugInfo('Preloading model...');
            initDetectionModel().then(() => {
                updateDebugInfo('Model preloaded successfully');
            }).catch(err => {
                updateDebugInfo('Model preloading failed: ' + err.message);
            });
        }
    } catch (error) {
        console.error('Camera initialization error:', error);
        if (typeof updateDebugInfo === 'function') {
            updateDebugInfo('Camera init ERROR: ' + error.message);
        } else if (window.debugInfo) {
            window.debugInfo.textContent += '\nCamera init ERROR: ' + error.message;
        }
    }
}

/**
 * Enumerate available cameras and populate the selection dropdown
 */
async function enumerateCameras() {
    // Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        updateDebugInfo('Media devices API not available');
        return;
    }
    
    try {
        // Request permission first to get access to device labels
        await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
            .then(stream => {
                // Stop the stream immediately
                stream.getTracks().forEach(track => track.stop());
            })
            .catch(err => {
                updateDebugInfo('Permission for camera access denied: ' + err.message);
                return;
            });
        
        // Now enumerate devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // Filter to get only video input devices (cameras)
        availableCameras = devices.filter(device => device.kind === 'videoinput');
        
        updateDebugInfo(`Found ${availableCameras.length} camera(s)`);
        
        // If we have a camera select dropdown and multiple cameras
        if (cameraSelect && availableCameras.length > 1) {
            // Clear existing options except the default
            while (cameraSelect.options.length > 1) {
                cameraSelect.remove(1);
            }
            
            // Add cameras to dropdown
            availableCameras.forEach((camera, index) => {
                const option = document.createElement('option');
                option.value = camera.deviceId;
                // Use label if available, otherwise use a generic name
                option.text = camera.label || `Camera ${index + 1}`;
                cameraSelect.appendChild(option);
            });
            
            // Show the select element
            cameraSelect.style.display = 'block';
            
            // Pre-select the back camera if this is a mobile device
            if (isIOS || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                const backCameraKeywords = ['back', 'rear', 'environment', '1'];
                // Try to find a back camera option
                for (let i = 0; i < cameraSelect.options.length; i++) {
                    const option = cameraSelect.options[i];
                    const optionText = option.text.toLowerCase();
                    if (backCameraKeywords.some(keyword => optionText.includes(keyword))) {
                        cameraSelect.selectedIndex = i;
                        break;
                    }
                }
            }
        } else {
            // Hide the select if there's only one camera
            if (cameraSelect) {
                cameraSelect.style.display = 'none';
            }
        }
    } catch (error) {
        updateDebugInfo('Error enumerating cameras: ' + error.message);
        console.error('Error enumerating cameras:', error);
    }
}

/**
 * Start camera stream
 */
async function startCamera() {
    try {
        updateDebugInfo('Starting camera...');
        
        // Check if camera access is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Camera API not available in this browser/device');
        }
        
        updateDebugInfo('Camera API available, checking permissions...');
        
        // If we already have a stream, stop it first
        if (stream) {
            updateDebugInfo('Stopping existing camera stream before starting new one');
            stopCamera();
        }
        
        // Get selected camera ID if available
        const selectedCameraId = cameraSelect && cameraSelect.value ? cameraSelect.value : '';
        
        // Request camera access with preferred settings
        // Special handling for iOS
        const constraints = {
            audio: false,
            video: {
                width: { ideal: isIOS ? 640 : 1280 },
                height: { ideal: isIOS ? 480 : 720 },
                facingMode: selectedCameraId ? undefined : 'environment', // Use back camera by default
                deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined
            }
        };
        
        // Log which camera we're trying to use
        if (selectedCameraId) {
            updateDebugInfo(`Trying to use camera with ID: ${selectedCameraId}`);
        } else {
            updateDebugInfo('Trying to use default environment-facing camera');
        }
        
        updateDebugInfo('Requesting camera with constraints: ' + JSON.stringify(constraints));
        
        try {
            // iOS Safari requires user interaction before getUserMedia
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            updateDebugInfo('Camera access granted with standard constraints');
        } catch (permissionError) {
            updateDebugInfo('Camera error: ' + permissionError.name + ': ' + permissionError.message);
            
            // Try with simpler constraints if the first attempt failed
            if (permissionError.name === 'OverconstrainedError' || 
                permissionError.name === 'ConstraintNotSatisfiedError' || 
                permissionError.name === 'NotReadableError') {
                
                updateDebugInfo('Trying with simpler constraints');
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ 
                        video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true,
                        audio: false
                    });
                    updateDebugInfo('Camera access granted with simplified constraints');
                } catch (simpleError) {
                    updateDebugInfo('Simple constraints also failed: ' + simpleError.message);
                    throw simpleError;
                }
            } else {
                throw permissionError; // Re-throw if it's not a constraints issue
            }
        }
        
        // Verify we got a usable stream
        if (!stream || !stream.active) {
            throw new Error('Camera stream not active after permissions granted');
        }
        
        updateDebugInfo('Stream active, tracks: ' + stream.getTracks().length);
        
        // Connect stream to video element
        video.srcObject = stream;
        
        // iOS Safari specific fixes
        if (isIOS) {
            updateDebugInfo('Applying iOS specific camera fixes');
            video.setAttribute('playsinline', true); // Ensure this attribute is set
            video.muted = true; // Ensure video is muted to avoid autoplay issues
            
            // iOS requires a delay sometimes before playing
            setTimeout(() => {
                video.play().then(() => {
                    updateDebugInfo('Video playback started after delay');
                }).catch(e => {
                    updateDebugInfo('Failed to play video after delay: ' + e.message);
                });
            }, 100);
        } else {
            // Try to play the video immediately for non-iOS
            video.play().then(() => {
                updateDebugInfo('Video playback started immediately');
            }).catch(e => {
                updateDebugInfo('Failed to play video immediately: ' + e.message);
            });
        }
        
        // Set event listeners for video
        video.onloadedmetadata = () => {
            // Make canvas match video dimensions exactly
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            updateDebugInfo(`Video metadata loaded: ${video.videoWidth}x${video.videoHeight}`);
            
            // Try playing again after metadata is loaded (important for iOS)
            if (video.paused) {
                video.play().catch(e => {
                    updateDebugInfo('Error playing video after metadata: ' + e.message);
                });
            }
        };
        
        // Make sure video is playing (especially important for iOS)
        video.oncanplay = () => {
            updateDebugInfo('Video can play event fired');
            if (video.paused) {
                video.play().catch(e => {
                    updateDebugInfo('Error playing video on canplay: ' + e.message);
                });
            }
        };
        
        // Add error handling for video element
        video.onerror = (e) => {
            updateDebugInfo('Video element error: ' + (video.error ? video.error.message : e));
        };
        
        // Update UI
        startCameraButton.disabled = true;
        stopCameraButton.disabled = false;
        captureFrameButton.disabled = false;
        detectObjectsButton.disabled = false;
        
    } catch (error) {
        console.error('Error accessing camera:', error);
        updateDebugInfo('Camera access FAILED: ' + error.name + ': ' + error.message);
        alert('Could not access the camera. Please allow camera access and try again: ' + error.message);
        
        // Re-enable start button
        startCameraButton.disabled = false;
    }
}

/**
 * Stop camera stream
 */
function stopCamera() {
    if (stream) {
        // Stop all tracks in the stream
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        stream = null;
        
        // Update UI
        startCameraButton.disabled = false;
        stopCameraButton.disabled = true;
        captureFrameButton.disabled = true;
        detectObjectsButton.disabled = true;
        
        updateDebugInfo('Camera stopped');
    }
}

/**
 * Capture current frame from video
 */
function captureFrame() {
    if (!stream) return;
    
    try {
        // Draw current video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Show canvas (normally hidden)
        canvas.classList.remove('hidden');
        
        // Display results container
        document.querySelector('.results-container').classList.remove('hidden');
        
        updateDebugInfo(`Frame captured: ${canvas.width}x${canvas.height}`);
    } catch (error) {
        updateDebugInfo('Error capturing frame: ' + error.message);
    }
}

/**
 * Run object detection on the current frame
 */
async function runObjectDetection() {
    if (!stream) return;
    
    // First capture frame if not already done
    if (canvas.classList.contains('hidden')) {
        captureFrame();
    }
    
    // Update status
    detectionStatus.textContent = 'Running...';
    updateDebugInfo('Starting object detection...');
    
    // Run detection with 50% confidence threshold
    try {
        if (typeof detectObjects === 'function') {
            // Disable button during detection
            detectObjectsButton.disabled = true;
            
            // Run detection
            updateDebugInfo('Calling detectObjects...');
            const detections = await detectObjects(canvas, context, 0.5);
            
            // Update status with detection results
            if (detections && detections.length > 0) {
                const message = `Found ${detections.length} object(s): ` + 
                    detections.map(d => `${d.class}(${Math.round(d.score*100)}%)`).join(', ');
                detectionStatus.textContent = message;
                updateDebugInfo(message);
                
                // Calculate ball speed if we have ball detections
                if (detections.some(d => d.class === 'Ball')) {
                    updateBallSpeed(detections);
                }
            } else {
                detectionStatus.textContent = 'No objects detected';
                updateDebugInfo('No objects detected above 50% threshold');
                document.getElementById('ball-speed').textContent = '0';
            }
            
            // Re-enable button after detection
            detectObjectsButton.disabled = false;
        } else {
            detectionStatus.textContent = 'Detection module not loaded';
            updateDebugInfo('ERROR: Detection module not loaded');
        }
    } catch (error) {
        console.error('Detection failed:', error);
        detectionStatus.textContent = 'Detection failed: ' + error.message;
        updateDebugInfo('Detection error: ' + error.message);
        detectObjectsButton.disabled = false;
    }
}

/**
 * Update ball speed based on detections
 * @param {Array} detections - Array of detected objects
 */
function updateBallSpeed(detections) {
    // This is a placeholder - in a real app, we would calculate speed
    // from multiple frames over time and use the calibrated pixel-to-cm ratio
    const ballDetections = detections.filter(d => d.class === 'Ball');
    
    // For now, we'll just simulate a realistic speed
    let speed;
    if (ballDetections.length > 0) {
        // Generate a more realistic golf putting speed (between 1.5 and 3.5 m/s)
        speed = (Math.random() * 2 + 1.5).toFixed(2);
    } else {
        speed = '0';
    }
    
    document.getElementById('ball-speed').textContent = speed;
    updateDebugInfo(`Ball speed: ${speed} m/s`);
}

/**
 * Update debug information
 * @param {string} message - Debug message
 */
function updateDebugInfo(message) {
    const timestamp = new Date().toISOString().substring(11, 19);
    const currentDebug = debugInfo.textContent;
    
    // Only keep the most recent 5 debug messages
    const lines = currentDebug.split('\n');
    if (lines.length > 5) {
        lines.shift(); // Remove oldest line
    }
    
    // Add new message
    lines.push(`[${timestamp}] ${message}`);
    
    // Update display
    debugInfo.textContent = lines.join('\n');
}

// Export functions
window.initCamera = initCamera;
window.startCamera = startCamera;
window.updateDebugInfo = updateDebugInfo; 