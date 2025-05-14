/**
 * Main application entry point
 * Golf Putting Speed Trainer
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');
    
    // Initialize controllers
    const cameraController = new CameraController();
    const uiController = new UIController();
    
    // DOM elements
    const startCameraBtn = document.getElementById('start-camera');
    const captureBtn = document.getElementById('capture-button');
    const newCaptureBtn = document.getElementById('new-capture-button');
    const backToLiveBtn = document.getElementById('back-to-live-button');
    
    console.log('Elements found:', {
        startCameraBtn,
        captureBtn,
        newCaptureBtn,
        backToLiveBtn
    });
    
    // Initialize event listeners
    startCameraBtn.addEventListener('click', async () => {
        console.log('Start camera button clicked');
        try {
            await cameraController.startCamera();
            captureBtn.disabled = false;
            startCameraBtn.disabled = true;
            console.log('Camera started successfully');
        } catch (error) {
            console.error('Failed to start camera:', error);
            alert('Could not access camera. Please check permissions and try again.');
        }
    });
    
    captureBtn.addEventListener('click', () => {
        console.log('Capture button clicked');
        // Capture a single frame
        const frame = cameraController.captureFrame();
        
        // Show the captured image in the display canvas
        uiController.showCapturedImage(frame);
    });
    
    newCaptureBtn.addEventListener('click', () => {
        console.log('New capture button clicked');
        // Reset the UI and camera controller to take a new capture
        uiController.resetUI();
        cameraController.reset();
    });
    
    backToLiveBtn.addEventListener('click', () => {
        console.log('Back to live button clicked');
        // Just go back to live view without resetting the captured frame
        uiController.resetUI();
        cameraController.startVideoDisplay(); // Resume video display
    });
    
    console.log('Event listeners attached');
}); 