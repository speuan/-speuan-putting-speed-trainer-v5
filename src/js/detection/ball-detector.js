/**
 * Ball Detector
 * Detects golf balls and coins in image frames using a YOLO model
 */

class BallDetector {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.modelLoading = false;
        this.detectionThreshold = 0.2; // Lower threshold for better detection
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
            console.log('Starting object detection...');
            
            // Log image dimensions to help with debugging
            console.log('Image dimensions:', {
                width: imageElement.width,
                height: imageElement.height
            });
            
            // Create a tensor from the image (resized to 640x640 which is what the model expects)
            const imageTensor = tf.tidy(() => {
                // Normalize to [0,1] and ensure proper dimensions
                return tf.browser.fromPixels(imageElement)
                    .resizeBilinear([640, 640])
                    .div(255.0)
                    .expandDims(0);
            });
            
            console.log('Running model inference...');
            
            // Run the model on the tensor
            const result = await this.model.executeAsync(imageTensor);
            
            console.log('Model inference complete, processing results...');
            
            // Log the shape of the result to understand the output format
            if (Array.isArray(result)) {
                result.forEach((t, i) => console.log(`Result tensor ${i} shape:`, t.shape));
            } else {
                console.log('Result shape:', result.shape);
            }
            
            // Process the result to get detections
            let detections = await this.processOutput(result, imageElement.width, imageElement.height);
            
            console.log('Detections found:', detections);
            
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
        // For YOLOv8 models, the output format depends on the exported model
        // Let's try to determine the format and adapt accordingly
        
        let boxesArray;
        let scoresArray;
        let classesArray;
        
        try {
            if (Array.isArray(output)) {
                // If we have multiple tensors, we need to figure out which is which
                // This is model-specific, but let's try a common pattern for YOLO exports
                
                // Log tensor shapes to debug
                output.forEach((t, i) => {
                    console.log(`Output tensor ${i} shape:`, t.shape);
                });
                
                if (output.length >= 1) {
                    // For YOLOv8 exported with TF format, there's often a single tensor with shape [1, n, 85]
                    // where n is the number of detections and 85 = 4 (box) + 1 (confidence) + 80 (classes)
                    // Or [1, n, m] where m = 4 (box) + 1 (confidence) + num_classes
                    
                    // Get the first tensor as array (likely contains all we need)
                    const predictions = await output[0].array();
                    console.log('Processing predictions array of shape:', predictions.length, 'x', predictions[0].length);
                    
                    const detections = [];
                    
                    // Process each prediction in the output tensor
                    for (let i = 0; i < predictions[0].length; i++) {
                        const prediction = predictions[0][i];
                        
                        // YOLO typically outputs [x_center, y_center, width, height, obj_conf, class_1_conf, class_2_conf, ...]
                        const boxX = prediction[0]; // center x (normalized 0-1)
                        const boxY = prediction[1]; // center y (normalized 0-1)
                        const boxWidth = prediction[2]; // width (normalized 0-1)
                        const boxHeight = prediction[3]; // height (normalized 0-1)
                        const confidence = prediction[4]; // object confidence
                        
                        // Skip low confidence detections
                        if (confidence < this.detectionThreshold) continue;
                        
                        // Find highest scoring class
                        let maxClassScore = 0;
                        let detectedClass = -1;
                        
                        // Classes start at index 5
                        for (let j = 5; j < prediction.length; j++) {
                            if (prediction[j] > maxClassScore) {
                                maxClassScore = prediction[j];
                                detectedClass = j - 5; // Adjust to get 0-based class index
                            }
                        }
                        
                        // Check if we have a valid detection
                        // Use just the object confidence if class scores are not reliable
                        if (detectedClass in this.classNames) {
                            // Convert normalized box coordinates to pixel coordinates
                            // YOLO gives center, width, height - convert to top-left x,y
                            const halfW = boxWidth / 2;
                            const halfH = boxHeight / 2;
                            const xMin = (boxX - halfW) * 640; // Normalized to model input size
                            const yMin = (boxY - halfH) * 640;
                            const width = boxWidth * 640;
                            const height = boxHeight * 640;
                            
                            // Scale to original image size
                            const xScale = originalWidth / 640;
                            const yScale = originalHeight / 640;
                            
                            // Add to detections
                            detections.push({
                                class: this.classNames[detectedClass],
                                confidence: confidence * maxClassScore, // Combined score
                                bbox: {
                                    x: xMin * xScale,
                                    y: yMin * yScale,
                                    width: width * xScale,
                                    height: height * yScale
                                }
                            });
                            
                            console.log(`Detection ${i}: class=${this.classNames[detectedClass]}, conf=${confidence * maxClassScore}, bbox=`, {
                                x: xMin * xScale,
                                y: yMin * yScale,
                                width: width * xScale,
                                height: height * yScale
                            });
                        }
                    }
                    
                    return detections;
                }
            } else {
                // Single tensor output
                const predictions = await output.array();
                console.log('Single tensor output with shape:', output.shape);
                
                // Similar processing as above...
                // (implementation depends on model output format)
                
                return []; // Placeholder, implement based on model format
            }
        } catch (error) {
            console.error('Error processing model output:', error);
            console.error('Output shapes:', Array.isArray(output) ? 
                output.map(t => t.shape) : output.shape);
            return [];
        }
        
        return []; // Fallback empty array
    }
    
    /**
     * Draw bounding boxes around detected objects
     * @param {CanvasRenderingContext2D} ctx - Canvas context to draw on
     * @param {Array} detections - Array of detection objects
     */
    drawDetections(ctx, detections) {
        // Save original context state
        ctx.save();
        
        // Draw each detection
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
        
        // Restore original context state
        ctx.restore();
    }
} 