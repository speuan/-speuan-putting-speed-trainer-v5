/**
 * Golf Putting Speed Trainer
 * Main application file
 */

// Global debug helper
function debugLog(message) {
    console.log(message);
    if (window.debugInfo) {
        const timestamp = new Date().toISOString().substring(11, 19);
        const currentDebug = window.debugInfo.textContent;
        const lines = currentDebug.split('\n');
        if (lines.length > 8) {
            lines.shift();
        }
        lines.push(`[${timestamp}] ${message}`);
        window.debugInfo.textContent = lines.join('\n');
    }
}

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
    debugLog('DOM loaded, initializing app...');
    
    // Check camera capabilities directly
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        debugLog('Camera API is available on this device');
    } else {
        debugLog('⚠️ Camera API NOT available on this device!');
    }
    
    // App state
    const appState = {
        isRecording: false,
        frameCount: 0,
        ballPositions: [],
        pixelToCmRatio: 1, // To be calibrated
    };
    
    // Add a slight delay before initializing the camera module
    // This helps ensure the DOM is fully ready on some mobile browsers
    debugLog('Setting up initialization delay...');
    setTimeout(() => {
        // Initialize camera module
        if (typeof window.initCamera === 'function') {
            debugLog('Initializing camera module...');
            window.initCamera(appState);
            
            // Add a direct handler to the start button in case event listeners failed
            const startCameraButton = document.getElementById('start-camera');
            if (startCameraButton) {
                debugLog('Adding backup camera start handler');
                startCameraButton.onclick = function() {
                    debugLog('Start camera clicked (direct handler)');
                    if (typeof window.startCamera === 'function') {
                        window.startCamera();
                    } else {
                        debugLog('⚠️ startCamera function not found!');
                        alert('Camera initialization failed. Please reload the page and try again.');
                    }
                };
            }
        } else {
            debugLog('⚠️ Camera module not loaded! Check script loading.');
        }
    }, 500);
}); 