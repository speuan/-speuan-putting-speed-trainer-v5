/**
 * Object detection module using TensorFlow.js
 */

// Model reference
let model = null;
let isModelLoading = false;
let labels = ['ball_golf', 'Coin']; // Labels for our detection classes
const MODEL_INPUT_SIZE = 640; // Model expects 640x640 input

// iOS detection
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// Debug function (will be replaced by the one from camera.js)
let updateDebugInfo = function(msg) {
    console.log(msg);
    if (window.debugInfo) {
        window.debugInfo.textContent += '\n' + msg;
    }
};

/**
 * Initialize the detection model
 * @returns {Promise} Promise that resolves when the model is loaded
 */
async function initDetectionModel() {
    if (model !== null) {
        return model; // Model already loaded
    }
    
    if (isModelLoading) {
        // Wait until model is loaded
        return new Promise(resolve => {
            const checkInterval = setInterval(() => {
                if (model !== null) {
                    clearInterval(checkInterval);
                    resolve(model);
                }
            }, 100);
        });
    }
    
    isModelLoading = true;
    
    try {
        // Set the backend to CPU for iOS (WebGL can be problematic)
        if (isIOS) {
            updateDebugInfo('Setting TensorFlow.js backend to CPU for iOS');
            await tf.setBackend('cpu');
        }
        
        updateDebugInfo('Loading object detection model...');
        model = await tf.loadGraphModel('./my_model_web_model/model.json');
        updateDebugInfo('Model loaded successfully, warming up...');
        
        // Warm up the model with a dummy tensor
        const dummyInput = tf.zeros([1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 3]);
        await model.executeAsync(dummyInput);
        dummyInput.dispose();
        
        updateDebugInfo('Model warm-up complete');
        isModelLoading = false;
        return model;
    } catch (error) {
        updateDebugInfo('Error loading model: ' + error.message);
        console.error('Error loading model:', error);
        isModelLoading = false;
        throw error;
    }
}

/**
 * Perform object detection on a canvas element
 * @param {HTMLCanvasElement} canvas - Canvas containing the image to analyze
 * @param {CanvasRenderingContext2D} ctx - Canvas context for drawing
 * @param {number} threshold - Detection confidence threshold (0-1)
 */
