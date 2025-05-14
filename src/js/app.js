/**
 * Main application entry point
 * Golf Putting Speed Trainer
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');
    
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
            
            // Perform object detection
            const detections = await ballDetector.detectObjects(displayCanvas);
            
            console.log('Detection results:', detections);
            
            // Draw bounding boxes on the detected objects
            ballDetector.drawDetections(
                displayCanvas.getContext('2d'),
                detections
            );
            
            // Update UI to show we're now displaying analyzed image
            uiController.showAnalyzedImage();
        } catch (error) {
            console.error('Error during analysis:', error);
            alert('An error occurred during analysis. Please try again.');
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