/**
 * Object detection module using TensorFlow.js
 */

// Model reference
let model = null;
let isModelLoading = false;
let labels = ['ball_golf']; // Labels for our detection classes
const MODEL_INPUT_SIZE = 640; // Model expects 640x640 input
const MIN_CONFIDENCE = 0.5; // Minimum confidence threshold
const IOU_THRESHOLD = 0.3; // Intersection over Union threshold for clustering

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
        const modelUrl = './my_model_web_model/model.json';
        
        // Test if model.json is accessible
        try {
            const response = await fetch(modelUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            await response.json();
            updateDebugInfo('Model JSON accessed successfully');
        } catch (fetchError) {
            updateDebugInfo(`Error checking model.json: ${fetchError}`);
            throw new Error('Could not access model.json file');
        }
        
        // Load the model with progress reporting
        model = await tf.loadGraphModel(modelUrl, {
            onProgress: (fraction) => {
                updateDebugInfo(`Model loading progress: ${(fraction * 100).toFixed(1)}%`);
            }
        });
        
        updateDebugInfo('Model loaded successfully, warming up...');
        
        // Warm up the model with a dummy tensor
        const dummyInput = tf.zeros([1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 3]);
        const testResult = await model.predict(dummyInput);
        updateDebugInfo(`Model input shape: ${dummyInput.shape}`);
        updateDebugInfo(`Model output shape: ${testResult.shape}`);
        dummyInput.dispose();
        testResult.dispose();
        
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
async function detectObjects(canvas, ctx, threshold = MIN_CONFIDENCE) {
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
        
        // Process image using tf.tidy for memory management
        let imgTensor;
        try {
            imgTensor = tf.tidy(() => {
                // Convert to tensor
                const imageTensor = tf.browser.fromPixels(imageData);
                // Normalize pixel values to [0-1]
                const normalized = tf.div(tf.cast(imageTensor, 'float32'), 255);
                // Resize to model input size
                const resized = tf.image.resizeBilinear(normalized, [MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
                // Add batch dimension [1, 640, 640, 3]
                return resized.expandDims(0);
            });
            
            updateDebugInfo(`Prepared input tensor: ${imgTensor.shape}`);
        } catch (tensorError) {
            updateDebugInfo('Error creating input tensor: ' + tensorError.message);
            throw tensorError;
        }
        
        // Store original dimensions for mapping back to canvas coordinates
        const originalWidth = canvas.width;
        const originalHeight = canvas.height;
        
        // Run inference
        updateDebugInfo('Running model inference...');
        
        let predictions;
        try {
            predictions = await model.predict(imgTensor);
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
            const arrayPreds = await predictions.array();
            predictions.dispose();
            
            // Process the output into a usable format
            const detections = processDetections(arrayPreds[0], threshold);
            
            // Only proceed if we have detections
            if (detections && detections.length > 0) {
                // Draw the best detection on the canvas
                drawDetections(canvas, ctx, detections[0], originalWidth, originalHeight);
                
                // Return the detections for further processing
                return detections;
            } else {
                updateDebugInfo('No valid detections found');
                return [];
            }
        } catch (processError) {
            updateDebugInfo('Error processing results: ' + processError.message);
            console.error('Error processing results:', processError);
            
            // Try to safely dispose of predictions if it exists
            if (predictions && typeof predictions.dispose === 'function') {
                predictions.dispose();
            }
            
            throw processError;
        }
    } catch (error) {
        updateDebugInfo('Detection error: ' + error.message);
        console.error('Detection error:', error);
        throw error;
    }
}

/**
 * Process raw model output into usable detections
 * @param {Array} predictions - Raw model predictions
 * @param {number} threshold - Confidence threshold
 * @returns {Array} Processed detections
 */
function processDetections(predictions, threshold) {
    if (!predictions || predictions.length !== 5) {
        updateDebugInfo('Invalid prediction format');
        return null;
    }
    
    // Get all detections above minimum confidence
    const detections = [];
    for (let i = 0; i < predictions[0].length; i++) {
        const confidence = predictions[4][i];
        if (confidence > threshold) {
            detections.push({
                x: predictions[0][i] / MODEL_INPUT_SIZE,
                y: predictions[1][i] / MODEL_INPUT_SIZE,
                w: predictions[2][i] / MODEL_INPUT_SIZE,
                h: predictions[3][i] / MODEL_INPUT_SIZE,
                confidence: confidence
            });
        }
    }
    
    if (detections.length === 0) {
        return null;
    }
    
    // Cluster overlapping detections
    const clusters = clusterDetections(detections);
    
    // Get the cluster with highest confidence
    let bestCluster = clusters[0];
    for (let i = 1; i < clusters.length; i++) {
        if (clusters[i].confidence > bestCluster.confidence) {
            bestCluster = clusters[i];
        }
    }
    
    return [bestCluster];
}

/**
 * Cluster overlapping detections to reduce duplicates
 * @param {Array} detections - Array of detection objects
 * @returns {Array} Clustered detections
 */
function clusterDetections(detections) {
    const clusters = [];
    
    for (const detection of detections) {
        let added = false;
        
        for (const cluster of clusters) {
            if (calculateIoU(detection, cluster) > IOU_THRESHOLD) {
                // Merge detection into cluster with weighted average
                const totalWeight = cluster.confidence + detection.confidence;
                cluster.x = (cluster.x * cluster.confidence + detection.x * detection.confidence) / totalWeight;
                cluster.y = (cluster.y * cluster.confidence + detection.y * detection.confidence) / totalWeight;
                cluster.w = (cluster.w * cluster.confidence + detection.w * detection.confidence) / totalWeight;
                cluster.h = (cluster.h * cluster.confidence + detection.h * detection.confidence) / totalWeight;
                cluster.confidence = Math.max(cluster.confidence, detection.confidence);
                added = true;
                break;
            }
        }
        
        if (!added) {
            clusters.push({...detection});
        }
    }
    
    return clusters;
}

/**
 * Calculate Intersection over Union (IoU) between two bounding boxes
 * @param {Object} box1 - First box {x, y, w, h}
 * @param {Object} box2 - Second box {x, y, w, h}
 * @returns {number} IoU value between 0 and 1
 */
function calculateIoU(box1, box2) {
    // Convert from center format to corner format
    const box1Left = box1.x - box1.w/2;
    const box1Right = box1.x + box1.w/2;
    const box1Top = box1.y - box1.h/2;
    const box1Bottom = box1.y + box1.h/2;
    
    const box2Left = box2.x - box2.w/2;
    const box2Right = box2.x + box2.w/2;
    const box2Top = box2.y - box2.h/2;
    const box2Bottom = box2.y + box2.h/2;
    
    // Calculate intersection
    const intersectionLeft = Math.max(box1Left, box2Left);
    const intersectionRight = Math.min(box1Right, box2Right);
    const intersectionTop = Math.max(box1Top, box2Top);
    const intersectionBottom = Math.min(box1Bottom, box2Bottom);
    
    if (intersectionRight < intersectionLeft || intersectionBottom < intersectionTop) {
        return 0;
    }
    
    const intersectionArea = (intersectionRight - intersectionLeft) * (intersectionBottom - intersectionTop);
    const box1Area = box1.w * box1.h;
    const box2Area = box2.w * box2.h;
    
    return intersectionArea / (box1Area + box2Area - intersectionArea);
}

/**
 * Draw detection results on canvas
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} detection - Detection object
 * @param {number} originalWidth - Original canvas width
 * @param {number} originalHeight - Original canvas height
 */
function drawDetections(canvas, ctx, detection, originalWidth, originalHeight) {
    if (!canvas || !ctx || !detection) {
        return;
    }
    
    // Extract values from detection (these are normalized 0-1)
    const { x, y, w, h, confidence } = detection;
    
    // Convert normalized coordinates to canvas coordinates
    const centerX = x * originalWidth;
    const centerY = y * originalHeight;
    const boxWidth = w * originalWidth;
    const boxHeight = h * originalHeight;
    
    // Calculate top-left corner for drawing
    const drawX = centerX - (boxWidth / 2);
    const drawY = centerY - (boxHeight / 2);
    
    try {
        // Draw thin bounding box
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#FF0000';
        ctx.strokeRect(drawX, drawY, boxWidth, boxHeight);
        
        // Draw small confidence score
        const text = `${(confidence * 100).toFixed(1)}%`;
        ctx.font = '14px Arial';
        
        // Text background
        const padding = 4;
        const textMetrics = ctx.measureText(text);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(
            drawX, 
            drawY - 20, 
            textMetrics.width + padding * 2, 
            18
        );
        
        // Text
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(text, drawX + padding, drawY - 6);
        
    } catch (error) {
        updateDebugInfo(`Error during drawing: ${error.message}`);
    }
}

// Export functions for use in other modules
window.initDetectionModel = initDetectionModel;
window.detectObjects = detectObjects;
window.updateDebugInfo = updateDebugInfo; 