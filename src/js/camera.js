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
    
    // Set up event listeners
    startCameraButton.addEventListener('click', startCamera);
    stopCameraButton.addEventListener('click', stopCamera);
    captureFrameButton.addEventListener('click', captureFrame);
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
    
    // In a real application, we would now process the frame to detect the ball
    console.log('Frame captured');
    
    // Simulate ball detection (in a real app, we would use computer vision here)
    simulateBallDetection();
}

/**
 * Simulate ball detection (placeholder)
 */
function simulateBallDetection() {
    // This is just a placeholder - we'll implement real detection later
    const randomSpeed = (Math.random() * 3 + 1).toFixed(2);
    document.getElementById('ball-speed').textContent = randomSpeed;
    
    console.log(`Simulated ball speed: ${randomSpeed} m/s`);
}

// Export functions
window.initCamera = initCamera; 