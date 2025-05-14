/**
 * Main application entry point
 * Golf Putting Speed Trainer
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize controllers
    const cameraController = new CameraController();
    const uiController = new UIController();
    const ballDetector = new BallDetector();
    const speedCalculator = new SpeedCalculator();
    
    // DOM elements
    const startCameraBtn = document.getElementById('start-camera');
    const captureBtn = document.getElementById('capture-button');
    const calibrateBtn = document.getElementById('calibrate-button');
    const newPuttBtn = document.getElementById('new-putt-button');
    
    // App state
    let isRecording = false;
    let isCalibrating = false;
    let frameData = [];
    
    // Initialize event listeners
    startCameraBtn.addEventListener('click', async () => {
        await cameraController.startCamera();
        captureBtn.disabled = false;
        calibrateBtn.disabled = false;
        startCameraBtn.disabled = true;
    });
    
    captureBtn.addEventListener('click', () => {
        if (!isRecording) {
            // Start recording
            isRecording = true;
            frameData = [];
            captureBtn.textContent = 'Stop Recording';
            cameraController.startFrameCapture((frame) => {
                frameData.push(frame);
                
                // Process frame for ball detection
                const ballPosition = ballDetector.detectBall(frame);
                if (ballPosition) {
                    // Display ball position on canvas
                    uiController.drawBallPosition(ballPosition);
                }
            });
        } else {
            // Stop recording
            isRecording = false;
            captureBtn.textContent = 'Record Putt';
            cameraController.stopFrameCapture();
            
            // Process recorded frames
            const speed = speedCalculator.calculateSpeed(frameData);
            
            // Display results
            uiController.showResults(speed, frameData);
        }
    });
    
    calibrateBtn.addEventListener('click', () => {
        if (!isCalibrating) {
            isCalibrating = true;
            calibrateBtn.textContent = 'Finish Calibration';
            uiController.enterCalibrationMode();
        } else {
            isCalibrating = false;
            calibrateBtn.textContent = 'Calibrate';
            uiController.exitCalibrationMode();
        }
    });
    
    newPuttBtn.addEventListener('click', () => {
        uiController.resetUI();
    });
}); 