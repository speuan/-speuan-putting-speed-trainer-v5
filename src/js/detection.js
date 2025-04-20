/**
 * Object detection module using TensorFlow.js
 */

// Model reference
let model = null;
let isModelLoading = false;
let labels = ['ball_golf', 'coin']; // Labels for our detection classes
const MODEL_INPUT_SIZE = 640; // Model expects 640x640 input
const MIN_CONFIDENCE = 0.2; // Lower threshold to 20% to catch more detections
const DEBUG_MIN_CONFIDENCE = 0.1; // Lower threshold for debugging output
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
        
        if (model.graphModel && model.graphModel.outputs) {
            updateDebugInfo('Output node details:');
            for (const outputNode of model.graphModel.outputs) {
                updateDebugInfo(`  - ${outputNode.name}: shape=${JSON.stringify(outputNode.attrParams?.shape?.value || 'unknown')}`);
            }
        }
        
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
            // Step 1: Convert predictions to arrays for processing
            let arrayPreds;
            
            // Handle different output formats
            if (Array.isArray(predictions)) {
                // Multiple output tensors case (typical YOLO format)
                arrayPreds = await Promise.all(predictions.map(p => p.array()));
                updateDebugInfo(`Multiple tensors: Converted ${predictions.length} tensors to arrays`);
                predictions.forEach(p => p.dispose());
            } else {
                // Single output tensor case (could be combined outputs in one tensor)
                arrayPreds = await predictions.array();
                updateDebugInfo(`Single tensor: Converted to array with shape: [${arrayPreds.length},${arrayPreds[0] ? arrayPreds[0].length : 0}]`);
                predictions.dispose();
            }
            
            // Step 2: Determine format and convert to standard format if needed
            let standardizedPreds;
            
            if (Array.isArray(arrayPreds) && arrayPreds.length === 1 && Array.isArray(arrayPreds[0]) && arrayPreds[0].length > 0) {
                // This is likely the "combined" output format where all detections are in one tensor
                // Each row is [x, y, w, h, conf, class_0, class_1, ...]
                updateDebugInfo(`Detected combined detection format with ${arrayPreds[0].length} rows`);
                
                // Sample a few rows to inspect
                updateDebugInfo(`Example row 0: ${arrayPreds[0][0].slice(0, Math.min(10, arrayPreds[0][0].length)).join(', ')}...`);
                
                // Convert to standard 6-array format (x,y,w,h,conf,class_idx)
                const numRows = arrayPreds[0].length;
                const numCols = arrayPreds[0][0].length;
                
                // Process this format - we expect each detection to have:
                // [x, y, w, h, confidence, class_0_score, class_1_score]
                // with 7 or more columns
                if (numCols >= 7) {
                    // Columns as expected, reshape to standard format
                    const xs = [], ys = [], ws = [], hs = [], confs = [], classes = [];
                    
                    for (let i = 0; i < numRows; i++) {
                        const row = arrayPreds[0][i];
                        xs.push(row[0]); // x center
                        ys.push(row[1]); // y center
                        ws.push(row[2]); // width
                        hs.push(row[3]); // height
                        confs.push(row[4]); // confidence
                        
                        // Find class with highest probability
                        let maxClassIdx = 0;
                        let maxClassProb = row[5];
                        for (let c = 6; c < numCols; c++) {
                            if (row[c] > maxClassProb) {
                                maxClassProb = row[c];
                                maxClassIdx = c - 5;
                            }
                        }
                        classes.push(maxClassIdx);
                    }
                    
                    standardizedPreds = [xs, ys, ws, hs, confs, classes];
                    updateDebugInfo(`Converted to standard 6-array format with ${numRows} detections`);
                } else {
                    updateDebugInfo(`Unexpected combined format with only ${numCols} columns, treating as raw output`);
                    standardizedPreds = arrayPreds;
                }
            } else if (Array.isArray(arrayPreds) && arrayPreds.length === 6) {
                // Standard 6-array format, use as is
                updateDebugInfo(`Using standard 6-array YOLO format`);
                standardizedPreds = arrayPreds;
            } else {
                // Unknown format, log and use as is
                updateDebugInfo(`Unknown output format, using raw model output`);
                standardizedPreds = arrayPreds;
            }
            
            // Step 3: Process the standardized predictions into detections
            const detections = processDetections(standardizedPreds, threshold);
            
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
 * Process raw model output into a usable detection format
 * @param {Array} predictions - Raw predictions from YOLO model
 * @param {number} confidenceThreshold - Minimum confidence threshold
 * @return {Array} Array of detection objects {x,y,w,h,class,confidence}
 */
