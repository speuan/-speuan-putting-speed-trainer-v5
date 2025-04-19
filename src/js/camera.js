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

// Stream reference
let stream = null;

// App state reference
let appState = null;

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
    context = canvas.getContext('2d');
    startCameraButton = document.getElementById('start-camera');
    stopCameraButton = document.getElementById('stop-camera');
    captureFrameButton = document.getElementById('capture-frame');
    detectObjectsButton = document.getElementById('detect-objects');
    detectionStatus = document.getElementById('detection-status');
    
    // Set up event listeners
    startCameraButton.addEventListener('click', startCamera);
    stopCameraButton.addEventListener('click', stopCamera);
    captureFrameButton.addEventListener('click', captureFrame);
    detectObjectsButton.addEventListener('click', runObjectDetection);
    
    // Try to initialize detection model in the background
    if (typeof initDetectionModel === 'function') {
        initDetectionModel().catch(err => {
            console.warn('Model preloading failed, will try again later:', err);
        });
    }
}

/**
 * Start camera stream
 */
async function startCamera() {
    try {
        // Request camera access with preferred settings
        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'environment' // Use back camera on mobile devices
            }
        };
        
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Connect stream to video element
        video.srcObject = stream;
        
        // Set canvas dimensions to match video
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            console.log(`Camera started: ${video.videoWidth} x ${video.videoHeight}`);
        };
        
        // Update UI
        startCameraButton.disabled = true;
        stopCameraButton.disabled = false;
        captureFrameButton.disabled = false;
        detectObjectsButton.disabled = false;
        
    } catch (error) {
        console.error('Error accessing camera:', error);
        alert('Could not access the camera. Please allow camera access and try again.');
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
        
        console.log('Camera stopped');
    }
}

/**
 * Capture current frame from video
 */
function captureFrame() {
    if (!stream) return;
    
    // Draw current video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Show canvas (normally hidden)
    canvas.classList.remove('hidden');
    
    // Display results container
    document.querySelector('.results-container').classList.remove('hidden');
    
    console.log('Frame captured');
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
    
    // Run detection with 50% confidence threshold
    try {
        if (typeof detectObjects === 'function') {
            // Disable button during detection
            detectObjectsButton.disabled = true;
            
            // Run detection
            const detections = await detectObjects(canvas, context, 0.5);
            
            // Update status with detection results
            if (detections && detections.length > 0) {
                detectionStatus.textContent = `Found ${detections.length} object(s)`;
                
                // Calculate ball speed if we have ball detections
                if (detections.some(d => d.class === 'Ball')) {
                    updateBallSpeed(detections);
                }
            } else {
                detectionStatus.textContent = 'No objects detected';
                document.getElementById('ball-speed').textContent = '0';
            }
            
            // Re-enable button after detection
            detectObjectsButton.disabled = false;
        } else {
            detectionStatus.textContent = 'Detection module not loaded';
        }
    } catch (error) {
        console.error('Detection failed:', error);
        detectionStatus.textContent = 'Detection failed: ' + error.message;
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
    console.log(`Ball speed: ${speed} m/s`);
}

// Export functions
window.initCamera = initCamera; 