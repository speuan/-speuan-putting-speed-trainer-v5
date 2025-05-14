/**
 * Ball Detector
 * Detects golf balls and coins in image frames using a YOLO model
 */

class BallDetector {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.modelLoading = false;
        this.detectionThreshold = 0.5; // Confidence threshold
        this.modelPath = './my_model_web_model_5/model.json';
        this.classNames = {
            0: 'ball_golf',
            1: 'coin'
        };
        this.colors = {
            'ball_golf': '#FF0000', // Red for golf balls
            'coin': '#00FF00'       // Green for coins
        };
    }
    
    /**
     * Initialize the detector and load the YOLO model
     */
    async initialize() {
        if (this.isModelLoaded || this.modelLoading) return;
        
        this.modelLoading = true;
        
        try {
            console.log('Loading YOLO detection model...');
            
            // Load the model
            this.model = await tf.loadGraphModel(this.modelPath);
            
            // Warm up the model by running a prediction on a dummy tensor
            const dummyInput = tf.zeros([1, 640, 640, 3]);
            const warmupResult = await this.model.executeAsync(dummyInput);
            
            // Dispose of the tensors to free memory
            dummyInput.dispose();
            if (Array.isArray(warmupResult)) {
                warmupResult.forEach(tensor => tensor.dispose());
            } else {
                warmupResult.dispose();
            }
            
            this.isModelLoaded = true;
            console.log('YOLO detection model loaded successfully');
        } catch (error) {
            console.error('Error loading YOLO detection model:', error);
            alert('Failed to load the detection model. Please check your internet connection and try again.');
        } finally {
            this.modelLoading = false;
        }
    }
    
    /**
     * Process an image using the YOLO model to detect balls and coins
     * @param {HTMLCanvasElement|HTMLImageElement} imageElement - The image to process
     * @returns {Promise<Array>} - Array of detection objects with class, confidence and bounding box
     */
    async detectObjects(imageElement) {
        if (!this.isModelLoaded) {
            try {
                await this.initialize();
            } catch (error) {
                console.error('Failed to initialize model:', error);
                return [];
            }
        }
        
        if (!this.isModelLoaded) {
            console.warn('Model not loaded yet, cannot perform detection');
            return [];
        }
        
        try {
            // Create a tensor from the image (resized to 640x640 which is what the model expects)
            const imageTensor = tf.browser.fromPixels(imageElement)
                .resizeBilinear([640, 640])
                .div(255.0)
                .expandDims(0);
            
            // Run the model on the tensor
            const result = await this.model.executeAsync(imageTensor);
            
            // Process the result to get detections
            let detections = await this.processOutput(result, imageElement.width, imageElement.height);
            
            // Clean up tensors to prevent memory leaks
            imageTensor.dispose();
            if (Array.isArray(result)) {
                result.forEach(tensor => tensor.dispose());
            } else {
                result.dispose();
            }
            
            return detections;
        } catch (error) {
            console.error('Error during object detection:', error);
            return [];
        }
    }
    
    /**
     * Process the output from the YOLO model
     * @param {tf.Tensor|Array<tf.Tensor>} output - Model output
     * @param {number} originalWidth - Original image width
     * @param {number} originalHeight - Original image height
     * @returns {Array} - Array of detection objects
     */
    async processOutput(output, originalWidth, originalHeight) {
        // The output format depends on the specific YOLO model
        // We need to extract the boxes, scores, and class predictions
        
        // Assuming the first tensor has the detection results
        let predictions;
        if (Array.isArray(output)) {
            predictions = await output[0].array();
        } else {
            predictions = await output.array();
        }
        
        const detections = [];
        
        // Process each prediction
        for (let i = 0; i < predictions[0].length; i++) {
            const prediction = predictions[0][i];
            
            // Extract values (format depends on your specific model)
            // Typically the YOLO output has [x, y, width, height, confidence, class1_score, class2_score, ...]
            const confidence = prediction[4]; // Confidence score
            
            if (confidence < this.detectionThreshold) continue;
            
            // Find the class with the highest score
            let maxClassScore = 0;
            let detectedClass = -1;
            
            for (let j = 5; j < prediction.length; j++) {
                if (prediction[j] > maxClassScore) {
                    maxClassScore = prediction[j];
                    detectedClass = j - 5;
                }
            }
            
            // Skip if no class was detected with sufficient confidence
            if (detectedClass === -1 || maxClassScore < this.detectionThreshold) continue;
            
            // Calculate bounding box coordinates
            // YOLO gives normalized coordinates (0-1) for the center (x,y) and width/height
            // We convert them to pixel coordinates relative to the original image
            const x = prediction[0];
            const y = prediction[1];
            const width = prediction[2];
            const height = prediction[3];
            
            // Convert center coordinates to top-left corner and denormalize to original image size
            const xScale = originalWidth / 640;
            const yScale = originalHeight / 640;
            
            const left = (x - width/2) * 640 * xScale;
            const top = (y - height/2) * 640 * yScale;
            const boxWidth = width * 640 * xScale;
            const boxHeight = height * 640 * yScale;
            
            detections.push({
                class: this.classNames[detectedClass],
                confidence: confidence,
                bbox: {
                    x: left,
                    y: top,
                    width: boxWidth,
                    height: boxHeight
                }
            });
        }
        
        return detections;
    }
    
    /**
     * Draw bounding boxes around detected objects
     * @param {CanvasRenderingContext2D} ctx - Canvas context to draw on
     * @param {Array} detections - Array of detection objects
     */
    drawDetections(ctx, detections) {
        detections.forEach(detection => {
            const { bbox, class: className, confidence } = detection;
            const { x, y, width, height } = bbox;
            
            // Set styling
            ctx.strokeStyle = this.colors[className] || '#FF0000';
            ctx.lineWidth = 3;
            ctx.fillStyle = this.colors[className] || '#FF0000';
            ctx.font = '16px Arial';
            
            // Draw bounding box
            ctx.beginPath();
            ctx.rect(x, y, width, height);
            ctx.stroke();
            
            // Draw label background
            const label = `${className} (${Math.round(confidence * 100)}%)`;
            const textMetrics = ctx.measureText(label);
            const textHeight = 20; // Approximate height of the text
            ctx.fillStyle = this.colors[className] || '#FF0000';
            ctx.fillRect(x, y - textHeight, textMetrics.width + 10, textHeight);
            
            // Draw label text
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(label, x + 5, y - 5);
        });
    }
} 