/**
 * UI Controller
 * Manages UI interactions and display
 */

class UIController {
    constructor() {
        this.displayCanvas = document.getElementById('display-canvas');
        this.capturedCanvas = document.getElementById('captured-canvas');
        this.resultsContainer = document.querySelector('.results-container');
        this.cameraContainer = document.querySelector('.camera-container');
        
        this.displayContext = this.displayCanvas.getContext('2d');
        this.capturedContext = this.capturedCanvas.getContext('2d');
    }
    
    /**
     * Show the captured image analysis UI
     * @param {Object} frame - The captured frame data
     */
    showCapturedImage(frame) {
        // Set the canvas size to match the image
        this.capturedCanvas.width = frame.imageData.width;
        this.capturedCanvas.height = frame.imageData.height;
        
        // Draw the image on the captured canvas
        this.capturedContext.putImageData(frame.imageData, 0, 0);
        
        // Show results container, hide camera
        this.resultsContainer.style.display = 'block';
    }
    
    /**
     * Reset the UI to initial state
     */
    resetUI() {
        // Clear canvases
        this.displayContext.clearRect(0, 0, this.displayCanvas.width, this.displayCanvas.height);
        this.capturedContext.clearRect(0, 0, this.capturedCanvas.width, this.capturedCanvas.height);
        
        // Reset data
        this.resultsContainer.style.display = 'none';
    }
} 