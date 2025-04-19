/**
 * Golf Putting Speed Trainer
 * Main application file
 */

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
    console.log('Golf Putting Speed Trainer initialized');
    
    // App state
    const appState = {
        isRecording: false,
        frameCount: 0,
        ballPositions: [],
        pixelToCmRatio: 1, // To be calibrated
    };
    
    // Initialize camera module
    if (typeof initCamera === 'function') {
        initCamera(appState);
    } else {
        console.error('Camera module not loaded');
    }
    
    // Event listeners for buttons are handled in camera.js
}); 