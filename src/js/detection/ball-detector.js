/**
 * Ball Detector
 * Detects golf balls and coins in image frames using a YOLO model
 */

class BallDetector {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.modelLoading = false;
        this.detectionThreshold = 0.15; // Lower threshold even more for better detection
        this.modelPath = './my_model_web_model_5/model.json';
        this.classNames = {
            0: 'ball_golf',
            1: 'coin'
        };
        this.colors = {
            'ball_golf': '#FF0000', // Red for golf balls
            'coin': '#00FF00'       // Green for coins
        };
        this.inputSize = 640; // YOLO model input size
        
        // Add debug logger
        this.debugLogger = this.getDebugLogger();
    }
    
    /**
     * Get reference to debug logger
     * @returns {Object} Debug logger object
     */
    getDebugLogger() {
        const logElement = document.getElementById('debug-log');
        
        if (!logElement) {
            console.warn('Debug log element not found');
            return {
                log: (message, type = 'info') => console.log(message),
                clear: () => {}
            };
        }
        
        return {
            log: (message, type = 'info') => {
                const entry = document.createElement('div');
                entry.className = `log-entry ${type}`;
                
                const timestamp = document.createElement('span');
                timestamp.className = 'timestamp';
                timestamp.textContent = new Date().toLocaleTimeString();
                
                const content = document.createElement('span');
                content.className = 'content';
                content.textContent = message;
                
                entry.appendChild(timestamp);
                entry.appendChild(content);
                
                logElement.appendChild(entry);
                logElement.scrollTop = logElement.scrollHeight;
                
                // Also log to console
                console.log(`[${type.toUpperCase()}] ${message}`);
            },
            clear: () => {
                logElement.innerHTML = '';
            }
        };
    }
    
    /**
     * Initialize the detector and load the YOLO model
     */
    async initialize() {
        if (this.isModelLoaded) {
            this.debugLogger.log('Model already loaded, skipping initialization', 'info');
            return;
        }
        
        if (this.modelLoading) {
            this.debugLogger.log('Model is currently loading, please wait...', 'info');
            return;
        }
        
        this.modelLoading = true;
        this.debugLogger.log('Starting to load YOLO detection model...', 'info');
        
        try {
            this.debugLogger.log(`Loading model from path: ${this.modelPath}`, 'info');
            
            // Load the model
            const startTime = performance.now();
            this.model = await tf.loadGraphModel(this.modelPath);
            const loadTime = Math.round(performance.now() - startTime);
            
            this.debugLogger.log(`Model loaded in ${loadTime}ms, warming up...`, 'info');
            
            // Warm up the model by running a prediction on a dummy tensor
            const dummyInput = tf.zeros([1, this.inputSize, this.inputSize, 3]);
            this.debugLogger.log('Created dummy input tensor', 'info');
            
            const warmupStartTime = performance.now();
            const warmupResult = await this.model.executeAsync(dummyInput);
            const warmupTime = Math.round(performance.now() - warmupStartTime);
            
            // Log tensor shapes
            if (Array.isArray(warmupResult)) {
                this.debugLogger.log(`Model outputs ${warmupResult.length} tensors`, 'info');
                warmupResult.forEach((tensor, i) => {
                    this.debugLogger.log(`Output tensor ${i} shape: ${tensor.shape}`, 'info');
                });
            } else {
                this.debugLogger.log(`Model output shape: ${warmupResult.shape}`, 'info');
            }
            
            // Dispose of the tensors to free memory
            dummyInput.dispose();
            if (Array.isArray(warmupResult)) {
                warmupResult.forEach(tensor => tensor.dispose());
            } else {
                warmupResult.dispose();
            }
            
            this.isModelLoaded = true;
            this.debugLogger.log(`Model warmed up in ${warmupTime}ms and ready for inference!`, 'success');
        } catch (error) {
            this.debugLogger.log(`Error loading model: ${error.message}`, 'error');
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
                this.debugLogger.log('Model not loaded yet, initializing...', 'warning');
                await this.initialize();
            } catch (error) {
                this.debugLogger.log(`Failed to initialize model: ${error.message}`, 'error');
                console.error('Failed to initialize model:', error);
                return [];
            }
        }
        
        if (!this.isModelLoaded) {
            this.debugLogger.log('Model failed to load, cannot perform detection', 'error');
            console.warn('Model not loaded yet, cannot perform detection');
            return [];
        }
        
        try {
            this.debugLogger.log('Starting object detection...', 'info');
            
            // Create a temporary canvas to properly resize and format the image
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.inputSize;
            tempCanvas.height = this.inputSize;
            const tempCtx = tempCanvas.getContext('2d');
            
            // Log image dimensions to help with debugging
            this.debugLogger.log(`Original image dimensions: ${imageElement.width}x${imageElement.height}`, 'info');
            
            // Draw the image on the temporary canvas with proper dimension handling
            // This preserves aspect ratio by fitting the image within the input size dimensions
            const imgAspectRatio = imageElement.width / imageElement.height;
            let renderWidth, renderHeight, offsetX = 0, offsetY = 0;
            
            if (imgAspectRatio > 1) {
                // Image is wider than tall
                renderWidth = this.inputSize;
                renderHeight = this.inputSize / imgAspectRatio;
                offsetY = (this.inputSize - renderHeight) / 2;
            } else {
                // Image is taller than wide or square
                renderHeight = this.inputSize;
                renderWidth = this.inputSize * imgAspectRatio;
                offsetX = (this.inputSize - renderWidth) / 2;
            }
            
            // Clear the canvas first
            tempCtx.fillStyle = '#000000';
            tempCtx.fillRect(0, 0, this.inputSize, this.inputSize);
            
            // Draw the image centered with proper aspect ratio
            tempCtx.drawImage(
                imageElement,
                offsetX,
                offsetY,
                renderWidth,
                renderHeight
            );
            
            // Debug visualization (optional)
            const debugContainer = document.getElementById('debug-log-container');
            if (debugContainer) {
                // Create a small preview of the processed image
                const previewCanvas = document.createElement('canvas');
                previewCanvas.width = 150;
                previewCanvas.height = 150;
                previewCanvas.style.display = 'block';
                previewCanvas.style.margin = '10px auto';
                previewCanvas.style.border = '1px solid #ddd';
                
                const previewCtx = previewCanvas.getContext('2d');
                previewCtx.drawImage(tempCanvas, 0, 0, 150, 150);
                
                // Add a heading
                const previewLabel = document.createElement('div');
                previewLabel.textContent = 'Model Input Preview:';
                previewLabel.style.fontSize = '0.8rem';
                previewLabel.style.textAlign = 'center';
                previewLabel.style.marginTop = '8px';
                
                // Check if a preview already exists and remove it
                const existingPreview = document.getElementById('model-input-preview');
                if (existingPreview) {
                    existingPreview.remove();
                }
                
                // Create a container for the preview
                const previewContainer = document.createElement('div');
                previewContainer.id = 'model-input-preview';
                previewContainer.appendChild(previewLabel);
                previewContainer.appendChild(previewCanvas);
                
                // Add the preview after the log
                debugContainer.appendChild(previewContainer);
            }
            
            this.debugLogger.log(`Processed image: ${Math.round(renderWidth)}x${Math.round(renderHeight)} with offsets (${Math.round(offsetX)},${Math.round(offsetY)})`, 'info');
            
            // Create a tensor from the properly formatted image
            const imageTensor = tf.tidy(() => {
                // Convert the canvas to a tensor and normalize to [0,1]
                return tf.browser.fromPixels(tempCanvas)
                    .div(255.0)
                    .expandDims(0);
            });
            
            this.debugLogger.log('Running model inference...', 'info');
            
            // Run the model on the tensor
            const startTime = performance.now();
            const result = await this.model.executeAsync(imageTensor);
            const inferenceTime = Math.round(performance.now() - startTime);
            
            this.debugLogger.log(`Model inference completed in ${inferenceTime}ms`, 'success');
            
            // Log the shape of the result to understand the output format
            if (Array.isArray(result)) {
                this.debugLogger.log(`Model returned ${result.length} output tensors`, 'info');
                result.forEach((t, i) => {
                    this.debugLogger.log(`Result tensor ${i} shape: ${t.shape}`, 'info');
                });
            } else {
                this.debugLogger.log(`Result shape: ${result.shape}`, 'info');
            }
            
            // Process the result to get detections
            let detections = await this.processOutput(result, imageElement.width, imageElement.height, offsetX, offsetY, renderWidth, renderHeight);
            
            this.debugLogger.log(`Detection complete: found ${detections.length} objects`, detections.length > 0 ? 'success' : 'warning');
            
            // Clean up tensors to prevent memory leaks
            imageTensor.dispose();
            if (Array.isArray(result)) {
                result.forEach(tensor => tensor.dispose());
            } else {
                result.dispose();
            }
            
            // Clean up the temporary canvas
            tempCanvas.remove();
            
            return detections;
        } catch (error) {
            this.debugLogger.log(`Error during object detection: ${error.message}`, 'error');
            console.error('Error during object detection:', error);
            return [];
        }
    }
    
    /**
     * Process the output from the YOLO model
     * @param {tf.Tensor|Array<tf.Tensor>} output - Model output
     * @param {number} originalWidth - Original image width
     * @param {number} originalHeight - Original image height
     * @param {number} offsetX - X offset used when resizing image
     * @param {number} offsetY - Y offset used when resizing image
     * @param {number} renderWidth - Width of the rendered image in the model input
     * @param {number} renderHeight - Height of the rendered image in the model input
     * @returns {Array} - Array of detection objects
     */
    async processOutput(output, originalWidth, originalHeight, offsetX, offsetY, renderWidth, renderHeight) {
        try {
            if (Array.isArray(output)) {
                // Log tensor shapes to debug
                output.forEach((t, i) => {
                    this.debugLogger.log(`Processing output tensor ${i} with shape: ${t.shape}`, 'info');
                });
                
                if (output.length >= 1) {
                    // Get the first tensor as array (likely contains all we need)
                    const predictions = await output[0].array();
                    this.debugLogger.log(`Processing predictions array of shape: ${predictions.length}x${predictions[0].length}`, 'info');
                    
                    const detections = [];
                    let lowConfidenceCount = 0;
                    
                    // Process each prediction in the output tensor
                    for (let i = 0; i < predictions[0].length; i++) {
                        const prediction = predictions[0][i];
                        
                        // YOLO typically outputs [x_center, y_center, width, height, obj_conf, class_1_conf, class_2_conf, ...]
                        const boxX = prediction[0]; // center x (normalized 0-1)
                        const boxY = prediction[1]; // center y (normalized 0-1)
                        const boxWidth = prediction[2]; // width (normalized 0-1)
                        const boxHeight = prediction[3]; // height (normalized 0-1)
                        const confidence = prediction[4]; // object confidence
                        
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
                        
                        // Log raw detection data for debugging
                        const combinedScore = confidence * maxClassScore;
                        if (detectedClass >= 0) {
                            const className = this.classNames[detectedClass] || `unknown_${detectedClass}`;
                            
                            // Log all potential detections with scores for debugging
                            const scoreLog = `Potential ${className}: confidence=${confidence.toFixed(3)}, class_score=${maxClassScore.toFixed(3)}, combined=${combinedScore.toFixed(3)}`;
                            
                            if (combinedScore < this.detectionThreshold) {
                                lowConfidenceCount++;
                                this.debugLogger.log(`${scoreLog} (below threshold)`, 'warning');
                            } else {
                                this.debugLogger.log(scoreLog, 'info');
                            }
                        }
                        
                        // Skip low confidence detections
                        if (confidence < this.detectionThreshold) continue;
                        
                        // Check if we have a valid detection
                        if (detectedClass in this.classNames) {
                            // Convert normalized box coordinates (0-1) to pixel coordinates in the model input space
                            const halfW = boxWidth / 2;
                            const halfH = boxHeight / 2;
                            
                            // Get coordinates in the model input space (before applying offsets)
                            let modelX = (boxX - halfW) * this.inputSize;
                            let modelY = (boxY - halfH) * this.inputSize;
                            let modelWidth = boxWidth * this.inputSize;
                            let modelHeight = boxHeight * this.inputSize;
                            
                            // Adjust for the offsets added during image preprocessing
                            // This converts from model input space to the actual image space within the padded input
                            modelX = modelX - offsetX;
                            modelY = modelY - offsetY;
                            
                            // Skip detections that fall outside the valid image area (in padding)
                            if (modelX < -modelWidth/2 || modelY < -modelHeight/2 || 
                                modelX > renderWidth + modelWidth/2 || modelY > renderHeight + modelHeight/2) {
                                this.debugLogger.log(`Detection ${i} (${this.classNames[detectedClass]}) falls in padding area, skipping`, 'warning');
                                continue;
                            }
                            
                            // Scale from the rendered image size to original image size
                            const xScale = originalWidth / renderWidth;
                            const yScale = originalHeight / renderHeight;
                            
                            // Calculate final coordinates in the original image
                            const finalX = modelX * xScale;
                            const finalY = modelY * yScale;
                            const finalWidth = modelWidth * xScale;
                            const finalHeight = modelHeight * yScale;
                            
                            // Add to detections
                            detections.push({
                                class: this.classNames[detectedClass],
                                confidence: confidence * maxClassScore, // Combined score
                                bbox: {
                                    x: Math.max(0, finalX),
                                    y: Math.max(0, finalY),
                                    width: finalWidth,
                                    height: finalHeight
                                }
                            });
                            
                            this.debugLogger.log(`Valid detection ${i}: class=${this.classNames[detectedClass]}, conf=${(confidence * maxClassScore).toFixed(3)}`, 'success');
                        }
                    }
                    
                    if (lowConfidenceCount > 0) {
                        this.debugLogger.log(`Found ${lowConfidenceCount} low-confidence detections below threshold (${this.detectionThreshold})`, 'warning');
                    }
                    
                    return detections;
                } else {
                    this.debugLogger.log('Output array is empty, no predictions available', 'warning');
                }
            } else {
                // Single tensor output
                const predictions = await output.array();
                this.debugLogger.log(`Single tensor output with shape: ${output.shape}`, 'info');
                
                // Similar processing as above...
                // (implementation depends on model output format)
                
                return []; // Placeholder, implement based on model format
            }
        } catch (error) {
            this.debugLogger.log(`Error processing model output: ${error.message}`, 'error');
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
        
        // Log to debug log
        if (detections.length === 0) {
            this.debugLogger.log('No objects detected in the image', 'warning');
        } else {
            const ballCount = detections.filter(d => d.class === 'ball_golf').length;
            const coinCount = detections.filter(d => d.class === 'coin').length;
            
            if (ballCount > 0) {
                this.debugLogger.log(`Drew ${ballCount} golf ball bounding boxes`, 'success');
            }
            if (coinCount > 0) {
                this.debugLogger.log(`Drew ${coinCount} coin bounding boxes`, 'success');
            }
        }
    }
} 