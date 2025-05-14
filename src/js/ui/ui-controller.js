/**
 * UI Controller
 * Manages UI interactions and display
 */

class UIController {
    constructor() {
        this.displayCanvas = document.getElementById('display-canvas');
        this.trajectoryCanvas = document.getElementById('trajectory-canvas');
        this.resultsContainer = document.querySelector('.results-container');
        this.cameraContainer = document.querySelector('.camera-container');
        this.speedValueElement = document.getElementById('speed-value');
        
        this.displayContext = this.displayCanvas.getContext('2d');
        this.trajectoryContext = this.trajectoryCanvas.getContext('2d');
        
        this.ballPositions = [];
    }
    
    /**
     * Draw ball position on the display canvas
     * @param {Object} position - {x, y} coordinates of the ball
     */
    drawBallPosition(position) {
        // Store position for trajectory
        this.ballPositions.push(position);
        
        // Draw circle at ball position
        this.displayContext.beginPath();
        this.displayContext.arc(position.x, position.y, 10, 0, Math.PI * 2);
        this.displayContext.fillStyle = 'rgba(255, 0, 0, 0.5)';
        this.displayContext.fill();
        
        // Draw path if we have multiple positions
        if (this.ballPositions.length > 1) {
            this.displayContext.beginPath();
            this.displayContext.moveTo(this.ballPositions[0].x, this.ballPositions[0].y);
            
            for (let i = 1; i < this.ballPositions.length; i++) {
                this.displayContext.lineTo(this.ballPositions[i].x, this.ballPositions[i].y);
            }
            
            this.displayContext.strokeStyle = 'yellow';
            this.displayContext.lineWidth = 2;
            this.displayContext.stroke();
        }
    }
    
    /**
     * Show results UI with speed and trajectory
     * @param {number} speed - Calculated speed in m/s
     * @param {Array} frames - Array of captured frames
     */
    showResults(speed, frames) {
        // Update speed display
        this.speedValueElement.textContent = speed.toFixed(2);
        
        // Draw trajectory on the trajectory canvas
        this.drawTrajectory();
        
        // Show results container, hide camera
        this.resultsContainer.style.display = 'block';
    }
    
    /**
     * Draw the ball trajectory on the trajectory canvas
     */
    drawTrajectory() {
        // Clear canvas
        this.trajectoryContext.clearRect(0, 0, this.trajectoryCanvas.width, this.trajectoryCanvas.height);
        
        if (this.ballPositions.length < 2) return;
        
        // Find min/max x,y to scale the trajectory to fit the canvas
        const xValues = this.ballPositions.map(p => p.x);
        const yValues = this.ballPositions.map(p => p.y);
        
        const minX = Math.min(...xValues);
        const maxX = Math.max(...xValues);
        const minY = Math.min(...yValues);
        const maxY = Math.max(...yValues);
        
        const xRange = maxX - minX;
        const yRange = maxY - minY;
        
        const canvasWidth = this.trajectoryCanvas.width;
        const canvasHeight = this.trajectoryCanvas.height;
        
        // Calculate scaling factors
        const xScale = canvasWidth / (xRange || 1); // Avoid division by zero
        const yScale = canvasHeight / (yRange || 1);
        const scale = Math.min(xScale, yScale) * 0.9; // 90% to leave margin
        
        // Calculate offset to center the trajectory
        const xOffset = (canvasWidth - xRange * scale) / 2;
        const yOffset = (canvasHeight - yRange * scale) / 2;
        
        // Draw trajectory path
        this.trajectoryContext.beginPath();
        
        // Map first point
        const firstPoint = this.ballPositions[0];
        const startX = (firstPoint.x - minX) * scale + xOffset;
        const startY = (firstPoint.y - minY) * scale + yOffset;
        this.trajectoryContext.moveTo(startX, startY);
        
        // Map remaining points and draw line
        for (let i = 1; i < this.ballPositions.length; i++) {
            const point = this.ballPositions[i];
            const x = (point.x - minX) * scale + xOffset;
            const y = (point.y - minY) * scale + yOffset;
            this.trajectoryContext.lineTo(x, y);
        }
        
        this.trajectoryContext.strokeStyle = 'green';
        this.trajectoryContext.lineWidth = 3;
        this.trajectoryContext.stroke();
        
        // Draw start and end points
        const lastPoint = this.ballPositions[this.ballPositions.length - 1];
        const endX = (lastPoint.x - minX) * scale + xOffset;
        const endY = (lastPoint.y - minY) * scale + yOffset;
        
        // Start point (blue)
        this.trajectoryContext.beginPath();
        this.trajectoryContext.arc(startX, startY, 5, 0, Math.PI * 2);
        this.trajectoryContext.fillStyle = 'blue';
        this.trajectoryContext.fill();
        
        // End point (red)
        this.trajectoryContext.beginPath();
        this.trajectoryContext.arc(endX, endY, 5, 0, Math.PI * 2);
        this.trajectoryContext.fillStyle = 'red';
        this.trajectoryContext.fill();
    }
    
    /**
     * Reset the UI to initial state
     */
    resetUI() {
        // Clear canvases
        this.displayContext.clearRect(0, 0, this.displayCanvas.width, this.displayCanvas.height);
        this.trajectoryContext.clearRect(0, 0, this.trajectoryCanvas.width, this.trajectoryCanvas.height);
        
        // Reset data
        this.ballPositions = [];
        this.speedValueElement.textContent = '-';
        
        // Show camera, hide results
        this.resultsContainer.style.display = 'none';
    }
    
    /**
     * Enter calibration mode
     */
    enterCalibrationMode() {
        // Add calibration overlay
        const overlay = document.createElement('div');
        overlay.id = 'calibration-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'rgba(0, 0, 255, 0.2)';
        overlay.style.zIndex = '10';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        
        const message = document.createElement('div');
        message.textContent = 'Place a coin on the surface for calibration';
        message.style.background = 'white';
        message.style.padding = '10px';
        message.style.borderRadius = '5px';
        
        overlay.appendChild(message);
        this.cameraContainer.appendChild(overlay);
    }
    
    /**
     * Exit calibration mode
     */
    exitCalibrationMode() {
        const overlay = document.getElementById('calibration-overlay');
        if (overlay) {
            overlay.remove();
        }
    }
} 