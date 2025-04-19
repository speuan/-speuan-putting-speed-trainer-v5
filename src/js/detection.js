/**
 * Object detection module using TensorFlow.js
 */

// Model reference
let model = null;
let isModelLoading = false;
let labels = ['Ball', 'Coin']; // Labels for our detection classes
const MODEL_INPUT_SIZE = 640; // Model expects 640x640 input

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
        console.log('Loading object detection model...');
        model = await tf.loadGraphModel('my_model_web_model/model.json');
        console.log('Model loaded successfully');
        isModelLoading = false;
        return model;
    } catch (error) {
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
        // Make sure model is loaded
        await initDetectionModel();
        
        // Get canvas image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Prepare image for the model - resize to 640x640
        const imgTensor = tf.tidy(() => {
            // Convert to tensor
            const tensor = tf.browser.fromPixels(imageData);
            
            // Resize to model input dimensions (maintaining aspect ratio)
            const [height, width] = tensor.shape.slice(0, 2);
            
            // Calculate scaling to maintain aspect ratio but fit within 640x640
            // We'll create a square tensor and pad the image
            const scale = MODEL_INPUT_SIZE / Math.max(height, width);
            const newHeight = Math.round(height * scale);
            const newWidth = Math.round(width * scale);
            
            // Resize image
            const resized = tf.image.resizeBilinear(tensor, [newHeight, newWidth]);
            
            // Create a black canvas of 640x640
            const padded = tf.zeros([MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 3]);
            
            // Calculate offsets to center the image
            const yOffset = Math.floor((MODEL_INPUT_SIZE - newHeight) / 2);
            const xOffset = Math.floor((MODEL_INPUT_SIZE - newWidth) / 2);
            
            // Place the resized image in the center of the canvas
            const sliceStart = [yOffset, xOffset, 0];
            const sliceSize = [newHeight, newWidth, 3];
            
            // Return padded tensor with image placed in center
            return tf.tidy(() => {
                const slice = tf.slice(padded, sliceStart, sliceSize);
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
        
        // Store original dimensions for mapping back to canvas coordinates
        const originalWidth = canvas.width;
        const originalHeight = canvas.height;
        
        // Run inference
        console.log('Running object detection on resized image (640x640)...');
        const predictions = await model.executeAsync(imgTensor);
        
        // Process results (format depends on specific YOLO model output)
        const boxes = await predictions[0].arraySync();
        const scores = await predictions[1].arraySync();
        const classes = await predictions[2].arraySync();
        
        // Clean up tensors
        imgTensor.dispose();
        predictions.forEach(tensor => tensor.dispose());
        
        // Draw results on canvas
        drawDetections(canvas, ctx, boxes[0], scores[0], classes[0], threshold, originalWidth, originalHeight);
        
        // Return detected objects for further processing
        return processDetections(boxes[0], scores[0], classes[0], threshold);
        
    } catch (error) {
        console.error('Detection error:', error);
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
            const color = className === 'Ball' ? '#FF0000' : '#00FF00';
            
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