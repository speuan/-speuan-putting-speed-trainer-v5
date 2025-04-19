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

// Stream reference
let stream = null;

// App state reference
let appState = null;

// iOS detection
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

/**
 * Initialize camera handling
 * @param {Object} state - Application state object
 */
function initCamera(state) {
    // Store reference to app state
    appState = state;
    
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
    
    // Set up event listeners
    startCameraButton.addEventListener('click', startCamera);
    stopCameraButton.addEventListener('click', stopCamera);
    captureFrameButton.addEventListener('click', captureFrame);
    detectObjectsButton.addEventListener('click', runObjectDetection);
    
    // Add additional debug info
    updateDebugInfo('Camera module initialized');
    
    // Try to initialize detection model in the background
    if (typeof initDetectionModel === 'function') {
        updateDebugInfo('Preloading model...');
        initDetectionModel().then(() => {
            updateDebugInfo('Model preloaded successfully');
        }).catch(err => {
            updateDebugInfo('Model preloading failed: ' + err.message);
        });
    }
}

/**
 * Start camera stream
 */
async function startCamera() {
    try {
        updateDebugInfo('Starting camera...');
        
        // Request camera access with preferred settings
        // Special handling for iOS
        const constraints = {
            audio: false,
            video: {
                width: { ideal: isIOS ? 640 : 1280 },
                height: { ideal: isIOS ? 480 : 720 },
                facingMode: 'environment' // Use back camera on mobile devices
            }
        };
        
        updateDebugInfo('Requesting camera with constraints: ' + JSON.stringify(constraints));
        
        try {
            // iOS Safari requires user interaction before getUserMedia
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            updateDebugInfo('Camera access granted');
        } catch (permissionError) {
            updateDebugInfo('Camera permission error: ' + permissionError.message);
            // Try with simpler constraints if the first attempt failed
            if (permissionError.name === 'OverconstrainedError' || permissionError.name === 'ConstraintNotSatisfiedError') {
                updateDebugInfo('Trying with simpler constraints');
                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: true,
                    audio: false
                });
                updateDebugInfo('Camera access granted with simplified constraints');
            } else {
                throw permissionError; // Re-throw if it's not a constraints issue
            }
        }
        
        // Connect stream to video element
        video.srcObject = stream;
        
        // iOS Safari specific fixes
        if (isIOS) {
            updateDebugInfo('Applying iOS specific camera fixes');
            video.setAttribute('playsinline', true); // Ensure this attribute is set
            video.muted = true; // Ensure video is muted to avoid autoplay issues
        }
        
        // Try to play the video immediately to help with iOS
        try {
            await video.play();
            updateDebugInfo('Video playback started');
        } catch (playError) {
            updateDebugInfo('Auto-play failed, will try on metadata: ' + playError.message);
            // Continue anyway, we'll try again in the metadata event
        }
        
        // Set canvas dimensions to match video
        video.onloadedmetadata = () => {
            // Make canvas match video dimensions exactly
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            updateDebugInfo(`Camera started: ${video.videoWidth}x${video.videoHeight}`);
            
            // Try playing again after metadata is loaded (important for iOS)
            if (video.paused) {
                video.play().catch(e => {
                    updateDebugInfo('Error playing video after metadata: ' + e.message);
                });
            }
        };
        
        // Make sure video is playing (especially important for iOS)
        video.oncanplay = () => {
            if (video.paused) {
                video.play().catch(e => {
                    updateDebugInfo('Error playing video on canplay: ' + e.message);
                });
            }
        };
        
        // Update UI
        startCameraButton.disabled = true;
        stopCameraButton.disabled = false;
        captureFrameButton.disabled = false;
        detectObjectsButton.disabled = false;
        
    } catch (error) {
        console.error('Error accessing camera:', error);
        updateDebugInfo('Camera error: ' + error.message);
        alert('Could not access the camera. Please allow camera access and try again.');
        
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
window.updateDebugInfo = updateDebugInfo; 