/**
 * Main application entry point
 * Golf Putting Speed Trainer
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');
    
    // Debug mode flag
    const debugMode = false; // Set to false to disable visual debugging
    
    // Create debug elements if in debug mode
    if (debugMode) {
        const debugContainer = document.createElement('div');
        debugContainer.style.position = 'fixed';
        debugContainer.style.top = '10px';
        debugContainer.style.right = '10px';
        debugContainer.style.zIndex = '1000';
        debugContainer.style.width = '200px'; // Small debug view
        debugContainer.style.height = '200px';
        debugContainer.style.border = '2px solid red';
        debugContainer.style.overflow = 'hidden';
        debugContainer.id = 'debug-container';
        
        const debugCanvas = document.createElement('canvas');
        debugCanvas.id = 'debug-canvas';
        debugCanvas.width = 640;
        debugCanvas.height = 640;
        debugCanvas.style.width = '100%';
        debugCanvas.style.height = '100%';
        
        debugContainer.appendChild(debugCanvas);
        document.body.appendChild(debugContainer);
        
        console.log('Debug mode enabled: Visual debugging elements created');
    }
    
    // Initialize controllers
    const cameraController = new CameraController();
    const uiController = new UIController();
    const ballDetector = new BallDetector();
    
    // DOM elements
    const startCameraBtn = document.getElementById('start-camera');
    const captureBtn = document.getElementById('capture-button');
    const newCaptureBtn = document.getElementById('new-capture-button');
    const backToLiveBtn = document.getElementById('back-to-live-button');
    const analyzeBtn = document.getElementById('analyze-button');
    
    console.log('Elements found:', {
        startCameraBtn,
        captureBtn,
        newCaptureBtn,
        backToLiveBtn,
        analyzeBtn
    });
    
    // Initialize event listeners
    startCameraBtn.addEventListener('click', async () => {
        console.log('Start camera button clicked');
        try {
            await cameraController.startCamera();
            captureBtn.disabled = false;
            startCameraBtn.disabled = true;
            console.log('Camera started successfully');
            
            // Start loading the detection model in the background
            ballDetector.initialize().then(() => {
                console.log('Model preloaded and ready for use');
            }).catch(err => {
                console.error('Error preloading model:', err);
            });
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
    
    analyzeBtn.addEventListener('click', async () => {
        console.log('Analyze button clicked');
        
        // Disable the button while processing
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = 'Analyzing...';
        
        try {
            // Get the display canvas for analysis
            const displayCanvas = document.getElementById('display-canvas');
            
            console.log('Starting analysis of captured image...');
            console.log('Canvas dimensions:', {
                width: displayCanvas.width,
                height: displayCanvas.height
            });
            
            // Ensure model is loaded
            if (!ballDetector.isModelLoaded) {
                console.log('Model not loaded yet, initializing...');
                await ballDetector.initialize();
            }
            
            // Verify the canvas has content
            const emptyCheck = displayCanvas.getContext('2d').getImageData(0, 0, 10, 10);
            const hasContent = emptyCheck.data.some(channel => channel !== 0);
            
            if (!hasContent) {
                console.warn('Canvas appears to be empty');
                alert('The image appears to be empty. Please capture an image first.');
                return;
            }
            
            // Create a preprocessed version of the image for debugging
            if (debugMode) {
                // Create a temporary canvas to visualize preprocessing
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = 640;
                tempCanvas.height = 640;
                const tempCtx = tempCanvas.getContext('2d');
                
                // Fill with background color to visualize padding
                tempCtx.fillStyle = 'rgba(0, 0, 255, 0.3)';  // Semi-transparent blue background
                tempCtx.fillRect(0, 0, 640, 640);
                
                // Draw with aspect ratio preservation
                const imgAspectRatio = displayCanvas.width / displayCanvas.height;
                let renderWidth, renderHeight, offsetX = 0, offsetY = 0;
                
                if (imgAspectRatio > 1) {
                    // Image is wider than tall
                    renderWidth = 640;
                    renderHeight = 640 / imgAspectRatio;
                    offsetY = (640 - renderHeight) / 2;
                } else {
                    // Image is taller than wide or square
                    renderHeight = 640;
                    renderWidth = 640 * imgAspectRatio;
                    offsetX = (640 - renderWidth) / 2;
                }
                
                // Draw image
                tempCtx.drawImage(
                    displayCanvas,
                    offsetX,
                    offsetY,
                    renderWidth,
                    renderHeight
                );
                
                // Draw bounding box showing the actual image area
                tempCtx.strokeStyle = 'red';
                tempCtx.lineWidth = 2;
                tempCtx.strokeRect(offsetX, offsetY, renderWidth, renderHeight);
                
                // Add some text information
                tempCtx.fillStyle = 'white';
                tempCtx.font = '14px Arial';
                tempCtx.fillText(`Original: ${displayCanvas.width}x${displayCanvas.height}`, 10, 20);
                tempCtx.fillText(`Rendered: ${Math.round(renderWidth)}x${Math.round(renderHeight)}`, 10, 40);
                tempCtx.fillText(`Offset: (${Math.round(offsetX)},${Math.round(offsetY)})`, 10, 60);
                
                // Show in debug canvas
                const debugCanvas = document.getElementById('debug-canvas');
                if (debugCanvas) {
                    const debugCtx = debugCanvas.getContext('2d');
                    debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
                    debugCtx.drawImage(tempCanvas, 0, 0);
                }
            }
            
            // Perform object detection
            console.log('Running detection...');
            const detections = await ballDetector.detectObjects(displayCanvas);
            
            console.log('Detection results:', detections);
            
            if (detections.length === 0) {
                console.log('No objects detected in the image');
                alert('No golf balls or coins were detected in the image. Try adjusting lighting or camera angle.');
            } else {
                // Draw bounding boxes on the detected objects
                ballDetector.drawDetections(
                    displayCanvas.getContext('2d'),
                    detections
                );
                
                // Update UI to show we're now displaying analyzed image
                uiController.showAnalyzedImage();
                
                // Show a message with the detection count
                const ballCount = detections.filter(d => d.class === 'ball_golf').length;
                const coinCount = detections.filter(d => d.class === 'coin').length;
                
                let message = '';
                if (ballCount > 0) {
                    message += `Detected ${ballCount} golf ball${ballCount > 1 ? 's' : ''}.`;
                }
                if (coinCount > 0) {
                    if (message) message += ' ';
                    message += `Detected ${coinCount} coin${coinCount > 1 ? 's' : ''}.`;
                }
                
                if (message) {
                    alert(message);
                }
            }
        } catch (error) {
            console.error('Error during analysis:', error);
            alert(`An error occurred during analysis: ${error.message}. Please try again.`);
        } finally {
            // Re-enable the button
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = 'Analyze Capture';
        }
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