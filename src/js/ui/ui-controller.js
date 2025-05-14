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
        this.analyzeButton = document.getElementById('analyze-button');
        
        this.displayContext = this.displayCanvas.getContext('2d');
        
        // Flag to track if we're showing a captured image
        this.isShowingCapturedImage = false;
        this.isShowingAnalyzedImage = false;
        
        // Log elements to verify they're found
        console.log('Display canvas:', this.displayCanvas);
        console.log('Capture button:', this.captureButton);
        console.log('Start camera button:', this.startCameraButton);
        console.log('Back to live button:', this.backToLiveButton);
        console.log('New capture button:', this.newCaptureButton);
        console.log('Analyze button:', this.analyzeButton);
    }
    
    /**
     * Show the captured image on the display canvas
     * @param {Object} frame - The captured frame data
     */
    showCapturedImage(frame) {
        console.log('Showing captured image');
        
        // Draw the image on the display canvas
        this.displayContext.putImageData(frame.imageData, 0, 0);
        
        // Show the capture-related buttons, hide the others
        this.captureButton.style.display = 'none';
        this.backToLiveButton.style.display = 'inline-block';
        this.newCaptureButton.style.display = 'inline-block';
        this.analyzeButton.style.display = 'inline-block';
        
        this.isShowingCapturedImage = true;
        this.isShowingAnalyzedImage = false;
    }
    
    /**
     * Show the analyzed image with detection results
     */
    showAnalyzedImage() {
        console.log('Showing analyzed image');
        
        // Hide the analyze button after analysis
        this.analyzeButton.style.display = 'none';
        
        this.isShowingAnalyzedImage = true;
    }
    
    /**
     * Reset the UI to show live feed
     */
    resetUI() {
        console.log('Resetting UI');
        
        // Clear display canvas (the camera will draw to it)
        this.displayContext.clearRect(0, 0, this.displayCanvas.width, this.displayCanvas.height);
        
        // Show the camera buttons, hide the capture-related buttons
        this.captureButton.style.display = 'inline-block';
        this.backToLiveButton.style.display = 'none';
        this.newCaptureButton.style.display = 'none';
        this.analyzeButton.style.display = 'none';
        
        this.isShowingCapturedImage = false;
        this.isShowingAnalyzedImage = false;
    }
} 