function processDetections(predictions, confidenceThreshold = MIN_CONFIDENCE) {
    try {
        updateDebugInfo(`Processing detections with threshold: ${confidenceThreshold}`);
        
        // Detection statistics
        const detectionStats = {};
        let totalDetections = 0;
        let validDetections = 0;
        let bestConfidence = 0;
        
        // Handle different types of input formats
        let xs, ys, ws, hs, confidences, classIndices;
        
        // Determine the type of input format
        if (Array.isArray(predictions) && predictions.length === 6) {
            // Standard YOLOv8 format: 6 arrays [xs, ys, ws, hs, confidences, classes]
            updateDebugInfo('Processing standard 6-array YOLO format');
            [xs, ys, ws, hs, confidences, classIndices] = predictions;
            totalDetections = confidences.length;
            
            // Normalize confidence values if they're greater than 1.0
            const maxConfidence = Math.max(...confidences);
            if (maxConfidence > 1.0) {
                updateDebugInfo(`Normalizing confidence values (max found: ${maxConfidence.toFixed(2)})`);
                confidences = confidences.map(conf => conf / 100.0);
            }
        } else if (Array.isArray(predictions) && predictions.length === 1 && Array.isArray(predictions[0])) {
            // Combined array format - each row contains a full detection
            updateDebugInfo('Processing combined format from single tensor output');
            xs = [];
            ys = [];
            ws = [];
            hs = [];
            confidences = [];
            classIndices = [];
            
            const rows = predictions[0];
            totalDetections = rows.length;
            
            // Extract values from each row
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                // Check if row has enough elements for a detection
                if (row.length >= 6) {
                    xs.push(row[0]);
                    ys.push(row[1]);
                    ws.push(row[2]);
                    hs.push(row[3]);
                    
                    // Normalize confidence if greater than 1.0
                    let confidence = row[4];
                    if (confidence > 1.0) {
                        confidence = confidence / 100.0;
                    }
                    confidences.push(confidence);
                    
                    // Find class with highest probability if we have class probabilities
                    if (row.length > 6) {
                        let maxClassIdx = 0;
                        let maxProb = row[5];
                        for (let c = 6; c < row.length; c++) {
                            if (row[c] > maxProb) {
                                maxProb = row[c];
                                maxClassIdx = c - 5; 
                            }
                        }
                        classIndices.push(maxClassIdx);
                    } else {
                        // If only one class score, use it directly
                        classIndices.push(Math.round(row[5]));
                    }
                }
            }
        } else {
            // Unknown format - log and return empty array
            updateDebugInfo(`Unrecognized prediction format. Got: ${typeof predictions}`);
            if (Array.isArray(predictions)) {
                updateDebugInfo(`Array of length ${predictions.length}`);
                if (predictions.length > 0) {
                    updateDebugInfo(`First element type: ${typeof predictions[0]}`);
                }
            }
            return [];
        }
        
        updateDebugInfo(`Processing ${totalDetections} raw detections`);
        
        // Prepare result array
        const detections = [];
        
        // Process each detection
        for (let i = 0; i < totalDetections; i++) {
            const confidence = confidences[i];
            const classIdx = Math.round(classIndices[i]);
            
            // Log all detections with moderate confidence for debugging
            const className = labels[classIdx] || `class_${classIdx}`;
            
            // Track statistics for each class
            if (!detectionStats[className]) {
                detectionStats[className] = {
                    count: 0,
                    bestConfidence: 0
                };
            }
            detectionStats[className].count++;
            
            // Track best confidence
            if (confidence > detectionStats[className].bestConfidence) {
                detectionStats[className].bestConfidence = confidence;
            }
            
            // Track overall best confidence
            if (confidence > bestConfidence) {
                bestConfidence = confidence;
            }
            
            // Skip lower confidence detections early
            if (confidence < DEBUG_MIN_CONFIDENCE) continue;
            
            // Log detections with moderate confidence for debugging
            if (confidence < confidenceThreshold && confidence >= DEBUG_MIN_CONFIDENCE) {
                updateDebugInfo(`Low confidence detection: ${className} (${(confidence*100).toFixed(1)}%)`);
            }
            
            // Filter by confidence threshold
            if (confidence >= confidenceThreshold) {
                detections.push({
                    x: xs[i],         // Center X (relative 0-1)
                    y: ys[i],         // Center Y (relative 0-1)
                    w: ws[i],         // Width (relative 0-1)
                    h: hs[i],         // Height (relative 0-1)
                    class: className, // Class name
                    confidence: confidence // Confidence score (0-1)
                });
                validDetections++;
            }
        }
        
        // Log detection statistics
        updateDebugInfo(`Detection statistics:`);
        for (const className in detectionStats) {
            updateDebugInfo(`  ${className}: ${detectionStats[className].count} detections, best confidence: ${(detectionStats[className].bestConfidence*100).toFixed(1)}%`);
        }
        updateDebugInfo(`Total raw detections: ${totalDetections}, valid detections: ${validDetections}`);
        updateDebugInfo(`Best overall confidence: ${(bestConfidence*100).toFixed(1)}%`);
        
        if (detections.length === 0) {
            updateDebugInfo(`No detections above threshold (${confidenceThreshold*100}%)`);
        }
        
        return detections;
    } catch (error) {
        updateDebugInfo(`Error processing detections: ${error.message}`);
        console.error('Error processing detections:', error);
        return [];
    }
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