async function detectObjects(canvas, ctx, threshold = 0.5) {
    try {
        // Update debug function if available from camera.js
        if (typeof window.updateDebugInfo === 'function') {
            updateDebugInfo = window.updateDebugInfo;
        }
        
        // Make sure model is loaded
        await initDetectionModel();
        
        updateDebugInfo(`Canvas size: ${canvas.width}x${canvas.height}`);
        
        // Get canvas image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        updateDebugInfo(`Got image data: ${imageData.width}x${imageData.height}`);
        
        // Prepare image for the model - resize to 640x640
        let imgTensor;
        try {
            imgTensor = tf.tidy(() => {
                // Convert to tensor
                updateDebugInfo('Creating tensor from image data');
                const tensor = tf.browser.fromPixels(imageData);
                updateDebugInfo(`Created tensor: ${tensor.shape}`);
                
                // Resize to model input dimensions (maintaining aspect ratio)
                const [height, width] = tensor.shape.slice(0, 2);
                
                // In case of iOS, use a simpler approach to avoid memory issues
                if (isIOS) {
                    updateDebugInfo('Using iOS-friendly resize to 640x640');
                    const resized = tf.image.resizeBilinear(tensor, [MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
                    return resized.expandDims(0);
                }
                
                // For other platforms, maintain aspect ratio with padding
                const scale = MODEL_INPUT_SIZE / Math.max(height, width);
                const newHeight = Math.round(height * scale);
                const newWidth = Math.round(width * scale);
                
                updateDebugInfo(`Resizing to ${newWidth}x${newHeight} and padding to ${MODEL_INPUT_SIZE}x${MODEL_INPUT_SIZE}`);
                
                // Resize image
                const resized = tf.image.resizeBilinear(tensor, [newHeight, newWidth]);
                
                // Create a black canvas of 640x640
                const padded = tf.zeros([MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 3]);
                
                // Calculate offsets to center the image
                const yOffset = Math.floor((MODEL_INPUT_SIZE - newHeight) / 2);
                const xOffset = Math.floor((MODEL_INPUT_SIZE - newWidth) / 2);
                
                // Place the resized image in the center using simpler method for iOS
                return tf.tidy(() => {
                    const placed = padded.add(tf.pad(
                        resized,
                        [[yOffset, MODEL_INPUT_SIZE - newHeight - yOffset], 
                        [xOffset, MODEL_INPUT_SIZE - newWidth - xOffset], 
                        [0, 0]]
                    ));
                    
                    // Expand dims to add batch size
                    return placed.expandDims(0);
                });
            });
            
            updateDebugInfo(`Final input tensor shape: ${imgTensor.shape}`);
        } catch (tensorError) {
            updateDebugInfo('Error creating input tensor: ' + tensorError.message);
            throw tensorError;
        }
        
        // Store original dimensions for mapping back to canvas coordinates
        const originalWidth = canvas.width;
        const originalHeight = canvas.height;
        
        // Run inference
        updateDebugInfo('Running model inference...');
        
        // For iOS we need to handle memory more carefully
        let predictions;
        try {
            predictions = await model.executeAsync(imgTensor);
            updateDebugInfo('Model execution complete');
        } catch (inferenceError) {
            updateDebugInfo('Error during inference: ' + inferenceError.message);
            throw inferenceError;
        } finally {
            // Clean up input tensor regardless of success/failure
            imgTensor.dispose();
        }
        
        try {
            // Process results 
            updateDebugInfo('Processing detection results');
            // Check if predictions is an array with at least 3 elements
            if (!Array.isArray(predictions) || predictions.length < 3) {
                throw new Error(`Expected predictions array with at least 3 elements, got: ${predictions?.length || 'undefined'}`);
            }
            
            // Check if each prediction tensor exists before calling arraySync
            if (!predictions[0]) {
                throw new Error('Boxes tensor (predictions[0]) is undefined');
            }
            
            if (!predictions[1]) {
                throw new Error('Scores tensor (predictions[1]) is undefined');
            }
            
            if (!predictions[2]) {
                throw new Error('Classes tensor (predictions[2]) is undefined');
            }
            
            // Log the structure of the predictions for debugging
            updateDebugInfo(`Predictions array length: ${predictions.length}`);
            predictions.forEach((tensor, i) => {
                updateDebugInfo(`Prediction[${i}] shape: ${tensor ? tensor.shape : 'undefined'}`);
            });
            
            const boxes = await predictions[0].arraySync();
            const scores = await predictions[1].arraySync();
            const classes = await predictions[2].arraySync();
            
            // Clean up result tensors
            predictions.forEach(tensor => tensor.dispose());
            
            // Report highest confidence scores for debugging
            const highestScores = [];
            for (let i = 0; i < Math.min(scores[0].length, 5); i++) {
                highestScores.push({
                    class: labels[classes[0][i]],
                    score: scores[0][i]
                });
            }
            updateDebugInfo('Top detections: ' + JSON.stringify(highestScores));
            
            // Draw results on canvas
            drawDetections(canvas, ctx, boxes[0], scores[0], classes[0], threshold, originalWidth, originalHeight);
            
            // Return detected objects for further processing
            return processDetections(boxes[0], scores[0], classes[0], threshold);
        } catch (processError) {
            updateDebugInfo('Error processing results: ' + processError.message);
            console.error('Error processing results:', processError);
            throw processError;
        }
    } catch (error) {
        updateDebugInfo('Detection error: ' + error.message);
        console.error('Detection error:', error);
        throw error;
    }
}

/**
 * Process detection results into a usable format
 * @param {Array} boxes - Bounding boxes
 * @param {Array} scores - Detection confidence scores
 * @param {Array} classes - Class indices
 * @param {number} threshold - Confidence threshold
 * @returns {Array} Array of detection objects
 */
function processDetections(boxes, scores, classes, threshold) {
    const detections = [];
    
    for (let i = 0; i < scores.length; i++) {
        if (scores[i] > threshold) {
            const className = labels[classes[i]];
            detections.push({
                class: className,
                score: scores[i],
                box: boxes[i]
            });
        }
    }
    
    return detections;
}

/**
 * Draw detection results on canvas
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array} boxes - Bounding boxes
 * @param {Array} scores - Detection confidence scores
 * @param {Array} classes - Class indices
 * @param {number} threshold - Confidence threshold
 * @param {number} originalWidth - Original canvas width
 * @param {number} originalHeight - Original canvas height
 */
function drawDetections(canvas, ctx, boxes, scores, classes, threshold, originalWidth, originalHeight) {
    // Clear any previous drawings
    ctx.lineWidth = 2;
    ctx.font = '16px Arial';
    ctx.textBaseline = 'top';
    
    for (let i = 0; i < scores.length; i++) {
        if (scores[i] > threshold) {
            // Get box coordinates - note these are normalized [0-1] values
            const [y, x, height, width] = boxes[i];
            
            // Scale to canvas size
            const boxX = x * originalWidth;
            const boxY = y * originalHeight;
            const boxWidth = width * originalWidth;
            const boxHeight = height * originalHeight;
            
            // Draw box based on class
            const className = labels[classes[i]];
            const score = Math.round(scores[i] * 100);
            const color = className === 'ball_golf' ? '#FF0000' : '#00FF00';
            
            // Draw bounding box
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.rect(boxX, boxY, boxWidth, boxHeight);
            ctx.stroke();
            
            // Draw label background
            const label = `${className}: ${score}%`;
            const textWidth = ctx.measureText(label).width;
            ctx.fillStyle = color;
            ctx.fillRect(boxX, boxY, textWidth + 10, 20);
            
            // Draw label text
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(label, boxX + 5, boxY);
        }
    }
}

// Export functions for use in other modules
window.initDetectionModel = initDetectionModel;
window.detectObjects = detectObjects;
window.updateDebugInfo = updateDebugInfo; 