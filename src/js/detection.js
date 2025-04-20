/**
 * Object detection module using TensorFlow.js
 */

// Model reference
let model = null;
let isModelLoading = false;
let labels = ['ball_golf', 'coin']; // Labels for our detection classes
const MODEL_INPUT_SIZE = 640; // Model expects 640x640 input
const MIN_CONFIDENCE = 0.2; // Lower threshold to 20% to catch more detections
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
        const modelUrl = './my_model_web_model 2/model.json';
        
        // Test if model.json is accessible
        try {
            const response = await fetch(modelUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const modelJson = await response.json();
            updateDebugInfo('Model JSON accessed successfully');
            
            // Log model information
            if (modelJson.modelTopology) {
                updateDebugInfo(`Model type: ${modelJson.modelTopology.model_type || 'Unknown'}`);
            }
            
            if (modelJson.weightsManifest) {
                updateDebugInfo(`Model has ${modelJson.weightsManifest.length} weight groups`);
            }
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
        
        // Log model input/output information
        updateDebugInfo('Model input names: ' + model.inputNodes);
        updateDebugInfo('Model output names: ' + model.outputNodes);
        
        // Warm up the model with a dummy tensor
        const dummyInput = tf.zeros([1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 3]);
        const warmupResult = await model.predict(dummyInput);
        
        // Check output format
        if (Array.isArray(warmupResult)) {
            updateDebugInfo(`Model outputs ${warmupResult.length} tensors`);
            for (let i = 0; i < warmupResult.length; i++) {
                updateDebugInfo(`Output ${i} shape: ${warmupResult[i].shape}`);
            }
            warmupResult.forEach(tensor => tensor.dispose());
        } else {
            updateDebugInfo(`Model output tensor shape: ${warmupResult.shape}`);
            warmupResult.dispose();
        }
        
        dummyInput.dispose();
        
        // Log available classes
        updateDebugInfo(`Available class labels: ${labels.join(', ')}`);
        
        updateDebugInfo('Model warm-up complete, detection ready');
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
 * Perform sanity checks on model predictions to verify they're valid
 * @param {Array} predictions - Raw prediction arrays
 * @returns {boolean} Whether predictions seem valid
 */
function validatePredictions(predictions) {
    if (!predictions || !Array.isArray(predictions)) {
        updateDebugInfo('Validation failed: predictions is not an array');
        return false;
    }
    
    // YOLO format has 6 arrays for standard output
    if (predictions.length !== 6) {
        updateDebugInfo(`Validation warning: Expected 6 arrays, got ${predictions.length}`);
        // Don't fail, since we handle multiple formats
    }
    
    // Check if output dimensions make sense
    let allValid = true;
    for (let i = 0; i < predictions.length; i++) {
        const arr = predictions[i];
        if (!Array.isArray(arr)) {
            updateDebugInfo(`Validation failed: predictions[${i}] is not an array`);
            allValid = false;
            continue;
        }
        
        // Check for NaN or Infinity values in the first few items
        const sampleCount = Math.min(10, arr.length);
        let hasNaN = false;
        let hasInfinity = false;
        let hasNegativeInfinity = false;
        
        for (let j = 0; j < sampleCount; j++) {
            if (Number.isNaN(arr[j])) hasNaN = true;
            if (arr[j] === Infinity) hasInfinity = true;
            if (arr[j] === -Infinity) hasNegativeInfinity = true;
        }
        
        if (hasNaN) {
            updateDebugInfo(`Validation warning: predictions[${i}] contains NaN values`);
        }
        if (hasInfinity) {
            updateDebugInfo(`Validation warning: predictions[${i}] contains Infinity values`);
        }
        if (hasNegativeInfinity) {
            updateDebugInfo(`Validation warning: predictions[${i}] contains -Infinity values`);
        }
        
        // For 6-array format, check bounds of values for specific arrays
        if (predictions.length === 6) {
            // Check confidence values are between 0 and 1
            if (i === 4) { // Confidence array
                let minConf = 1, maxConf = 0;
                for (let j = 0; j < Math.min(1000, arr.length); j++) {
                    if (arr[j] < minConf) minConf = arr[j];
                    if (arr[j] > maxConf) maxConf = arr[j];
                }
                
                updateDebugInfo(`Confidence range: ${minConf.toFixed(4)} to ${maxConf.toFixed(4)}`);
                
                if (minConf < 0 || maxConf > 1) {
                    updateDebugInfo(`Validation warning: Confidences outside 0-1 range: ${minConf} to ${maxConf}`);
                }
            }
            
            // Check class indices are within our label range
            if (i === 5) { // Class array
                let minClass = Infinity, maxClass = -Infinity;
                for (let j = 0; j < Math.min(1000, arr.length); j++) {
                    const classIdx = Math.round(arr[j]);
                    if (classIdx < minClass) minClass = classIdx;
                    if (classIdx > maxClass) maxClass = classIdx;
                }
                
                updateDebugInfo(`Class index range: ${minClass} to ${maxClass}, available labels: ${labels.length}`);
                
                if (minClass < 0 || maxClass >= labels.length) {
                    updateDebugInfo(`Validation warning: Class indices outside valid range: ${minClass} to ${maxClass}, should be 0 to ${labels.length - 1}`);
                }
            }
        }
    }
    
    return allValid;
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
        
        // Log detection request
        updateDebugInfo(`Starting object detection with threshold: ${threshold}`);
        
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
                updateDebugInfo(`Created image tensor: ${imageTensor.shape}`);
                
                // Normalize pixel values to [0-1]
                const normalized = tf.div(tf.cast(imageTensor, 'float32'), 255);
                
                // Resize to model input size
                const resized = tf.image.resizeBilinear(normalized, [MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
                updateDebugInfo(`Resized to: ${MODEL_INPUT_SIZE}x${MODEL_INPUT_SIZE}`);
                
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
            
            // Log shape of predictions to understand the model output
            if (Array.isArray(predictions)) {
                updateDebugInfo(`Model returned ${predictions.length} output tensors`);
                for (let i = 0; i < predictions.length; i++) {
                    updateDebugInfo(`Output tensor ${i} shape: ${predictions[i].shape}`);
                }
            } else {
                updateDebugInfo(`Model returned a single output tensor of shape: ${predictions.shape}`);
            }
            
        } catch (inferenceError) {
            updateDebugInfo('Error during inference: ' + inferenceError.message);
            throw inferenceError;
        } finally {
            // Clean up input tensor regardless of success/failure
            imgTensor.dispose();
        }
        
        try {
            // Process results
            let arrayPreds;
            if (Array.isArray(predictions)) {
                // If multiple outputs, handle differently
                arrayPreds = await Promise.all(predictions.map(p => p.array()));
                
                // Debug the arrays - look at a small sample of each array
                updateDebugInfo('Examining tensor data structure:');
                for (let i = 0; i < predictions.length; i++) {
                    updateDebugInfo(`Tensor ${i} shape: ${predictions[i].shape}, rank: ${predictions[i].rank}`);
                }
                
                predictions.forEach(p => p.dispose());
            } else {
                // Single output tensor (usual case)
                arrayPreds = await predictions.array();
                
                // Debug the tensor structure
                updateDebugInfo(`Single tensor - shape: ${predictions.shape}, rank: ${predictions.rank}`);
                
                predictions.dispose();
            }
            
            updateDebugInfo(`Converted predictions to array format`);
            
            // Validate predictions
            validatePredictions(Array.isArray(arrayPreds) ? arrayPreds : [arrayPreds]);
            
            // Debug prediction shape
            if (Array.isArray(arrayPreds) && arrayPreds.length > 0) {
                updateDebugInfo(`Prediction array shape: ${arrayPreds.length} elements`);
                
                // Check first array element structure
                if (Array.isArray(arrayPreds[0])) {
                    updateDebugInfo(`First element is array of length ${arrayPreds[0].length}`);
                    
                    // Sample values from the arrays
                    if (arrayPreds.length >= 6 && arrayPreds[4] && arrayPreds[5]) {
                        // Get top confidence values and their indices
                        const confidences = arrayPreds[4];
                        const classes = arrayPreds[5];
                        
                        // Create index-confidence pairs and sort by confidence
                        let indexConfPairs = [];
                        for (let i = 0; i < confidences.length; i++) {
                            if (i < 8400) { // Limit to prevent excessive processing
                                indexConfPairs.push([i, confidences[i]]);
                            }
                        }
                        indexConfPairs.sort((a, b) => b[1] - a[1]);
                        
                        // Log the top 5 confidence values and their corresponding class
                        updateDebugInfo('Top 5 confidence-class pairs:');
                        for (let i = 0; i < Math.min(5, indexConfPairs.length); i++) {
                            const [idx, conf] = indexConfPairs[i];
                            const classIdx = Math.round(classes[idx]);
                            const className = labels[classIdx] || 'unknown';
                            updateDebugInfo(`  Index ${idx}: ${className} (${(conf*100).toFixed(1)}%)`);
                        }
                    }
                } else {
                    updateDebugInfo(`First element is not an array, type: ${typeof arrayPreds[0]}`);
                }
            }
            
            // Process the output into a usable format
            const detections = processDetections(Array.isArray(arrayPreds) ? arrayPreds[0] : arrayPreds, threshold);
            
            // Only proceed if we have detections
            if (detections && detections.length > 0) {
                updateDebugInfo(`Processed ${detections.length} valid detections`);
                detections.forEach((d, i) => {
                    updateDebugInfo(`Detection ${i+1}: ${d.class} (${Math.round(d.confidence*100)}%) at [${d.x.toFixed(2)}, ${d.y.toFixed(2)}] size [${d.w.toFixed(2)}, ${d.h.toFixed(2)}]`);
                });
                
                // Draw the detections on the canvas
                drawDetections(canvas, ctx, detections, originalWidth, originalHeight);
                
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
    updateDebugInfo(`Processing predictions with ${threshold} threshold`);
    
    // Log prediction shape for debugging
    if (!predictions || !Array.isArray(predictions)) {
        updateDebugInfo('Invalid predictions format: not an array');
        return null;
    }
    
    updateDebugInfo(`Prediction array length: ${predictions.length}`);
    
    // Handle YOLO v8 output format which might vary
    // Try to determine the format of the predictions
    
    let detections = [];
    
    // Try the expected format for YOLO v8 (6 arrays: bbox_x, bbox_y, bbox_w, bbox_h, confidence, class)
    if (predictions.length === 6) {
        updateDebugInfo('Detected 6-array YOLO format - standard output');
        
        // YOLO v8 outputs 8400 prediction anchors per image for a 640x640 model
        const numDetections = predictions[0].length;
        updateDebugInfo(`Processing ${numDetections} potential detections`);
        
        // Show top 10 confidence values from the predictions to debug
        let topConfidences = [];
        for (let i = 0; i < predictions[0].length; i++) {
            const confidence = predictions[4][i];
            topConfidences.push(confidence);
            if (topConfidences.length >= 10) break;
        }
        topConfidences.sort((a, b) => b - a);
        updateDebugInfo(`Top 10 confidence values: ${topConfidences.map(c => c.toFixed(3)).join(', ')}`);
        
        // Lower threshold substantially for testing (0.05 = 5%)
        const debugThreshold = 0.05;
        let debugDetections = [];
        
        // Record all detections by class for analysis
        const classDetections = {};
        for (const label of labels) {
            classDetections[label] = { count: 0, topConfidence: 0 };
        }
        
        // Standard processing with 6 arrays
        for (let i = 0; i < predictions[0].length; i++) {
            // In YOLO v8, confidence is on a 0-1 scale
            const confidence = predictions[4][i];
            const classIndex = Math.round(predictions[5][i]);
            const className = labels[classIndex] || 'unknown';
            
            // Track detection statistics by class
            if (classDetections[className]) {
                classDetections[className].count++;
                if (confidence > classDetections[className].topConfidence) {
                    classDetections[className].topConfidence = confidence;
                }
            }
            
            // Check for unnormalized coordinates (YOLO sometimes outputs relative to input size)
            let x = predictions[0][i];
            let y = predictions[1][i];
            let w = predictions[2][i];
            let h = predictions[3][i];
            
            // If values are already normalized (0-1), keep them
            // Otherwise, normalize them based on model input size
            const needsNormalization = x > 1 || y > 1 || w > 1 || h > 1;
            if (needsNormalization) {
                x = x / MODEL_INPUT_SIZE;
                y = y / MODEL_INPUT_SIZE;
                w = w / MODEL_INPUT_SIZE;
                h = h / MODEL_INPUT_SIZE;
            }
            
            // Log any moderately confident detections for debugging
            if (confidence > debugThreshold) {
                debugDetections.push({
                    class: className,
                    confidence: confidence,
                    x: x,
                    y: y,
                    w: w,
                    h: h
                });
            }
            
            if (confidence > threshold) {
                // Get class with highest probability
                detections.push({
                    x: x,
                    y: y,
                    w: w,
                    h: h,
                    confidence: confidence,
                    class: className,
                    classIndex: classIndex
                });
            }
        }
        
        // Log detection statistics by class
        updateDebugInfo('Detection statistics by class:');
        for (const className in classDetections) {
            updateDebugInfo(`  ${className}: ${classDetections[className].count} detections, best confidence: ${(classDetections[className].topConfidence*100).toFixed(1)}%`);
        }
        
        // Log debug detections, including those below threshold
        if (debugDetections.length > 0) {
            updateDebugInfo(`Found ${debugDetections.length} potential detections above ${debugThreshold}:`);
            debugDetections.sort((a, b) => b.confidence - a.confidence);
            debugDetections.slice(0, 5).forEach((d, i) => {
                updateDebugInfo(`  Potential #${i+1}: ${d.class} (${(d.confidence*100).toFixed(1)}%) at [${d.x.toFixed(2)}, ${d.y.toFixed(2)}]`);
            });
        } else {
            updateDebugInfo(`No detections found above ${debugThreshold} confidence.`);
        }
        
        // If we don't have any detections above our threshold but we have some above the debug threshold,
        // use a couple of the highest confidence detections anyway
        if (detections.length === 0 && debugDetections.length > 0) {
            updateDebugInfo(`No detections above ${threshold}, but using top 2 candidate detections for visualization`);
            
            // Take top 2 debug detections and convert them to regular detections
            const candidateDetections = debugDetections.slice(0, 2);
            for (const debugDet of candidateDetections) {
                // We need to estimate width and height since debug detections don't include them
                // Use a reasonable default size of 10% of the image
                const estimatedSize = 0.1;
                
                detections.push({
                    x: debugDet.x,
                    y: debugDet.y,
                    w: estimatedSize,
                    h: estimatedSize,
                    confidence: debugDet.confidence,
                    class: debugDet.class,
                    classIndex: labels.indexOf(debugDet.class)
                });
                
                updateDebugInfo(`Using candidate detection: ${debugDet.class} (${(debugDet.confidence*100).toFixed(1)}%)`);
            }
        }
    } 
    // Try the alternative format where the first dimension is the number of detections
    else if (predictions.length > 0 && Array.isArray(predictions[0]) && predictions[0].length === 5) {
        updateDebugInfo('Detected detection-first YOLO format');
        
        // Process each detection
        for (let i = 0; i < predictions.length; i++) {
            const confidence = predictions[i][4];
            if (confidence > threshold) {
                // Default to class 0 (ball_golf) if we don't have class info
                const className = labels[0] || 'unknown';
                
                detections.push({
                    x: predictions[i][0] / MODEL_INPUT_SIZE,
                    y: predictions[i][1] / MODEL_INPUT_SIZE,
                    w: predictions[i][2] / MODEL_INPUT_SIZE,
                    h: predictions[i][3] / MODEL_INPUT_SIZE,
                    confidence: confidence,
                    class: className,
                    classIndex: 0
                });
            }
        }
    }
    // Try the format where the output is a single array with 7 values per detection
    else if (predictions.length > 0 && Array.isArray(predictions[0]) && predictions[0].length >= 7) {
        updateDebugInfo('Detected flattened YOLO format (7+ values per detection)');
        
        // Process each detection (x, y, w, h, conf, class1_prob, class2_prob, ...)
        for (let i = 0; i < predictions.length; i++) {
            const detection = predictions[i];
            const confidence = detection[4];
            
            if (confidence > threshold) {
                // Find class with highest probability
                let maxClassProb = 0;
                let maxClassIdx = 0;
                for (let c = 5; c < detection.length; c++) {
                    if (detection[c] > maxClassProb) {
                        maxClassProb = detection[c];
                        maxClassIdx = c - 5;
                    }
                }
                
                const className = labels[maxClassIdx] || 'unknown';
                
                detections.push({
                    x: detection[0] / MODEL_INPUT_SIZE,
                    y: detection[1] / MODEL_INPUT_SIZE,
                    w: detection[2] / MODEL_INPUT_SIZE,
                    h: detection[3] / MODEL_INPUT_SIZE,
                    confidence: confidence,
                    class: className,
                    classIndex: maxClassIdx
                });
            }
        }
    }
    else {
        updateDebugInfo(`Unknown prediction format. Expected 6 arrays, got ${predictions.length}`);
        return [];
    }
    
    if (detections.length === 0) {
        updateDebugInfo('No detections above threshold');
        return [];
    }
    
    updateDebugInfo(`Found ${detections.length} detections above threshold`);
    
    // Cluster overlapping detections of the same class
    const clusters = clusterDetections(detections);
    updateDebugInfo(`After clustering: ${clusters.length} detections`);
    
    // Return all clusters
    return clusters;
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
        
        // Only cluster detections of the same class
        for (const cluster of clusters) {
            if (cluster.classIndex === detection.classIndex && 
                calculateIoU(detection, cluster) > IOU_THRESHOLD) {
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
 * @param {Array} detections - Array of detection objects
 * @param {number} originalWidth - Original canvas width
 * @param {number} originalHeight - Original canvas height
 */
function drawDetections(canvas, ctx, detections, originalWidth, originalHeight) {
    if (!canvas || !ctx || !detections) {
        return;
    }
    
    // Define colors for different classes
    const classColors = {
        'ball_golf': '#FF0000', // Red
        'coin': '#00FF00'       // Green
    };
    
    // Save current context state
    ctx.save();
    
    // Draw each detection with its class color
    for (const detection of detections) {
        // Extract values from detection (these are normalized 0-1)
        const { x, y, w, h, confidence, class: className } = detection;
        
        // Get color for class or use default red
        const color = classColors[className] || '#FF0000';
        
        // Convert normalized coordinates to canvas coordinates
        const centerX = x * originalWidth;
        const centerY = y * originalHeight;
        const boxWidth = w * originalWidth;
        const boxHeight = h * originalHeight;
        
        // Calculate top-left corner for drawing
        const drawX = centerX - (boxWidth / 2);
        const drawY = centerY - (boxHeight / 2);
        
        try {
            // Draw bounding box with thicker stroke for visibility
            ctx.lineWidth = 4;
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.rect(drawX, drawY, boxWidth, boxHeight);
            ctx.stroke();
            
            // Add a semi-transparent fill to make the box more visible
            ctx.fillStyle = `${color}33`; // 20% opacity
            ctx.fillRect(drawX, drawY, boxWidth, boxHeight);
            
            // Draw class name and confidence score with improved visibility
            const confidencePercent = Math.round(confidence * 100);
            const text = `${className}: ${confidencePercent}%`;
            
            // Text styling for better visibility
            ctx.font = 'bold 16px Arial';
            
            // Measure text for background
            const textMetrics = ctx.measureText(text);
            const textWidth = textMetrics.width;
            const textHeight = 20; // Approximate height
            
            // Draw text background
            ctx.fillStyle = color;
            ctx.fillRect(
                drawX - 2, 
                drawY - textHeight - 2, 
                textWidth + 12, 
                textHeight + 4
            );
            
            // Draw text
            ctx.fillStyle = '#FFFFFF'; // White text
            ctx.fillText(text, drawX + 4, drawY - 5);
            
            // Draw center point for better visibility
            ctx.beginPath();
            ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.stroke();
            
        } catch (error) {
            updateDebugInfo(`Error during drawing: ${error.message}`);
        }
    }
    
    // Restore context state
    ctx.restore();
}

// Export functions for use in other modules
window.initDetectionModel = initDetectionModel;
window.detectObjects = detectObjects;
window.updateDebugInfo = updateDebugInfo; 