/**
 * Camera Controller
 * Handles camera access and frame capture
 */

class CameraController {
    constructor() {
        console.log('Initializing CameraController');
        this.videoElement = document.getElementById('camera-feed');
        this.processingCanvas = document.getElementById('processing-canvas');
        this.displayCanvas = document.getElementById('display-canvas');
        this.processingContext = this.processingCanvas.getContext('2d');
        this.displayContext = this.displayCanvas.getContext('2d');
        
        console.log('Elements found:', {
            videoElement: this.videoElement,
            processingCanvas: this.processingCanvas,
            displayCanvas: this.displayCanvas
        });
        
        this.stream = null;
        this.video = null;
        this.frameCapture = null;
        this.frameCallback = null;
        this.CAPTURE_INTERVAL = 100; // ms between frames
        this.capturedFrame = null;
        this.isStreaming = false;
    }
    
    /**
     * Start the camera and get user media stream
     */
    async startCamera() {
        console.log('Starting camera...');
        console.log('Video element:', this.videoElement);
        console.log('Processing canvas:', this.processingCanvas);
        console.log('Display canvas:', this.displayCanvas);
        
        try {
            const constraints = {
                video: {
                    facingMode: 'environment', // Use rear camera on mobile
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };
            
            console.log('Requesting user media with constraints:', constraints);
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video = this.videoElement; // Make sure we have the video reference
            
            console.log('Stream acquired:', this.stream);
            console.log('Setting video srcObject...');
            this.video.srcObject = this.stream;
            this.isStreaming = false; // Will be set to true when video loads
            
            console.log('Camera stream acquired, waiting for metadata...');
            
            // Wait for video to be ready
            return new Promise((resolve, reject) => {
                // Add timeout to catch if metadata never loads
                const timeout = setTimeout(() => {
                    console.error('Timeout waiting for video metadata');
                    reject(new Error('Timeout waiting for video metadata'));
                }, 10000); // 10 second timeout
                
                this.video.onloadedmetadata = () => {
                    clearTimeout(timeout);
                    console.log('Video metadata loaded', {
                        width: this.video.videoWidth,
                        height: this.video.videoHeight
                    });
                    
                    // Set canvas dimensions to match video
                    this.processingCanvas.width = this.video.videoWidth;
                    this.processingCanvas.height = this.video.videoHeight;
                    this.displayCanvas.width = this.video.videoWidth;
                    this.displayCanvas.height = this.video.videoHeight;
                    
                    console.log('Canvas dimensions set:', {
                        processing: { width: this.processingCanvas.width, height: this.processingCanvas.height },
                        display: { width: this.displayCanvas.width, height: this.displayCanvas.height }
                    });
                    
                    // Set streaming flag
                    this.isStreaming = true;
                    
                    console.log('Camera ready for streaming');
                    resolve();
                };
                
                this.video.onerror = (error) => {
                    clearTimeout(timeout);
                    console.error('Video error:', error);
                    reject(error);
                };
            });
        } catch (error) {
            console.error('Error accessing camera:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            alert('Error accessing camera. Please check permissions and try again.');
            throw error;
        }
    }
    

    
    /**
     * Capture a single frame from the video feed
     * @returns {Object} The captured frame data
     */
    captureFrame() {
        console.log('Capturing frame...');
        // Draw current video frame to processing canvas
        this.processingContext.drawImage(
            this.video, 
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
        
        console.log('Frame captured', {
            width: frame.imageData.width,
            height: frame.imageData.height
        });
        
        // Store the captured frame
        this.capturedFrame = frame;
        
        // Also draw the frame on the display canvas
        this.displayContext.putImageData(frame.imageData, 0, 0);
        
        // Stop streaming since we now have a still image
        this.isStreaming = false;
        
        return frame;
    }
    
    /**
     * Stop camera stream
     */
    stopCamera() {
        console.log('Stopping camera');
        this.isStreaming = false;
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
            this.video.srcObject = null;
            console.log('Camera stream stopped');
        }
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
                this.video, 
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
     * Draw current frame to display canvas
     */
    drawFrame() {
        if (!this.isStreaming || !this.video || !this.displayCanvas) {
            return;
        }
        
        try {
            // Draw video frame to processing canvas
            this.processingContext.drawImage(this.video, 0, 0, this.processingCanvas.width, this.processingCanvas.height);
            
            // Get image data
            const imageData = this.processingContext.getImageData(0, 0, this.processingCanvas.width, this.processingCanvas.height);
            
            // Use UI controller's drawFrame method (includes tracking overlays)
            if (this.uiController && this.uiController.drawFrame) {
                this.uiController.drawFrame(imageData);
            } else {
                // Fallback: draw directly to display canvas
        this.displayContext.putImageData(imageData, 0, 0);
            }
            
        } catch (error) {
            console.error('Error drawing frame:', error);
        }
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
     * Reset camera controller state
     */
    reset() {
        console.log('Resetting camera controller');
        this.stopCamera();
        this.stopFrameCapture();
        this.capturedFrame = null;
        this.isStreaming = false;
    }
    
    /**
     * Load a sample image from the assets folder
     * @returns {Promise<Object>} The captured frame data
     */
    async loadSampleImage() {
        console.log('Loading sample image...');
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                console.log('Sample image loaded', {
                    width: img.width,
                    height: img.height
                });
                
                // Set canvas dimensions to match image
                this.processingCanvas.width = img.width;
                this.processingCanvas.height = img.height;
                this.displayCanvas.width = img.width;
                this.displayCanvas.height = img.height;
                
                // Draw the image to the processing canvas
                this.processingContext.drawImage(img, 0, 0, img.width, img.height);
                
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
                
                resolve(frame);
            };
            
            img.onerror = (error) => {
                console.error('Error loading sample image:', error);
                reject(error);
            };
            
            // Set the source to the sample image
            img.src = 'assets/images/0fe53e23-IMG_3884.JPG';
        });
    }
    
    /**
     * Animation loop for live camera feed
     */
    animate() {
        if (!this.isStreaming) {
            return;
        }
        
        try {
            // Draw video frame to processing canvas
            this.processingContext.drawImage(this.video, 0, 0, this.processingCanvas.width, this.processingCanvas.height);
            
            // Get image data and draw frame (includes tracking overlays)
            this.drawFrame();
            
        } catch (error) {
            console.error('Error in animation loop:', error);
        }
        
        // Continue animation loop
        requestAnimationFrame(() => this.animate());
    }
} 