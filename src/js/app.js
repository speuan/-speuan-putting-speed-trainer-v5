/**
 * Main application entry point
 * Golf Putting Speed Trainer
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');
    
    // Validate required elements exist
    const requiredElements = [
        'camera-feed',
        'processing-canvas', 
        'display-canvas',
        'start-camera',
        'capture-button'
    ];
    
    const missingElements = [];
    requiredElements.forEach(id => {
        const element = document.getElementById(id);
        if (!element) {
            missingElements.push(id);
        } else {
            console.log(`✓ Found element: ${id}`, element);
        }
    });
    
    if (missingElements.length > 0) {
        console.error('Missing required elements:', missingElements);
        alert('Missing required HTML elements. Please check the page structure.');
        return;
    }
    
    console.log('All required elements found, initializing controllers...');
    
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
    const ballDetector = new BallDetector();
    const speedCalculator = new SpeedCalculator();
    const uiController = new UIController();
    
    // Connect UI controller to camera controller for tracking integration
    cameraController.uiController = uiController;
    
    // Make camera controller globally accessible for UI controller
    window.cameraController = cameraController;
    
    // DOM elements
    const startCameraBtn = document.getElementById('start-camera');
    const captureBtn = document.getElementById('capture-button');
    const newCaptureBtn = document.getElementById('new-capture-button');
    const backToLiveBtn = document.getElementById('back-to-live-button');
    const analyzeBtn = document.getElementById('analyze-button');
    const loadSampleBtn = document.getElementById('load-sample-button');
    const clearDebugLogBtn = document.getElementById('clear-debug-log');
    
    // Setup mode elements
    const setupMarkersBtn = document.getElementById('setup-markers-button');
    const recalibrateBtn = document.getElementById('recalibrate-button');
    const confirmSetupBtn = document.getElementById('confirm-setup-button');
    const cancelSetupBtn = document.getElementById('cancel-setup-button');
    const setupInstructionsContainer = document.getElementById('setup-instructions-container');
    
    console.log('Elements found:', {
        startCameraBtn,
        captureBtn,
        newCaptureBtn,
        backToLiveBtn,
        analyzeBtn,
        loadSampleBtn,
        clearDebugLogBtn,
        setupMarkersBtn,
        recalibrateBtn,
        confirmSetupBtn,
        cancelSetupBtn,
        setupInstructionsContainer
    });
    
    // Initialize event listeners
    startCameraBtn.addEventListener('click', async () => {
        console.log('Start camera button clicked');
        console.log('Camera controller:', cameraController);
        console.log('UI controller:', uiController);
        
        try {
            console.log('Calling cameraController.startCamera()...');
            await cameraController.startCamera();
            console.log('Camera started successfully, calling uiController.showLiveView()...');
            
            uiController.showLiveView();
            console.log('UI updated to live view');
            
            // Start animation loop for live tracking
            console.log('Starting animation loop...');
            cameraController.animate();
            console.log('Animation loop started');
            
            captureBtn.disabled = false;
            startCameraBtn.disabled = true;
            console.log('Buttons updated - camera startup complete');
            
            // Start loading the detection model in the background
            ballDetector.initialize().then(() => {
                console.log('Model preloaded and ready for use');
            }).catch(err => {
                console.error('Error preloading model:', err);
            });
        } catch (error) {
            console.error('Failed to start camera:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            alert('Failed to start camera. Please check permissions and try again.');
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
        // Capture a new frame
        const frame = cameraController.captureFrame();
        
        // Show the new captured image
        uiController.showCapturedImage(frame);
    });
    
    backToLiveBtn.addEventListener('click', () => {
        console.log('Back to live button clicked');
        // Reset UI to show live feed
        uiController.showLiveView();
        
        // Restart animation loop if camera is available
        if (cameraController.video && cameraController.stream) {
            cameraController.isStreaming = true;
            cameraController.animate();
        }
    });
    
    analyzeBtn.addEventListener('click', async () => {
        console.log('Analyze button clicked');
        
        // Disable the button during analysis
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = 'Analyzing...';
        
        try {
            // Get the current frame from the display canvas
            const canvas = document.getElementById('display-canvas');
            
            // Run detection on the captured frame
            const detections = await ballDetector.detectObjects(canvas);
            
            console.log('Analysis complete:', detections);
            
            // Show analyzed image state
            uiController.showAnalyzedImage();
            
        } catch (error) {
            console.error('Error during analysis:', error);
            alert('Error during analysis. Please try again.');
        } finally {
            // Re-enable the button
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = 'Analyze Capture';
        }
    });
    
    loadSampleBtn.addEventListener('click', () => {
        console.log('Load sample button clicked');
        
        // Create a sample image for testing
        const canvas = document.getElementById('display-canvas');
        const ctx = canvas.getContext('2d');
        
        // Clear canvas and draw a simple test pattern
        ctx.fillStyle = '#87CEEB'; // Sky blue background
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw a sample golf ball
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, 20, 0, 2 * Math.PI);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw sample markers in corners
        const markerPositions = [
            { x: 50, y: 50 },
            { x: canvas.width - 50, y: 50 },
            { x: canvas.width - 50, y: canvas.height - 50 },
            { x: 50, y: canvas.height - 50 }
        ];
        
        markerPositions.forEach((pos, index) => {
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 15, 0, 2 * Math.PI);
            ctx.fillStyle = ['red', 'green', 'blue', 'yellow'][index];
            ctx.fill();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 1;
            ctx.stroke();
        });
        
        // Create frame data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const frame = {
            timestamp: Date.now(),
            imageData: imageData
        };
        
        // Show as captured image
        uiController.showCapturedImage(frame);
        
        console.log('Sample image loaded');
    });
    
    // Setup mode event listeners
    setupMarkersBtn.addEventListener('click', () => {
        console.log('Setup markers button clicked');
        uiController.startSetupMode();
        setupInstructionsContainer.style.display = 'block';
    });
    
    recalibrateBtn.addEventListener('click', () => {
        console.log('Recalibrate button clicked');
        uiController.resetSelectedPoints();
        uiController.startSetupMode();
        setupInstructionsContainer.style.display = 'block';
    });
    
    confirmSetupBtn.addEventListener('click', () => {
        console.log('Confirm setup button clicked');
        
        // Call the UI controller's confirmSetup method
        uiController.confirmSetup();
        
        // Hide setup instructions
        setupInstructionsContainer.style.display = 'none';
    });
    
    cancelSetupBtn.addEventListener('click', () => {
        console.log('Cancel setup button clicked');
        uiController.endSetupMode();
        setupInstructionsContainer.style.display = 'none';
    });
    
    clearDebugLogBtn.addEventListener('click', () => {
        console.log('Clear debug log button clicked');
        const debugLog = document.getElementById('debug-log');
        if (debugLog) {
            debugLog.innerHTML = '';
        }
    });
    
    console.log('All event listeners initialized');
}); 