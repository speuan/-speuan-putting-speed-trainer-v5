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
                updateDebugInfo('Got temporary camera access for enumeration');
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
        
        // Log all camera details for debugging
        availableCameras.forEach((camera, index) => {
            updateDebugInfo(`Camera ${index + 1}: ${camera.label || 'unnamed'}, ID: ${camera.deviceId.substring(0, 8)}...`);
        });
        
        // Always show camera select if we have a dropdown, even with just one camera
        if (cameraSelect) {
            // Clear existing options except the default
            while (cameraSelect.options.length > 0) {
                cameraSelect.remove(0);
            }
            
            // Add a default option
            const defaultOption = document.createElement('option');
            defaultOption.value = "";
            defaultOption.text = "Default (Back) Camera";
            cameraSelect.appendChild(defaultOption);
            
            // Add a front camera option regardless of enumeration
            const frontOption = document.createElement('option');
            frontOption.value = "front";
            frontOption.text = "Front Camera";
            cameraSelect.appendChild(frontOption);
            
            // Add a back camera option regardless of enumeration
            const backOption = document.createElement('option');
            backOption.value = "back";
            backOption.text = "Back Camera";
            cameraSelect.appendChild(backOption);
            
            // Add all enumerated cameras as well
            availableCameras.forEach((camera, index) => {
                if (camera.label) {  // Only add if we have a label
                    const option = document.createElement('option');
                    option.value = camera.deviceId;
                    option.text = camera.label || `Camera ${index + 1}`;
                    cameraSelect.appendChild(option);
                }
            });
            
            // Always show the select element
            cameraSelect.style.display = 'block';
            
            // Default to back camera (which is our second device-specific option)
            cameraSelect.selectedIndex = 2;  // Back camera option
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
        
        // Get selected camera option
        const selectedOption = cameraSelect ? cameraSelect.value : '';
        updateDebugInfo(`Selected camera option: ${selectedOption}`);
        
        // Set up constraints based on selection
        let constraints = {
            audio: false,
            video: {}
        };
        
        // Handle different selection types
        if (selectedOption === 'front') {
            // Explicitly request front camera
            constraints.video.facingMode = 'user';
            updateDebugInfo('Using front camera by facingMode: user');
        } 
        else if (selectedOption === 'back') {
            // Explicitly request back camera
            constraints.video.facingMode = 'environment';
            updateDebugInfo('Using back camera by facingMode: environment');
        }
        else if (selectedOption) {
            // Using specific device ID
            constraints.video.deviceId = { exact: selectedOption };
            updateDebugInfo(`Using specific camera ID: ${selectedOption.substring(0,8)}...`);
        }
        else {
            // Default to back camera
            constraints.video.facingMode = 'environment';
            updateDebugInfo('Using default back camera (environment facing)');
        }
        
        // Add resolution preferences
        constraints.video.width = { ideal: isIOS ? 640 : 1280 };
        constraints.video.height = { ideal: isIOS ? 480 : 720 };
        
        updateDebugInfo('Requesting camera with constraints: ' + JSON.stringify(constraints));
        
        try {
            // Request camera access
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            updateDebugInfo('Camera access granted with specified constraints');
            
            // Log which track we got
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                updateDebugInfo(`Using camera: ${videoTrack.label}`);
            }
        } catch (permissionError) {
            updateDebugInfo('Camera error: ' + permissionError.name + ': ' + permissionError.message);
            
            // Try with simpler constraints if the first attempt failed
            updateDebugInfo('Trying with minimal constraints');
            try {
                // Default to environment facing if available
                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: true,
                    audio: false
                });
                updateDebugInfo('Camera access granted with minimal constraints');
                
                // Log which camera we actually got
                const videoTrack = stream.getVideoTracks()[0];
                if (videoTrack) {
                    updateDebugInfo(`Fallback camera: ${videoTrack.label}`);
                }
            } catch (simpleError) {
                updateDebugInfo('Simple constraints also failed: ' + simpleError.message);
                throw simpleError;
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
                    detections.map(d => `${d.class}(${Math.round(d.confidence*100)}%)`).join(', ');
                detectionStatus.textContent = message;
                updateDebugInfo(message);
                
                // Calculate ball speed if we have ball detections
                if (detections.some(d => d.class === 'ball_golf')) {
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
    const ballDetections = detections.filter(d => d.class === 'ball_golf');
    
    updateDebugInfo(`Found ${ballDetections.length} ball detections for speed calculation`);
    
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