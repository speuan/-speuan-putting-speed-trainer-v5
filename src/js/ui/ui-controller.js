/**
 * UI Controller
 * Manages UI interactions and display
 */

class UIController {
    constructor() {
        this.displayCanvas = document.getElementById('display-canvas');
        this.cameraContainer = document.querySelector('.camera-container');
        
        // Camera control buttons
        this.captureButton = document.getElementById('capture-button');
        this.startCameraButton = document.getElementById('start-camera');
        this.backToLiveButton = document.getElementById('back-to-live-button');
        this.newCaptureButton = document.getElementById('new-capture-button');
        
        this.displayContext = this.displayCanvas.getContext('2d');
        
        // Flag to track if we're showing a captured image
        this.isShowingCapturedImage = false;
    }
    
    /**
     * Show the captured image on the display canvas
     * @param {Object} frame - The captured frame data
     */
    showCapturedImage(frame) {
        // Draw the image on the display canvas
        this.displayContext.putImageData(frame.imageData, 0, 0);
        
        // Show the capture-related buttons, hide the others
        this.captureButton.style.display = 'none';
        this.backToLiveButton.style.display = 'inline-block';
        this.newCaptureButton.style.display = 'inline-block';
        
        this.isShowingCapturedImage = true;
    }
    
    /**
     * Reset the UI to show live feed
     */
    resetUI() {
        // Clear display canvas (the camera will draw to it)
        this.displayContext.clearRect(0, 0, this.displayCanvas.width, this.displayCanvas.height);
        
        // Show the camera buttons, hide the capture-related buttons
        this.captureButton.style.display = 'inline-block';
        this.backToLiveButton.style.display = 'none';
        this.newCaptureButton.style.display = 'none';
        
        this.isShowingCapturedImage = false;
    }
} 