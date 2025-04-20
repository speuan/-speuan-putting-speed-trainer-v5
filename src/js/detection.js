/**
 * Object detection module using TensorFlow.js
 */

// Model reference
let model = null;
let isModelLoading = false;
let labels = ['ball_golf']; // Labels for our detection classes
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
        let paddingInfo = {}; // Store padding information for coordinate transformation
        
        try {
            imgTensor = tf.tidy(() => {
                // Convert to tensor
                updateDebugInfo('Creating tensor from image data');
                const tensor = tf.browser.fromPixels(imageData);
                updateDebugInfo(`Created tensor: ${tensor.shape}`);
                
                // YOLOv8 requires exact [640,640] input with proper normalization
                // Most important: preserve aspect ratio and normalize pixel values
                
                // Get original dimensions
                const [height, width] = tensor.shape.slice(0, 2);
                updateDebugInfo(`Original image dimensions: ${width}x${height}`);
                
                // Normalize pixel values to [0,1]
                const normalized = tensor.div(255.0);
                
                // Calculate scaling to maintain aspect ratio
                const scale = Math.min(
                    MODEL_INPUT_SIZE / width,
                    MODEL_INPUT_SIZE / height
                );
                const newWidth = Math.round(width * scale);
                const newHeight = Math.round(height * scale);
                
                // Store scale factor for transforming back coordinates
                paddingInfo.scale = scale;
                paddingInfo.newWidth = newWidth;
                paddingInfo.newHeight = newHeight;
                
                updateDebugInfo(`Resizing to ${newWidth}x${newHeight} while maintaining aspect ratio`);
                
                // Resize the image
                const resized = tf.image.resizeBilinear(normalized, [newHeight, newWidth]);
                
                // Create a black canvas (zeros) of MODEL_INPUT_SIZE x MODEL_INPUT_SIZE
                const background = tf.zeros([MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 3]);
                
                // Calculate padding to center the image
                const yPad = Math.floor((MODEL_INPUT_SIZE - newHeight) / 2);
                const xPad = Math.floor((MODEL_INPUT_SIZE - newWidth) / 2);
                
                // Store padding info for transforming back coordinates
                paddingInfo.xPad = xPad;
                paddingInfo.yPad = yPad;
                
                updateDebugInfo(`Adding padding: top/bottom=${yPad}, left/right=${xPad}`);
                
                // Place the resized image on the canvas
                // Using slice and concat operations instead of pad for more explicit control
                const withPadding = tf.tidy(() => {
                    // Pad the tensor with calculated offsets
                    return tf.pad(
                        resized,
                        [
                            [yPad, MODEL_INPUT_SIZE - newHeight - yPad], // top, bottom padding
                            [xPad, MODEL_INPUT_SIZE - newWidth - xPad],  // left, right padding
                            [0, 0]                                      // no channel padding
                        ]
                    );
                });
                
                // Add batch dimension [1, 640, 640, 3]
                const batched = withPadding.expandDims(0);
                
                updateDebugInfo(`Final preprocessed tensor shape: ${batched.shape}`);
                return batched;
            });
            
            updateDebugInfo(`Final input tensor shape: ${imgTensor.shape}`);
            updateDebugInfo(`Padding info: scale=${paddingInfo.scale}, xPad=${paddingInfo.xPad}, yPad=${paddingInfo.yPad}`);
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
            
            // Log what predictions actually is
            updateDebugInfo(`Predictions type: ${typeof predictions}`);
            if (predictions === null) {
                updateDebugInfo('Predictions is null');
            } else if (predictions === undefined) {
                updateDebugInfo('Predictions is undefined');
            } else if (Array.isArray(predictions)) {
                updateDebugInfo(`Predictions is an array of length ${predictions.length}`);
            } else if (predictions instanceof tf.Tensor) {
                updateDebugInfo(`Predictions is a single tensor with shape ${predictions.shape}`);
            } else {
                updateDebugInfo(`Predictions is: ${JSON.stringify(predictions)}`);
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
            updateDebugInfo('Processing detection results');
            
            // Handle different formats of model outputs
            let boxes, scores, classes;
            
            if (!predictions) {
                throw new Error('No predictions returned from model');
            }
            
            // The model might return a single tensor (YOLOv8 format) or an array of tensors
            if (predictions instanceof tf.Tensor) {
                // Log the tensor shape for debugging
                updateDebugInfo(`Single tensor output detected with shape: ${predictions.shape}`);
                
                const detections = await predictions.arraySync();
                updateDebugInfo(`Detections array: ${detections ? 'exists' : 'is null/undefined'}`);
                
                if (!detections || detections.length === 0) {
                    updateDebugInfo('No valid detections found in tensor');
                    // Clean up tensor
                    predictions.dispose();
                    // Return empty array since no detections found
                    return [];
                }
                
                // Process the output tensor based on YOLOv8 format
                const parsedDetections = [];
                
                // Get the data from first batch
                const batch = detections[0];
                
                // Determine format based on second dimension (number of rows)
                const numRows = batch.length;
                updateDebugInfo(`Tensor has ${numRows} rows in second dimension`);
                
                // Find the range of coordinate values to determine if they're normalized
                let minX = Infinity, maxX = -Infinity;
                let minY = Infinity, maxY = -Infinity;
                let minW = Infinity, maxW = -Infinity;
                let minH = Infinity, maxH = -Infinity;
                
                // Sample some values to determine range
                const sampleSize = Math.min(100, batch[0].length);
                for (let i = 0; i < sampleSize; i++) {
                    minX = Math.min(minX, batch[0][i]);
                    maxX = Math.max(maxX, batch[0][i]);
                    minY = Math.min(minY, batch[1][i]);
                    maxY = Math.max(maxY, batch[1][i]);
                    minW = Math.min(minW, batch[2][i]);
                    maxW = Math.max(maxW, batch[2][i]);
                    minH = Math.min(minH, batch[3][i]);
                    maxH = Math.max(maxH, batch[3][i]);
                }
                
                updateDebugInfo(`Coordinate ranges: x=[${minX.toFixed(1)}, ${maxX.toFixed(1)}], y=[${minY.toFixed(1)}, ${maxY.toFixed(1)}], w=[${minW.toFixed(1)}, ${maxW.toFixed(1)}], h=[${minH.toFixed(1)}, ${maxH.toFixed(1)}]`);
                
                // Determine if coordinates are already normalized [0-1] or need normalization
                const needsNormalization = maxX > 1 || maxY > 1;
                updateDebugInfo(`Normalization needed: ${needsNormalization}`);
                
                // Function to handle coordinate scaling
                const scaleCoordinate = (value, dimension) => {
                    if (needsNormalization) {
                        // If coordinates are in model input space (0-640), normalize to [0-1]
                        return value / MODEL_INPUT_SIZE;
                    }
                    return value; // Already normalized
                };
                
                if (numRows === 5) {
                    // Format [1,5,8400] - simplified detection format with:
                    // - x, y, width, height in first 4 rows
                    // - objectness/confidence in 5th row
                    
                    // For shape [1,5,8400], treat each column as a detection
                    const numDetections = batch[0].length; // Should be 8400
                    
                    updateDebugInfo(`Processing ${numDetections} potential detections`);
                    
                    // For each potential detection (column in the tensor)
                    for (let i = 0; i < numDetections; i++) {
                        // Get coordinates: x, y, width, height
                        const x = scaleCoordinate(batch[0][i], 'width');
                        const y = scaleCoordinate(batch[1][i], 'height');
                        const width = scaleCoordinate(batch[2][i], 'width');
                        const height = scaleCoordinate(batch[3][i], 'height');
                        
                        // Get confidence score (objectness)
                        const confidence = batch[4][i];
                        
                        // Only process if confidence is reasonable
                        if (confidence > threshold) {
                            // Add detection with class 'ball_golf' (index 0)
                            parsedDetections.push({
                                class: labels[0],
                                score: confidence,
                                box: [x, y, width, height]
                            });
                            
                            updateDebugInfo(`Detection ${i}: class=${labels[0]}, score=${Math.round(confidence*100)}%, box=[${x.toFixed(2)}, ${y.toFixed(2)}, ${width.toFixed(2)}, ${height.toFixed(2)}]`);
                        }
                    }
                } else if (numRows > 5) {
                    // Format likely [1,85,8400] for YOLOv8 with 80 classes
                    // - x, y, width, height in first 4 rows
                    // - objectness in 5th row
                    // - class scores in remaining rows
                    
                    const numDetections = batch[0].length;
                    
                    updateDebugInfo(`Processing ${numDetections} potential detections with ${numRows - 5} possible classes`);
                    
                    // For each potential detection (column in the tensor)
                    for (let i = 0; i < numDetections; i++) {
                        // Get coordinates: x, y, width, height
                        const x = scaleCoordinate(batch[0][i], 'width');
                        const y = scaleCoordinate(batch[1][i], 'height');
                        const width = scaleCoordinate(batch[2][i], 'width');
                        const height = scaleCoordinate(batch[3][i], 'height');
                        
                        // Get objectness score
                        const objectness = batch[4][i];
                        
                        // Skip if objectness is too low
                        if (objectness < threshold) continue;
                        
                        // We know from metadata.yaml that our only class is 'ball_golf' at index 0
                        // No need to check other class scores - if objectness is high enough, it's a ball
                        parsedDetections.push({
                            class: labels[0],
                            score: objectness, // Use objectness as the score
                            box: [x, y, width, height]
                        });
                        
                        updateDebugInfo(`Detection ${i}: class=${labels[0]}, score=${Math.round(objectness*100)}%, box=[${x.toFixed(2)}, ${y.toFixed(2)}, ${width.toFixed(2)}, ${height.toFixed(2)}]`);
                    }
                } else {
                    updateDebugInfo(`Unexpected tensor format with ${numRows} rows`);
                }
                
                // Clean up tensor
                predictions.dispose();
                
                // Display results from the parsed detections
                updateDebugInfo(`Parsed ${parsedDetections.length} detections from single tensor`);
                
                // Apply Non-Maximum Suppression to remove overlapping boxes
                const finalDetections = applyNMS(parsedDetections, 0.3); // Lower IoU threshold (0.3) to be more aggressive with suppression
                updateDebugInfo(`After NMS: ${finalDetections.length} unique detections remain`);
                
                // Draw detections if any found
                if (finalDetections.length > 0) {
                    updateDebugInfo(`Drawing ${finalDetections.length} bounding boxes on canvas`);
                    
                    // Draw boxes on canvas
                    for (const detection of finalDetections) {
                        const [x, y, width, height] = detection.box;
                        
                        // Apply the correct coordinate transformation
                        // Map from model space (with padding) back to original image space
                        const modelX = x * MODEL_INPUT_SIZE;
                        const modelY = y * MODEL_INPUT_SIZE;
                        const modelWidth = width * MODEL_INPUT_SIZE;
                        const modelHeight = height * MODEL_INPUT_SIZE;
                        
                        // Subtract padding and adjust for scale
                        const unpadX = (modelX - paddingInfo.xPad) / paddingInfo.scale;
                        const unpadY = (modelY - paddingInfo.yPad) / paddingInfo.scale;
                        const unpadWidth = modelWidth / paddingInfo.scale;
                        const unpadHeight = modelHeight / paddingInfo.scale;
                        
                        // Ensure values are within canvas bounds
                        const boxX = Math.max(0, unpadX);
                        const boxY = Math.max(0, unpadY);
                        const boxWidth = Math.min(unpadWidth, canvas.width - boxX);
                        const boxHeight = Math.min(unpadHeight, canvas.height - boxY);
                        
                        updateDebugInfo(`Drawing box at (${boxX.toFixed(1)},${boxY.toFixed(1)}) with size ${boxWidth.toFixed(1)}x${boxHeight.toFixed(1)}`);
                        
                        // Draw the bounding box
                        ctx.strokeStyle = '#FF0000'; // Red color for golf ball
                        ctx.lineWidth = 3; // Thicker line
                        ctx.beginPath();
                        ctx.rect(boxX, boxY, boxWidth, boxHeight);
                        ctx.stroke();
                    }
                }
                
                // Return the deduplicated detections
                return finalDetections;
            } 
            else if (Array.isArray(predictions)) {
                // Original format expected by our code
                updateDebugInfo(`Array of tensors detected with length: ${predictions.length}`);
                
                if (predictions.length < 3) {
                    updateDebugInfo(`Warning: Expected at least 3 tensors, got ${predictions.length}`);
                    // We might need to handle this differently depending on the model
                    
                    // Log available tensors for debugging
                    predictions.forEach((tensor, i) => {
                        if (tensor) {
                            updateDebugInfo(`Tensor ${i} shape: ${tensor.shape}`);
                        } else {
                            updateDebugInfo(`Tensor ${i} is null/undefined`);
                        }
                    });
                    
                    // Clean up any tensors
                    predictions.forEach(tensor => {
                        if (tensor) tensor.dispose();
                    });
                    
                    // Return empty array since we can't process this format
                    return [];
                }
                
                // We have the expected 3+ tensors
                boxes = await predictions[0].arraySync();
                scores = await predictions[1].arraySync();
                classes = await predictions[2].arraySync();
                
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
                drawDetections(canvas, ctx, boxes[0], scores[0], classes[0], threshold, originalWidth, originalHeight, paddingInfo);
                
                // Return detected objects for further processing
                return processDetections(boxes[0], scores[0], classes[0], threshold);
            }
            else {
                // Unknown format
                updateDebugInfo(`Unexpected prediction format: ${typeof predictions}`);
                
                // Try to safely dispose of whatever predictions is
                if (predictions && typeof predictions.dispose === 'function') {
                    predictions.dispose();
                }
                
                // Return empty array since we can't process this format
                return [];
            }
        } catch (processError) {
            updateDebugInfo('Error processing results: ' + processError.message);
            console.error('Error processing results:', processError);
            
            // Try to safely dispose of predictions if it exists
            if (predictions) {
                if (Array.isArray(predictions)) {
                    predictions.forEach(tensor => {
                        if (tensor && typeof tensor.dispose === 'function') {
                            tensor.dispose();
                        }
                    });
                } else if (predictions && typeof predictions.dispose === 'function') {
                    predictions.dispose();
                }
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
 * @param {Object} paddingInfo - Padding information for coordinate transformation
 */
function drawDetections(canvas, ctx, boxes, scores, classes, threshold, originalWidth, originalHeight, paddingInfo = null) {
    // Clear any previous drawings
    ctx.lineWidth = 2;
    
    // Add debug boxes at corners
    const boxSize = 20;
    
    // Top-left (Red)
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(0, 0, boxSize, boxSize);
    ctx.stroke();
    
    // Top-right (Green)
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(originalWidth - boxSize, 0, boxSize, boxSize);
    ctx.stroke();
    
    // Bottom-left (Blue)
    ctx.strokeStyle = '#0000FF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(0, originalHeight - boxSize, boxSize, boxSize);
    ctx.stroke();
    
    // Bottom-right (Yellow)
    ctx.strokeStyle = '#FFFF00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(originalWidth - boxSize, originalHeight - boxSize, boxSize, boxSize);
    ctx.stroke();
    
    // Draw the center of the image
    ctx.strokeStyle = '#FF00FF'; // Magenta
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(originalWidth/2 - boxSize/2, originalHeight/2 - boxSize/2, boxSize, boxSize);
    ctx.stroke();
    
    // Now draw the actual detection boxes
    for (let i = 0; i < scores.length; i++) {
        if (scores[i] > threshold) {
            // Get box coordinates - note these are normalized [0-1] values
            // Fix the coordinate order - model outputs [y, x, height, width]
            const [y, x, height, width] = boxes[i];
            
            // Draw debug info about the box
            ctx.fillStyle = 'white';
            ctx.fillRect(10, 10, 320, 100);
            ctx.fillStyle = 'black';
            ctx.font = '12px monospace';
            ctx.fillText(`Original coords: [${y.toFixed(3)}, ${x.toFixed(3)}, ${height.toFixed(3)}, ${width.toFixed(3)}]`, 15, 25);
            
            let boxX, boxY, boxWidth, boxHeight;
            
            // Use more accurate coordinate transformation if we have padding info
            if (paddingInfo) {
                // Convert normalized coordinates to model space (0-640)
                const modelX = x * MODEL_INPUT_SIZE;
                const modelY = y * MODEL_INPUT_SIZE;
                const modelWidth = width * MODEL_INPUT_SIZE;
                const modelHeight = height * MODEL_INPUT_SIZE;
                
                // Subtract padding and adjust for scale
                const unpadX = (modelX - paddingInfo.xPad) / paddingInfo.scale;
                const unpadY = (modelY - paddingInfo.yPad) / paddingInfo.scale;
                const unpadWidth = modelWidth / paddingInfo.scale;
                const unpadHeight = modelHeight / paddingInfo.scale;
                
                // Final coordinates
                boxX = Math.max(0, unpadX);
                boxY = Math.max(0, unpadY);
                boxWidth = Math.min(unpadWidth, originalWidth - boxX);
                boxHeight = Math.min(unpadHeight, originalHeight - boxY);
                
                ctx.fillText(`Padding: xPad=${paddingInfo.xPad}, yPad=${paddingInfo.yPad}, scale=${paddingInfo.scale.toFixed(3)}`, 15, 40);
                ctx.fillText(`Model space: (${modelX.toFixed(1)},${modelY.toFixed(1)}) ${modelWidth.toFixed(1)}x${modelHeight.toFixed(1)}`, 15, 55);
                ctx.fillText(`Unpadded: (${unpadX.toFixed(1)},${unpadY.toFixed(1)}) ${unpadWidth.toFixed(1)}x${unpadHeight.toFixed(1)}`, 15, 70);
            } else {
                // Fallback to simple scaling if no padding info
                boxX = x * originalWidth;
                boxY = y * originalHeight;
                boxWidth = width * originalWidth;
                boxHeight = height * originalHeight;
            }
            
            ctx.fillText(`Final box: (${boxX.toFixed(1)},${boxY.toFixed(1)}) ${boxWidth.toFixed(1)}x${boxHeight.toFixed(1)}`, 15, 85);
            
            // Draw box based on class
            const className = labels[classes[i]];
            const color = className === 'ball_golf' ? '#FF0000' : '#00FF00';
            
            // Draw the bounding box
            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.rect(boxX, boxY, boxWidth, boxHeight);
            ctx.stroke();
            
            // Highlight the corners
            drawCornerDot(ctx, boxX, boxY, '#FFFF00');
            drawCornerDot(ctx, boxX + boxWidth, boxY, '#FF00FF');
            drawCornerDot(ctx, boxX, boxY + boxHeight, '#00FFFF');
            drawCornerDot(ctx, boxX + boxWidth, boxY + boxHeight, '#FFFFFF');
        }
    }
}

// Helper function to draw a corner dot
function drawCornerDot(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fill();
}

/**
 * Calculate Intersection over Union (IoU) between two bounding boxes
 * @param {Array} box1 - First box [x, y, width, height]
 * @param {Array} box2 - Second box [x, y, width, height]
 * @returns {number} IoU value between 0 and 1
 */
function calculateIoU(box1, box2) {
    // Convert [x, y, width, height] to [x1, y1, x2, y2] format
    const [x1, y1, w1, h1] = box1;
    const [x2, y2, w2, h2] = box2;
    
    const box1X2 = x1 + w1;
    const box1Y2 = y1 + h1;
    const box2X2 = x2 + w2;
    const box2Y2 = y2 + h2;
    
    // Calculate intersection area
    const intersectX1 = Math.max(x1, x2);
    const intersectY1 = Math.max(y1, y2);
    const intersectX2 = Math.min(box1X2, box2X2);
    const intersectY2 = Math.min(box1Y2, box2Y2);
    
    // Return 0 if there's no intersection
    if (intersectX2 - intersectX1 < 0 || intersectY2 - intersectY1 < 0) {
        return 0;
    }
    
    const intersectionArea = (intersectX2 - intersectX1) * (intersectY2 - intersectY1);
    const box1Area = w1 * h1;
    const box2Area = w2 * h2;
    
    // Calculate Union area
    const unionArea = box1Area + box2Area - intersectionArea;
    
    // Return IoU
    return intersectionArea / unionArea;
}

/**
 * Apply Non-Maximum Suppression to remove overlapping boxes
 * @param {Array} detections - Array of detection objects with box and score properties
 * @param {number} iouThreshold - IoU threshold for suppression (default 0.5)
 * @returns {Array} Filtered array of detections
 */
function applyNMS(detections, iouThreshold = 0.5) {
    if (detections.length === 0) return [];
    
    // Sort detections by confidence score (descending)
    const sortedDetections = [...detections].sort((a, b) => b.score - a.score);
    const selectedDetections = [];
    
    updateDebugInfo(`Applying NMS on ${sortedDetections.length} detections (IoU threshold: ${iouThreshold})`);
    
    // Continue until we've processed all detections
    while (sortedDetections.length > 0) {
        // Select the detection with highest confidence
        const bestDetection = sortedDetections.shift();
        selectedDetections.push(bestDetection);
        
        // Filter out detections that overlap significantly with the selected one
        let i = 0;
        while (i < sortedDetections.length) {
            const iou = calculateIoU(bestDetection.box, sortedDetections[i].box);
            
            if (iou > iouThreshold) {
                // Remove this detection as it overlaps with our best detection
                updateDebugInfo(`Removing overlapping detection (IoU: ${iou.toFixed(2)})`);
                sortedDetections.splice(i, 1);
            } else {
                // Keep this detection and check the next one
                i++;
            }
        }
    }
    
    updateDebugInfo(`NMS complete: ${detections.length} detections → ${selectedDetections.length} after NMS`);
    return selectedDetections;
}

function drawPrediction(canvas, ctx, prediction, threshold = 0.5, paddingInfo = null) {
    if (!prediction || prediction.score < threshold) return;

    const [x, y, width, height] = prediction.bbox;
    const className = prediction.class;
    
    let boxX, boxY, boxWidth, boxHeight;
    
    // Use more accurate coordinate transformation if we have padding info
    if (paddingInfo) {
        // Convert normalized coordinates to model space (0-640)
        const modelX = x * MODEL_INPUT_SIZE;
        const modelY = y * MODEL_INPUT_SIZE;
        const modelWidth = width * MODEL_INPUT_SIZE;
        const modelHeight = height * MODEL_INPUT_SIZE;
        
        // Subtract padding and adjust for scale
        const unpadX = (modelX - paddingInfo.xPad) / paddingInfo.scale;
        const unpadY = (modelY - paddingInfo.yPad) / paddingInfo.scale;
        const unpadWidth = modelWidth / paddingInfo.scale;
        const unpadHeight = modelHeight / paddingInfo.scale;
        
        // Final coordinates
        boxX = Math.max(0, unpadX);
        boxY = Math.max(0, unpadY);
        boxWidth = unpadWidth;
        boxHeight = unpadHeight;
    } else {
        // Fallback to simple scaling if no padding info
        boxX = x;
        boxY = y;
        boxWidth = width;
        boxHeight = height;
    }
    
    // Set color based on class
    const color = className === 'ball_golf' ? '#FF0000' : '#00FF00';
    
    // Draw bounding box with thicker border for visibility
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.rect(boxX, boxY, boxWidth, boxHeight);
    ctx.stroke();
    
    // Debug - draw a dot at the top-left corner to verify position
    ctx.fillStyle = '#FFFF00';
    ctx.beginPath();
    ctx.arc(boxX, boxY, 4, 0, 2 * Math.PI);
    ctx.fill();
}

// Export functions for use in other modules
window.initDetectionModel = initDetectionModel;
window.detectObjects = detectObjects;
window.updateDebugInfo = updateDebugInfo; 