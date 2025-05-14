/**
 * Main application entry point
 * Golf Putting Speed Trainer
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize controllers
    const cameraController = new CameraController();
    const uiController = new UIController();
    
    // DOM elements
    const startCameraBtn = document.getElementById('start-camera');
    const captureBtn = document.getElementById('capture-button');
    const newCaptureBtn = document.getElementById('new-capture-button');
    const backToLiveBtn = document.getElementById('back-to-live-button');
    
    // Initialize event listeners
    startCameraBtn.addEventListener('click', async () => {
        try {
            await cameraController.startCamera();
            captureBtn.disabled = false;
            startCameraBtn.disabled = true;
        } catch (error) {
            console.error('Failed to start camera:', error);
            alert('Could not access camera. Please check permissions and try again.');
        }
    });
    
    captureBtn.addEventListener('click', () => {
        // Capture a single frame
        const frame = cameraController.captureFrame();
        
        // Show the captured image in the results UI
        uiController.showCapturedImage(frame);
    });
    
    newCaptureBtn.addEventListener('click', () => {
        // Reset the UI and camera controller to take a new capture
        uiController.resetUI();
        cameraController.reset();
    });
    
    backToLiveBtn.addEventListener('click', () => {
        // Just go back to live view without resetting the captured frame
        uiController.resetUI();
        cameraController.startVideoDisplay(); // Resume video display
    });
}); 