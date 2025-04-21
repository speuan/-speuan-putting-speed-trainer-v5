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
                const classCounts = {};
                
                for (let j = 0; j < Math.min(1000, arr.length); j++) {
                    const classIdx = Math.round(arr[j]);
                    if (classIdx < minClass) minClass = classIdx;
                    if (classIdx > maxClass) maxClass = classIdx;
                    
                    // Count occurrences of each class
                    classCounts[classIdx] = (classCounts[classIdx] || 0) + 1;
                }
                
                updateDebugInfo(`Class index range: ${minClass} to ${maxClass}, available labels: ${labels.length}`);
                
                // Log most frequent classes
                const sortedClasses = Object.entries(classCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);
                    
                if (sortedClasses.length > 0) {
                    updateDebugInfo(`Most frequent classes: ${
                        sortedClasses.map(([cls, count]) => `${cls}(${count})`).join(', ')
                    }`);
                }
                
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
                updateDebugInfo(`Single tensor: Converted to array with shape: [${arrayPreds.length},${arrayPreds[0] ? arrayPreds[0].length : 0}]${arrayPreds[0] && arrayPreds[0][0] ? ','+arrayPreds[0][0].length : ''}`);
                predictions.dispose();
            }
            
            // Step 2: Determine format and convert to standard format if needed
            let standardizedPreds;
            
            // Handle YOLOv8 transposed format [1,6,8400]
            if (arrayPreds.length === 1 && 
                arrayPreds[0].length === 6 && 
                arrayPreds[0][0].length > 0) {
                
                updateDebugInfo(`Detected YOLOv8 transposed format [1,6,8400] with ${arrayPreds[0][0].length} detections`);
                
                // This is the YOLOv8 transposed format where we have:
                // [1, 6, 8400] -> [batch, rows, cols]
                // rows: 0=x, 1=y, 2=w, 3=h, 4=conf, 5=class
                // cols: each column is a different detection
                
                // Extract the 6 rows (we ignore the batch dimension)
                const xs = Array.from(arrayPreds[0][0]);
                const ys = Array.from(arrayPreds[0][1]);
                const ws = Array.from(arrayPreds[0][2]);
                const hs = Array.from(arrayPreds[0][3]);
                const confs = Array.from(arrayPreds[0][4]);
                const classes = Array.from(arrayPreds[0][5]).map(c => Math.round(c));
                
                // Check if coordinates are already normalized (0-1) or are absolute values
                const maxX = Math.max(...xs);
                const maxY = Math.max(...ys);
                
                // If coordinates are absolute (typical for YOLOv8), normalize them
                let normalizedXs = xs;
                let normalizedYs = ys;
                let normalizedWs = ws;
                let normalizedHs = hs;
                
                if (maxX > 1.0 || maxY > 1.0) {
                    updateDebugInfo(`Coordinates appear to be absolute values, normalizing to 0-1 range (maxX=${maxX.toFixed(1)}, maxY=${maxY.toFixed(1)})`);
                    
                    // Normalize to 0-1 range assuming MODEL_INPUT_SIZE (typically 640)
                    normalizedXs = xs.map(x => x / MODEL_INPUT_SIZE);
                    normalizedYs = ys.map(y => y / MODEL_INPUT_SIZE);
                    normalizedWs = ws.map(w => w / MODEL_INPUT_SIZE);
                    normalizedHs = hs.map(h => h / MODEL_INPUT_SIZE);
                    
                    updateDebugInfo(`Normalized coordinates - x range: ${Math.min(...normalizedXs).toFixed(3)}-${Math.max(...normalizedXs).toFixed(3)}, y range: ${Math.min(...normalizedYs).toFixed(3)}-${Math.max(...normalizedYs).toFixed(3)}`);
                }
                
                // Log sample of data for verification
                updateDebugInfo(`Data samples (normalized) - x:${normalizedXs[0].toFixed(3)}, y:${normalizedYs[0].toFixed(3)}, w:${normalizedWs[0].toFixed(3)}, h:${normalizedHs[0].toFixed(3)}, conf:${confs[0].toFixed(3)}, class:${classes[0]}`);
                
                standardizedPreds = [normalizedXs, normalizedYs, normalizedWs, normalizedHs, confs, classes];
                updateDebugInfo(`Converted transposed format to standard 6-array format with ${normalizedXs.length} detections`);
            } else if (Array.isArray(arrayPreds) && arrayPreds.length === 1 && Array.isArray(arrayPreds[0]) && arrayPreds[0].length > 0) {
                // This is likely the "combined" output format where all detections are in one tensor
                // Each row is [x, y, w, h, conf, class_0, class_1, ...]
                // with 7 or more columns
                if (arrayPreds[0].length >= 7) {
                    // Columns as expected, reshape to standard format
                    const xs = [], ys = [], ws = [], hs = [], confs = [], classes = [];
                    
                    for (let i = 0; i < arrayPreds[0].length; i++) {
                        const row = arrayPreds[0][i];
                        xs.push(row[0]); // x center
                        ys.push(row[1]); // y center
                        ws.push(row[2]); // width
                        hs.push(row[3]);
                        
                        // Normalize confidence if greater than 1.0
                        let confidence = row[4];
                        if (confidence > 1.0) {
                            confidence = confidence / 100.0;
                        }
                        confs.push(confidence);
                        
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
                            classes.push(maxClassIdx);
                        } else {
                            // If only one class score, use it directly
                            classes.push(Math.round(row[5]));
                        }
                    }
                    
                    standardizedPreds = [xs, ys, ws, hs, confs, classes];
                    updateDebugInfo(`Converted to standard 6-array format with ${xs.length} detections`);
                    
                    // Check if coordinates need normalization
                    const maxX = Math.max(...xs);
                    const maxY = Math.max(...ys);
                    
                    if (maxX > 1.0 || maxY > 1.0) {
                        updateDebugInfo(`Combined format: Coordinates appear to be absolute, normalizing (maxX=${maxX.toFixed(1)}, maxY=${maxY.toFixed(1)})`);
                        
                        // Normalize to 0-1 range
                        standardizedPreds[0] = xs.map(x => x / MODEL_INPUT_SIZE);
                        standardizedPreds[1] = ys.map(y => y / MODEL_INPUT_SIZE);
                        standardizedPreds[2] = ws.map(w => w / MODEL_INPUT_SIZE);
                        standardizedPreds[3] = hs.map(h => h / MODEL_INPUT_SIZE);
                    }
                } else {
                    updateDebugInfo(`Unexpected combined format with only ${arrayPreds[0].length} columns, treating as raw output`);
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
                
                // Cluster overlapping detections to reduce duplicates
                const clusteredDetections = clusterDetections(detections);
                updateDebugInfo(`Clustered ${detections.length} detections into ${clusteredDetections.length} groups`);
                
                // Draw the clustered detections on the canvas
                drawDetections(canvas, ctx, clusteredDetections, originalWidth, originalHeight);
                
                // Return the detections for further processing
                return clusteredDetections;
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
            
            // Log a sample of the raw class indices for diagnosis
            if (classIndices && classIndices.length > 0) {
                // Calculate max, min, and unique values from first 20 indices
                const sampleIndices = classIndices.slice(0, 20).map(idx => Math.round(idx));
                const uniqueIndices = [...new Set(sampleIndices)].sort((a, b) => a - b);
                updateDebugInfo(`Class indices sample: ${sampleIndices.join(', ')}`);
                updateDebugInfo(`Unique class indices: ${uniqueIndices.join(', ')}`);
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
            
            // Handle class index more robustly
            let className;
            if (classIdx >= 0 && classIdx < labels.length) {
                // Valid class index within our labels array
                className = labels[classIdx];
            } else {
                // Out of range class index
                // Log the index once per session to avoid spamming the log
                const logKey = `logged_class_${classIdx}`;
                if (!window[logKey]) {
                    updateDebugInfo(`Unknown class index: ${classIdx} (outside valid range 0-${labels.length-1})`);
                    window[logKey] = true;
                }
                className = `unknown_${classIdx}`;
            }
            
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
    
    // Group detections by class first
    const detectionsByClass = {};
    
    // Group by class
    for (const detection of detections) {
        const className = detection.class;
        if (!detectionsByClass[className]) {
            detectionsByClass[className] = [];
        }
        detectionsByClass[className].push(detection);
    }
    
    // Process each class separately
    for (const className in detectionsByClass) {
        const classDetections = detectionsByClass[className];
        
        // Skip if only one detection for this class
        if (classDetections.length <= 1) {
            clusters.push(...classDetections);
            continue;
        }
        
        // Sort by confidence (highest first)
        classDetections.sort((a, b) => b.confidence - a.confidence);
        
        const processed = new Array(classDetections.length).fill(false);
        
        // Process each detection
        for (let i = 0; i < classDetections.length; i++) {
            if (processed[i]) continue;
            
            const detection = classDetections[i];
            const cluster = { ...detection };
            processed[i] = true;
            
            // Find all overlapping detections with this one
            for (let j = i + 1; j < classDetections.length; j++) {
                if (processed[j]) continue;
                
                const otherDetection = classDetections[j];
                
                // Check if they overlap
                if (calculateIoU(detection, otherDetection) > IOU_THRESHOLD) {
                    // Mark as processed
                    processed[j] = true;
                    
                    // Log the merger
                    updateDebugInfo(`Merging detection with IoU > ${IOU_THRESHOLD}: (${detection.x.toFixed(2)},${detection.y.toFixed(2)}) and (${otherDetection.x.toFixed(2)},${otherDetection.y.toFixed(2)})`);
                    
                    // No need to merge, we keep the highest confidence one
                    // which is already the first one due to our sorting
                }
            }
            
            // Add cluster to results
            clusters.push(cluster);
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
        updateDebugInfo(`drawDetections: Missing required parameters: canvas=${!!canvas}, ctx=${!!ctx}, detections=${!!detections}`);
        return;
    }
    
    updateDebugInfo(`Drawing ${detections.length} detections on canvas size ${originalWidth}x${originalHeight}`);
    
    // Define colors for different classes
    const classColors = {
        'ball_golf': '#FF0000', // Red
        'coin': '#00FF00'       // Green
    };
    
    // Save current context state
    ctx.save();
    
    // Draw each detection with its class color
    for (const detection of detections) {
        try {
            // Extract values from detection (these are normalized 0-1)
            const { x, y, w, h, confidence, class: className } = detection;
            
            // Validate coordinates are within 0-1 range
            if (x < 0 || x > 1 || y < 0 || y > 1 || w < 0 || w > 1 || h < 0 || h > 1) {
                updateDebugInfo(`Warning: Detection has coordinates outside 0-1 range: x=${x.toFixed(3)}, y=${y.toFixed(3)}, w=${w.toFixed(3)}, h=${h.toFixed(3)}`);
            }
            
            // Clip coordinates to 0-1 range to avoid drawing outside canvas
            const xClipped = Math.max(0, Math.min(1, x));
            const yClipped = Math.max(0, Math.min(1, y));
            const wClipped = Math.max(0.001, Math.min(1, w));
            const hClipped = Math.max(0.001, Math.min(1, h));
            
            updateDebugInfo(`Drawing ${className} at (${xClipped.toFixed(3)}, ${yClipped.toFixed(3)}) size ${wClipped.toFixed(3)}x${hClipped.toFixed(3)}`);
            
            // Get color for class or use default red
            const color = classColors[className] || '#FF0000';
            
            // Convert normalized coordinates to canvas coordinates
            const centerX = xClipped * originalWidth;
            const centerY = yClipped * originalHeight;
            const boxWidth = wClipped * originalWidth;
            const boxHeight = hClipped * originalHeight;
            
            updateDebugInfo(`Canvas coords: center(${centerX.toFixed(1)}, ${centerY.toFixed(1)}), size ${boxWidth.toFixed(1)}x${boxHeight.toFixed(1)}`);
            
            // Calculate top-left corner for drawing
            const drawX = centerX - (boxWidth / 2);
            const drawY = centerY - (boxHeight / 2);
            
            // Debug coordinate conversions
            updateDebugInfo(`Drawing box at (${drawX.toFixed(1)}, ${drawY.toFixed(1)}) with size ${boxWidth.toFixed(1)}x${boxHeight.toFixed(1)}`);
            
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
    
    updateDebugInfo(`Finished drawing all detections`);
}

// Export functions for use in other modules
window.initDetectionModel = initDetectionModel;
window.detectObjects = detectObjects;
window.updateDebugInfo = updateDebugInfo; 