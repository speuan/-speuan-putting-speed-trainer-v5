/**
 * Object detection module using TensorFlow.js
 */

// Model reference
let model = null;
let isModelLoading = false;
let labels = ['Ball', 'Coin']; // Labels for our detection classes

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
        
        // Prepare image for the model
        const imgTensor = tf.browser.fromPixels(imageData)
            .expandDims(0); // Add batch dimension
        
        // Run inference
        console.log('Running object detection...');
        const predictions = await model.executeAsync(imgTensor);
        
        // Process results (format depends on specific YOLO model output)
        // This part might need adjustments based on the exact model output format
        const boxes = await predictions[0].arraySync();
        const scores = await predictions[1].arraySync();
        const classes = await predictions[2].arraySync();
        
        // Clean up tensors
        imgTensor.dispose();
        predictions.forEach(tensor => tensor.dispose());
        
        // Draw results on canvas
        drawDetections(canvas, ctx, boxes[0], scores[0], classes[0], threshold);
        
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
 */
function drawDetections(canvas, ctx, boxes, scores, classes, threshold) {
    // Clear any previous drawings
    ctx.lineWidth = 2;
    ctx.font = '16px Arial';
    ctx.textBaseline = 'top';
    
    for (let i = 0; i < scores.length; i++) {
        if (scores[i] > threshold) {
            // Get box coordinates
            const [y, x, height, width] = boxes[i];
            const boxX = x * canvas.width;
            const boxY = y * canvas.height;
            const boxWidth = width * canvas.width;
            const boxHeight = height * canvas.height;
            
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