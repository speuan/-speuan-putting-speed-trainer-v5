/**
 * Camera Controller
 * Handles camera access and frame capture
 */

class CameraController {
    constructor() {
        this.videoElement = document.getElementById('camera-feed');
        this.processingCanvas = document.getElementById('processing-canvas');
        this.displayCanvas = document.getElementById('display-canvas');
        this.processingContext = this.processingCanvas.getContext('2d');
        this.displayContext = this.displayCanvas.getContext('2d');
        
        this.stream = null;
        this.frameCapture = null;
        this.frameCallback = null;
        this.CAPTURE_INTERVAL = 100; // ms between frames
        this.capturedFrame = null;
    }
    
    /**
     * Start the camera and get user media stream
     */
    async startCamera() {
        try {
            const constraints = {
                video: {
                    facingMode: 'environment', // Use rear camera on mobile
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.stream;
            
            // Wait for video to be ready
            return new Promise((resolve) => {
                this.videoElement.onloadedmetadata = () => {
                    // Set canvas dimensions to match video
                    this.processingCanvas.width = this.videoElement.videoWidth;
                    this.processingCanvas.height = this.videoElement.videoHeight;
                    this.displayCanvas.width = this.videoElement.videoWidth;
                    this.displayCanvas.height = this.videoElement.videoHeight;
                    
                    // Start drawing video feed to display canvas
                    this.startVideoDisplay();
                    
                    resolve();
                };
            });
        } catch (error) {
            console.error('Error accessing camera:', error);
            alert('Error accessing camera. Please check permissions and try again.');
            throw error;
        }
    }
    
    /**
     * Show live video feed on display canvas
     */
    startVideoDisplay() {
        // If we're already drawing, don't start a new interval
        if (this.displayInterval) return;
        
        this.displayInterval = setInterval(() => {
            this.displayContext.drawImage(
                this.videoElement,
                0,
                0,
                this.displayCanvas.width,
                this.displayCanvas.height
            );
        }, 33); // ~30 FPS
    }
    
    /**
     * Stop showing live video feed
     */
    stopVideoDisplay() {
        if (this.displayInterval) {
            clearInterval(this.displayInterval);
            this.displayInterval = null;
        }
    }
    
    /**
     * Capture a single frame from the video feed
     * @returns {Object} The captured frame data
     */
    captureFrame() {
        // Draw current video frame to processing canvas
        this.processingContext.drawImage(
            this.videoElement, 
            0, 
            0, 
            this.processingCanvas.width, 
            this.processingCanvas.height
        );
        
        // Get frame data
        const frame = {
            timestamp: Date.now(),
            imageData: this.processingContext.getImageData(
                0, 
                0, 
                this.processingCanvas.width, 
                this.processingCanvas.height
            )
        };
        
        // Store the captured frame
        this.capturedFrame = frame;
        
        // Also draw the frame on the display canvas
        this.displayContext.putImageData(frame.imageData, 0, 0);
        
        // Stop the video display since we now have a still image
        this.stopVideoDisplay();
        
        return frame;
    }
    
    /**
     * Stop camera stream
     */
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
            this.videoElement.srcObject = null;
        }
        
        this.stopVideoDisplay();
    }
    
    /**
     * Start capturing frames at regular intervals
     * @param {Function} callback - Function to call with captured frame data
     */
    startFrameCapture(callback) {
        this.frameCallback = callback;
        
        this.frameCapture = setInterval(() => {
            // Draw current video frame to processing canvas
            this.processingContext.drawImage(
                this.videoElement, 
                0, 
                0, 
                this.processingCanvas.width, 
                this.processingCanvas.height
            );
            
            // Get frame data
            const frameData = {
                timestamp: Date.now(),
                imageData: this.processingContext.getImageData(
                    0, 
                    0, 
                    this.processingCanvas.width, 
                    this.processingCanvas.height
                )
            };
            
            // Call the callback with frame data
            if (this.frameCallback) {
                this.frameCallback(frameData);
            }
        }, this.CAPTURE_INTERVAL);
    }
    
    /**
     * Stop capturing frames
     */
    stopFrameCapture() {
        if (this.frameCapture) {
            clearInterval(this.frameCapture);
            this.frameCapture = null;
        }
    }
    
    /**
     * Draw a frame on the display canvas
     * @param {ImageData} imageData - Frame image data to draw
     */
    drawFrame(imageData) {
        this.displayContext.putImageData(imageData, 0, 0);
    }
    
    /**
     * Clear the display canvas
     */
    clearDisplay() {
        this.displayContext.clearRect(
            0, 
            0, 
            this.displayCanvas.width, 
            this.displayCanvas.height
        );
    }
    
    /**
     * Get the currently captured frame
     * @returns {Object|null} The captured frame data or null if no frame has been captured
     */
    getCapturedFrame() {
        return this.capturedFrame;
    }
    
    /**
     * Reset - clear the captured frame and restart video display
     */
    reset() {
        this.capturedFrame = null;
        this.startVideoDisplay();
    }
} 