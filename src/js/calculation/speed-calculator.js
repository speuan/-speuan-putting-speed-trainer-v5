/**
 * Speed Calculator
 * Calculates the speed of a golf ball based on frame data
 */

class SpeedCalculator {
    constructor() {
        // Default pixel-to-cm ratio (will be adjusted during calibration)
        this.PIXEL_TO_CM_RATIO = 0.1; // 1 pixel = 0.1 cm by default
        
        // Default US quarter diameter in cm (for calibration)
        this.COIN_DIAMETER_CM = 2.4;
        
        this.calibrated = false;
    }
    
    /**
     * Set calibration based on a detected coin
     * @param {number} coinDiameterInPixels - Diameter of the calibration coin in pixels
     * @param {number} coinDiameterInCm - Actual diameter of the coin in cm
     */
    setCalibration(coinDiameterInPixels, coinDiameterInCm = this.COIN_DIAMETER_CM) {
        if (coinDiameterInPixels <= 0) {
            throw new Error('Coin diameter must be greater than zero');
        }
        
        this.PIXEL_TO_CM_RATIO = coinDiameterInCm / coinDiameterInPixels;
        this.calibrated = true;
        
        console.log(`Calibration set: 1 pixel = ${this.PIXEL_TO_CM_RATIO.toFixed(4)} cm`);
    }
    
    /**
     * Calculate the speed of the ball from captured frames
     * @param {Array} frames - Array of frame data objects with positions and timestamps
     * @returns {number} - Speed in meters per second
     */
    calculateSpeed(frames) {
        if (!frames || frames.length < 2) {
            console.warn('Insufficient frame data to calculate speed');
            return 0;
        }
        
        // Extract positions from frames where ball was detected
        const positions = [];
        
        for (const frame of frames) {
            // For now, we assume the position is already extracted
            // In a real implementation, this would come from the ball detector
            if (frame.ballPosition) {
                positions.push({
                    x: frame.ballPosition.x,
                    y: frame.ballPosition.y,
                    timestamp: frame.timestamp
                });
            }
        }
        
        // If we don't have enough positions, return placeholder value
        if (positions.length < 2) {
            console.warn('Ball not detected in enough frames');
            // Return a simulated speed for demonstration
            return this.getSimulatedSpeed();
        }
        
        // Calculate speed based on the first and last detected positions
        const firstPosition = positions[0];
        const lastPosition = positions[positions.length - 1];
        
        // Calculate distance in pixels
        const distancePixels = this.calculateDistance(
            firstPosition.x, firstPosition.y,
            lastPosition.x, lastPosition.y
        );
        
        // Convert to cm using calibration ratio
        const distanceCm = distancePixels * this.PIXEL_TO_CM_RATIO;
        
        // Calculate time difference in seconds
        const timeDiffMs = lastPosition.timestamp - firstPosition.timestamp;
        const timeDiffSec = timeDiffMs / 1000;
        
        if (timeDiffSec <= 0) {
            console.warn('Invalid time difference');
            return 0;
        }
        
        // Calculate speed in cm/s
        const speedCmPerSec = distanceCm / timeDiffSec;
        
        // Convert to m/s
        const speedMPerSec = speedCmPerSec / 100;
        
        return speedMPerSec;
    }
    
    /**
     * Calculate Euclidean distance between two points
     * @param {number} x1 - First point x coordinate
     * @param {number} y1 - First point y coordinate
     * @param {number} x2 - Second point x coordinate
     * @param {number} y2 - Second point y coordinate
     * @returns {number} - Distance in pixels
     */
    calculateDistance(x1, y1, x2, y2) {
        return Math.sqrt(
            Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)
        );
    }
    
    /**
     * Get a simulated speed for demonstration purposes
     * @returns {number} - Simulated speed in m/s
     */
    getSimulatedSpeed() {
        // Generate random speed between 1-3 m/s (typical putting speeds)
        return 1 + Math.random() * 2;
    }
} 