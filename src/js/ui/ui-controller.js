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
        this.loadSampleButton = document.getElementById('load-sample-button');
        
        // Setup mode buttons
        this.setupMarkersButton = document.getElementById('setup-markers-button');
        this.confirmSetupButton = document.getElementById('confirm-setup-button');
        this.cancelSetupButton = document.getElementById('cancel-setup-button');
        this.recalibrateButton = document.getElementById('recalibrate-button');
        
        // Setup overlay and state
        this.setupOverlay = document.getElementById('setup-overlay');
        this.isInSetupMode = false;
        this.selectedPoints = [];
        
        // Initialize corner tracker
        this.cornerTracker = new CornerTracker();
        
        // Canvas context
        this.ctx = this.displayCanvas.getContext('2d');
        
        // Bind event handlers
        this.bindEvents();
        
        console.log('UIController initialized');
    }
    
    /**
     * Create the setup overlay canvas
     */
    createSetupOverlay() {
        this.setupOverlay = document.createElement('canvas');
        this.setupOverlay.id = 'setup-overlay';
        this.setupOverlay.style.position = 'absolute';
        this.setupOverlay.style.top = '0';
        this.setupOverlay.style.left = '0';
        this.setupOverlay.style.width = '100%';
        this.setupOverlay.style.height = '100%';
        this.setupOverlay.style.zIndex = '10';
        this.setupOverlay.style.display = 'none';
        this.setupOverlay.style.cursor = 'crosshair';
        
        this.setupOverlayContext = this.setupOverlay.getContext('2d');
        
        // Add overlay to camera container
        this.cameraContainer.appendChild(this.setupOverlay);
        
        console.log('Setup overlay created');
    }
    
    /**
     * Setup click handler for point selection
     */
    setupClickHandler() {
        this.setupOverlay.addEventListener('click', (event) => {
            if (!this.isInSetupMode) return;
            
            const rect = this.setupOverlay.getBoundingClientRect();
            const scaleX = this.setupOverlay.width / rect.width;
            const scaleY = this.setupOverlay.height / rect.height;
            
            const x = (event.clientX - rect.left) * scaleX;
            const y = (event.clientY - rect.top) * scaleY;
            
            this.addSelectedPoint(x, y);
        });
    }
    
    /**
     * Add a selected point during setup
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    addSelectedPoint(x, y) {
        if (this.selectedPoints.length >= 4) return;
        
        this.selectedPoints.push({ x, y });
        console.log(`Point ${this.selectedPoints.length} selected at (${x.toFixed(1)}, ${y.toFixed(1)})`);
        
        this.drawSetupOverlay();
        this.updateSetupInstructions();
        
        // If we have 4 points, show confirm button
        if (this.selectedPoints.length === 4) {
            this.showConfirmSetupButton();
        }
    }
    
    /**
     * Start setup mode
     */
    startSetupMode() {
        console.log('Starting setup mode');
        this.isInSetupMode = true;
        this.selectedPoints = [];
        
        // Match overlay dimensions to display canvas
        this.setupOverlay.width = this.displayCanvas.width;
        this.setupOverlay.height = this.displayCanvas.height;
        
        // Show overlay and hide other buttons
        this.setupOverlay.style.display = 'block';
        this.hideMainButtons();
        this.showSetupButtons();
        this.updateSetupInstructions();
        this.drawSetupOverlay();
        
        // Show instructions container
        const instructionsContainer = document.getElementById('setup-instructions-container');
        if (instructionsContainer) {
            instructionsContainer.style.display = 'block';
        }
    }
    
    /**
     * End setup mode
     */
    endSetupMode() {
        console.log('Ending setup mode');
        this.isInSetupMode = false;
        this.setupOverlay.style.display = 'none';
        this.showMainButtons();
        this.hideSetupButtons();
        this.clearSetupInstructions();
        
        // Hide instructions container
        const instructionsContainer = document.getElementById('setup-instructions-container');
        if (instructionsContainer) {
            instructionsContainer.style.display = 'none';
        }
    }
    
    /**
     * Draw the setup overlay with selected points
     */
    drawSetupOverlay() {
        // Clear overlay
        this.setupOverlayContext.clearRect(0, 0, this.setupOverlay.width, this.setupOverlay.height);
        
        // Draw semi-transparent background
        this.setupOverlayContext.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.setupOverlayContext.fillRect(0, 0, this.setupOverlay.width, this.setupOverlay.height);
        
        // Draw selected points
        this.selectedPoints.forEach((point, index) => {
            this.drawMarkerPoint(point.x, point.y, index + 1);
        });
    }
    
    /**
     * Draw a marker point with number
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} number - Point number (1-4)
     */
    drawMarkerPoint(x, y, number) {
        const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'];
        const color = colors[number - 1];
        
        // Draw outer circle
        this.setupOverlayContext.beginPath();
        this.setupOverlayContext.arc(x, y, 20, 0, 2 * Math.PI);
        this.setupOverlayContext.strokeStyle = color;
        this.setupOverlayContext.lineWidth = 3;
        this.setupOverlayContext.stroke();
        
        // Draw inner filled circle
        this.setupOverlayContext.beginPath();
        this.setupOverlayContext.arc(x, y, 8, 0, 2 * Math.PI);
        this.setupOverlayContext.fillStyle = color;
        this.setupOverlayContext.fill();
        
        // Draw number
        this.setupOverlayContext.fillStyle = 'white';
        this.setupOverlayContext.font = 'bold 12px Arial';
        this.setupOverlayContext.textAlign = 'center';
        this.setupOverlayContext.textBaseline = 'middle';
        this.setupOverlayContext.fillText(number.toString(), x, y);
    }
    
    /**
     * Update setup instructions
     */
    updateSetupInstructions() {
        const instructionsElement = document.getElementById('setup-instructions');
        if (!instructionsElement) return;
        
        const pointNumber = this.selectedPoints.length + 1;
        if (pointNumber <= 4) {
            instructionsElement.textContent = `Tap center of marker ${pointNumber}/4`;
        } else {
            instructionsElement.textContent = 'All markers selected. Confirm setup to continue.';
        }
    }
    
    /**
     * Clear setup instructions
     */
    clearSetupInstructions() {
        const instructionsElement = document.getElementById('setup-instructions');
        if (instructionsElement) {
            instructionsElement.textContent = '';
        }
    }
    
    /**
     * Hide main camera buttons during setup
     */
    hideMainButtons() {
        this.captureButton.style.display = 'none';
        this.loadSampleButton.style.display = 'none';
        this.setupMarkersButton.style.display = 'none';
        this.analyzeButton.style.display = 'none';
        this.backToLiveButton.style.display = 'none';
        this.newCaptureButton.style.display = 'none';
    }
    
    /**
     * Show main camera buttons
     */
    showMainButtons() {
        if (!this.isShowingCapturedImage) {
            this.captureButton.style.display = 'inline-block';
            this.loadSampleButton.style.display = 'inline-block';
            this.setupMarkersButton.style.display = 'inline-block';
        } else {
            this.backToLiveButton.style.display = 'inline-block';
            this.newCaptureButton.style.display = 'inline-block';
            if (!this.isShowingAnalyzedImage) {
                this.analyzeButton.style.display = 'inline-block';
            }
        }
        
        // Show recalibrate button if markers have been set up
        if (this.hasMarkersSetup()) {
            this.recalibrateButton.style.display = 'inline-block';
        }
    }
    
    /**
     * Show setup-specific buttons
     */
    showSetupButtons() {
        const cancelButton = document.getElementById('cancel-setup-button');
        if (cancelButton) {
            cancelButton.style.display = 'inline-block';
        }
    }
    
    /**
     * Hide setup-specific buttons
     */
    hideSetupButtons() {
        const cancelButton = document.getElementById('cancel-setup-button');
        const confirmButton = document.getElementById('confirm-setup-button');
        
        if (cancelButton) {
            cancelButton.style.display = 'none';
        }
        if (confirmButton) {
            confirmButton.style.display = 'none';
        }
    }
    
    /**
     * Show confirm setup button
     */
    showConfirmSetupButton() {
        const confirmButton = document.getElementById('confirm-setup-button');
        if (confirmButton) {
            confirmButton.style.display = 'inline-block';
        }
    }
    
    /**
     * Check if markers have been set up
     * @returns {boolean}
     */
    hasMarkersSetup() {
        return this.selectedPoints.length === 4;
    }
    
    /**
     * Get selected marker points
     * @returns {Array} Array of {x, y} points
     */
    getSelectedPoints() {
        return [...this.selectedPoints];
    }
    
    /**
     * Reset selected points (for recalibration)
     */
    resetSelectedPoints() {
        this.selectedPoints = [];
        console.log('Selected points reset');
    }

    /**
     * Show the captured image on the display canvas
     * @param {Object} frame - The captured frame data
     */
    showCapturedImage(frame) {
        console.log('Showing captured image');
        
        // Draw the image on the display canvas
        this.ctx.putImageData(frame.imageData, 0, 0);
        
        // Show the capture-related buttons, hide the others
        this.captureButton.style.display = 'none';
        this.loadSampleButton.style.display = 'none';
        this.setupMarkersButton.style.display = 'none';
        this.backToLiveButton.style.display = 'inline-block';
        this.newCaptureButton.style.display = 'inline-block';
        this.analyzeButton.style.display = 'inline-block';
        
        // Show recalibrate if markers are set up
        if (this.hasMarkersSetup()) {
            this.recalibrateButton.style.display = 'inline-block';
        }
        
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
        this.ctx.clearRect(0, 0, this.displayCanvas.width, this.displayCanvas.height);
        
        // Show the camera buttons, hide the capture-related buttons
        this.captureButton.style.display = 'inline-block';
        this.loadSampleButton.style.display = 'inline-block';
        this.setupMarkersButton.style.display = 'inline-block';
        this.backToLiveButton.style.display = 'none';
        this.newCaptureButton.style.display = 'none';
        this.analyzeButton.style.display = 'none';
        
        // Show recalibrate if markers are set up
        if (this.hasMarkersSetup()) {
            this.recalibrateButton.style.display = 'inline-block';
        }
        
        this.isShowingCapturedImage = false;
        this.isShowingAnalyzedImage = false;
    }

    /**
     * Confirm setup and start tracking
     */
    confirmSetup() {
        if (this.selectedPoints.length !== 4) {
            alert('Please select all 4 marker points before confirming.');
            return;
        }
        
        console.log('Confirming setup with points:', this.selectedPoints);
        
        try {
            // Get current frame from display canvas
            const imageData = this.ctx.getImageData(0, 0, this.displayCanvas.width, this.displayCanvas.height);
            
            // Setup corner tracking with selected points
            this.cornerTracker.setupMarkers(this.selectedPoints, imageData);
            
            // Exit setup mode
            this.exitSetupMode();
            
            // Show recalibrate button
            this.recalibrateButton.style.display = 'inline-block';
            
            console.log('Marker tracking setup complete');
            
        } catch (error) {
            console.error('Error setting up marker tracking:', error);
            alert('Error setting up marker tracking. Please try again.');
        }
    }

    /**
     * Draw frame with overlays
     * @param {ImageData} imageData - Frame to draw
     */
    drawFrame(imageData) {
        // Draw the image
        this.ctx.putImageData(imageData, 0, 0);
        
        // If corner tracking is active, track markers and draw indicators
        if (this.cornerTracker.isTracking()) {
            try {
                // Track markers in current frame
                const trackingResults = this.cornerTracker.trackMarkers(imageData);
                
                // Draw tracking indicators
                this.cornerTracker.drawTrackingIndicators(this.ctx);
                
                // Log tracking quality for debugging
                const qualities = this.cornerTracker.getTrackingQuality();
                const avgQuality = qualities.reduce((sum, q) => sum + q, 0) / qualities.length;
                if (avgQuality < 0.5) {
                    console.warn('Low tracking quality:', qualities);
                }
                
            } catch (error) {
                console.error('Error during marker tracking:', error);
            }
        }
    }
    
    /**
     * Get current marker positions for homography calculation
     * @returns {Array|null} Array of {x, y} positions or null if not tracking
     */
    getCurrentMarkerPositions() {
        if (this.cornerTracker.isTracking()) {
            return this.cornerTracker.getCurrentPositions();
        }
        return null;
    }
    
    /**
     * Get tracking quality scores
     * @returns {Array|null} Array of quality scores (0-1) or null if not tracking
     */
    getTrackingQuality() {
        if (this.cornerTracker.isTracking()) {
            return this.cornerTracker.getTrackingQuality();
        }
        return null;
    }
    
    /**
     * Check if marker tracking is active
     * @returns {boolean}
     */
    isTrackingActive() {
        return this.cornerTracker.isTracking();
    }

    /**
     * Recalibrate markers
     */
    recalibrate() {
        console.log('Recalibrating markers');
        
        // Reset corner tracker
        this.cornerTracker.reset();
        
        // Hide recalibrate button
        this.recalibrateButton.style.display = 'none';
        
        // Start setup mode again
        this.startSetupMode();
    }
} 