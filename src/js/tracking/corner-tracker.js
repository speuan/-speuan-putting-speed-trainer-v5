/**
 * Corner Tracker
 * Implements corner detection and tracking for marker points
 */

class CornerTracker {
    constructor() {
        this.markerRegions = [];        // Stored reference regions around each marker
        this.referenceCorners = [];     // Corner features for each region
        this.currentPositions = [];     // Current tracked positions
        this.lastKnownPositions = [];   // Last known good positions
        this.trackingQuality = [];      // Quality scores for each marker
        
        // Configuration
        this.regionSize = 40;           // Size of region to analyze (40x40 pixels)
        this.searchRadius = 30;         // Pixels to search around last position
        this.cornerThreshold = 0.01;    // Threshold for corner detection
        this.matchThreshold = 0.7;      // Minimum correlation for good match
        
        // State
        this.isSetup = false;
        this.setupImageData = null;
        
        console.log('CornerTracker initialized');
    }
    
    /**
     * Setup markers with selected points and current image
     * @param {Array} points - Array of {x, y} points
     * @param {ImageData} imageData - Current frame image data
     */
    setupMarkers(points, imageData) {
        console.log('Setting up markers with points:', points);
        
        if (points.length !== 4) {
            throw new Error('Exactly 4 marker points required');
        }
        
        this.setupImageData = imageData;
        this.markerRegions = [];
        this.referenceCorners = [];
        this.currentPositions = [...points];
        this.lastKnownPositions = [...points];
        this.trackingQuality = [1.0, 1.0, 1.0, 1.0]; // Start with perfect quality
        
        // Extract reference regions and detect corners for each marker
        points.forEach((point, index) => {
            try {
                const region = this.extractRegion(imageData, point.x, point.y);
                const corners = this.detectCorners(region);
                
                this.markerRegions.push(region);
                this.referenceCorners.push(corners);
                
                console.log(`Marker ${index + 1}: Found ${corners.length} corners at (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`);
            } catch (error) {
                console.error(`Error setting up marker ${index + 1}:`, error);
                // Use empty corners as fallback
                this.markerRegions.push(null);
                this.referenceCorners.push([]);
            }
        });
        
        this.isSetup = true;
        console.log('Marker setup complete');
    }
    
    /**
     * Track markers in a new frame
     * @param {ImageData} imageData - New frame image data
     * @returns {Array} Updated positions with quality scores
     */
    trackMarkers(imageData) {
        if (!this.isSetup) {
            console.warn('Markers not set up yet');
            return [];
        }
        
        const results = [];
        
        this.currentPositions.forEach((lastPos, index) => {
            try {
                const result = this.trackSingleMarker(imageData, index, lastPos);
                results.push(result);
                
                // Update positions and quality
                if (result.found) {
                    this.currentPositions[index] = { x: result.x, y: result.y };
                    this.lastKnownPositions[index] = { x: result.x, y: result.y };
                    this.trackingQuality[index] = result.quality;
                } else {
                    // Keep last known position but reduce quality
                    this.trackingQuality[index] *= 0.8;
                }
                
            } catch (error) {
                console.error(`Error tracking marker ${index + 1}:`, error);
                results.push({
                    index: index,
                    found: false,
                    x: lastPos.x,
                    y: lastPos.y,
                    quality: 0
                });
                this.trackingQuality[index] = 0;
            }
        });
        
        return results;
    }
    
    /**
     * Track a single marker
     * @param {ImageData} imageData - Current frame
     * @param {number} markerIndex - Index of marker to track
     * @param {Object} lastPosition - Last known position {x, y}
     * @returns {Object} Tracking result
     */
    trackSingleMarker(imageData, markerIndex, lastPosition) {
        const referenceCorners = this.referenceCorners[markerIndex];
        
        if (!referenceCorners || referenceCorners.length === 0) {
            return {
                index: markerIndex,
                found: false,
                x: lastPosition.x,
                y: lastPosition.y,
                quality: 0
            };
        }
        
        let bestMatch = null;
        let bestScore = 0;
        
        // Search in a grid around the last known position
        const searchStep = 2; // Check every 2 pixels
        const searchRange = this.searchRadius;
        
        for (let dx = -searchRange; dx <= searchRange; dx += searchStep) {
            for (let dy = -searchRange; dy <= searchRange; dy += searchStep) {
                const searchX = lastPosition.x + dx;
                const searchY = lastPosition.y + dy;
                
                // Check bounds
                if (searchX < this.regionSize/2 || searchY < this.regionSize/2 ||
                    searchX >= imageData.width - this.regionSize/2 ||
                    searchY >= imageData.height - this.regionSize/2) {
                    continue;
                }
                
                try {
                    const currentRegion = this.extractRegion(imageData, searchX, searchY);
                    const currentCorners = this.detectCorners(currentRegion);
                    
                    const score = this.matchCorners(referenceCorners, currentCorners);
                    
                    if (score > bestScore && score > this.matchThreshold) {
                        bestScore = score;
                        bestMatch = {
                            x: searchX,
                            y: searchY,
                            quality: score
                        };
                    }
                } catch (error) {
                    // Skip this search position
                    continue;
                }
            }
        }
        
        if (bestMatch) {
            return {
                index: markerIndex,
                found: true,
                x: bestMatch.x,
                y: bestMatch.y,
                quality: bestMatch.quality
            };
        } else {
            return {
                index: markerIndex,
                found: false,
                x: lastPosition.x,
                y: lastPosition.y,
                quality: 0
            };
        }
    }
    
    /**
     * Extract a region around a point
     * @param {ImageData} imageData - Source image
     * @param {number} centerX - Center X coordinate
     * @param {number} centerY - Center Y coordinate
     * @returns {ImageData} Extracted region
     */
    extractRegion(imageData, centerX, centerY) {
        const halfSize = Math.floor(this.regionSize / 2);
        const startX = Math.max(0, centerX - halfSize);
        const startY = Math.max(0, centerY - halfSize);
        const endX = Math.min(imageData.width, centerX + halfSize);
        const endY = Math.min(imageData.height, centerY + halfSize);
        
        const regionWidth = endX - startX;
        const regionHeight = endY - startY;
        
        // Create new ImageData for the region
        const regionData = new ImageData(regionWidth, regionHeight);
        
        // Copy pixels from source to region
        for (let y = 0; y < regionHeight; y++) {
            for (let x = 0; x < regionWidth; x++) {
                const srcIndex = ((startY + y) * imageData.width + (startX + x)) * 4;
                const dstIndex = (y * regionWidth + x) * 4;
                
                regionData.data[dstIndex] = imageData.data[srcIndex];         // R
                regionData.data[dstIndex + 1] = imageData.data[srcIndex + 1]; // G
                regionData.data[dstIndex + 2] = imageData.data[srcIndex + 2]; // B
                regionData.data[dstIndex + 3] = imageData.data[srcIndex + 3]; // A
            }
        }
        
        return regionData;
    }
    
    /**
     * Detect corners in a region using simplified Harris corner detection
     * @param {ImageData} regionData - Region to analyze
     * @returns {Array} Array of corner points {x, y, strength}
     */
    detectCorners(regionData) {
        if (!regionData || regionData.width < 3 || regionData.height < 3) {
            return [];
        }
        
        const width = regionData.width;
        const height = regionData.height;
        const corners = [];
        
        // Convert to grayscale
        const gray = new Float32Array(width * height);
        for (let i = 0; i < width * height; i++) {
            const r = regionData.data[i * 4];
            const g = regionData.data[i * 4 + 1];
            const b = regionData.data[i * 4 + 2];
            gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
        }
        
        // Calculate gradients (simplified Sobel)
        const gradX = new Float32Array(width * height);
        const gradY = new Float32Array(width * height);
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                
                // Sobel X gradient
                gradX[idx] = (
                    -gray[(y-1) * width + (x-1)] + gray[(y-1) * width + (x+1)] +
                    -2 * gray[y * width + (x-1)] + 2 * gray[y * width + (x+1)] +
                    -gray[(y+1) * width + (x-1)] + gray[(y+1) * width + (x+1)]
                ) / 8.0;
                
                // Sobel Y gradient
                gradY[idx] = (
                    -gray[(y-1) * width + (x-1)] - 2 * gray[(y-1) * width + x] - gray[(y-1) * width + (x+1)] +
                    gray[(y+1) * width + (x-1)] + 2 * gray[(y+1) * width + x] + gray[(y+1) * width + (x+1)]
                ) / 8.0;
            }
        }
        
        // Calculate corner response (simplified Harris)
        for (let y = 2; y < height - 2; y++) {
            for (let x = 2; x < width - 2; x++) {
                let Ixx = 0, Iyy = 0, Ixy = 0;
                
                // Sum over 3x3 window
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const idx = (y + dy) * width + (x + dx);
                        const gx = gradX[idx];
                        const gy = gradY[idx];
                        
                        Ixx += gx * gx;
                        Iyy += gy * gy;
                        Ixy += gx * gy;
                    }
                }
                
                // Harris corner response
                const det = Ixx * Iyy - Ixy * Ixy;
                const trace = Ixx + Iyy;
                const response = det - 0.04 * trace * trace;
                
                if (response > this.cornerThreshold) {
                    corners.push({
                        x: x,
                        y: y,
                        strength: response
                    });
                }
            }
        }
        
        // Sort by strength and keep top corners
        corners.sort((a, b) => b.strength - a.strength);
        return corners.slice(0, 20); // Keep top 20 corners
    }
    
    /**
     * Match corner patterns between reference and current
     * @param {Array} referenceCorners - Reference corner pattern
     * @param {Array} currentCorners - Current corner pattern
     * @returns {number} Match score (0-1)
     */
    matchCorners(referenceCorners, currentCorners) {
        if (referenceCorners.length === 0 || currentCorners.length === 0) {
            return 0;
        }
        
        let totalScore = 0;
        let matchCount = 0;
        
        // For each reference corner, find the closest current corner
        referenceCorners.forEach(refCorner => {
            let bestDistance = Infinity;
            let bestMatch = null;
            
            currentCorners.forEach(curCorner => {
                const dx = refCorner.x - curCorner.x;
                const dy = refCorner.y - curCorner.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestMatch = curCorner;
                }
            });
            
            if (bestMatch && bestDistance < 5) { // Within 5 pixels
                const score = Math.exp(-bestDistance / 2); // Exponential decay
                totalScore += score;
                matchCount++;
            }
        });
        
        return matchCount > 0 ? totalScore / referenceCorners.length : 0;
    }
    
    /**
     * Draw tracking indicators on canvas
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    drawTrackingIndicators(ctx) {
        if (!this.isSetup) return;
        
        const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'];
        const labels = ['1', '2', '3', '4'];
        
        this.currentPositions.forEach((pos, index) => {
            const quality = this.trackingQuality[index];
            const color = colors[index];
            
            // Draw circle with quality-based opacity
            ctx.save();
            ctx.globalAlpha = Math.max(0.3, quality);
            
            // Outer circle
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 12, 0, 2 * Math.PI);
            ctx.strokeStyle = color;
            ctx.lineWidth = quality > 0.5 ? 3 : 2;
            ctx.stroke();
            
            // Inner filled circle
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
            
            // Label
            ctx.fillStyle = 'white';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labels[index], pos.x, pos.y);
            
            // Quality indicator (small bar)
            if (quality < 1.0) {
                const barWidth = 20;
                const barHeight = 3;
                const barX = pos.x - barWidth / 2;
                const barY = pos.y + 18;
                
                // Background
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillRect(barX, barY, barWidth, barHeight);
                
                // Quality bar
                ctx.fillStyle = quality > 0.7 ? '#00FF00' : quality > 0.3 ? '#FFFF00' : '#FF0000';
                ctx.fillRect(barX, barY, barWidth * quality, barHeight);
            }
            
            ctx.restore();
        });
    }
    
    /**
     * Get current marker positions
     * @returns {Array} Array of {x, y} positions
     */
    getCurrentPositions() {
        return [...this.currentPositions];
    }
    
    /**
     * Get tracking quality scores
     * @returns {Array} Array of quality scores (0-1)
     */
    getTrackingQuality() {
        return [...this.trackingQuality];
    }
    
    /**
     * Check if tracking is active
     * @returns {boolean}
     */
    isTracking() {
        return this.isSetup;
    }
    
    /**
     * Reset tracking
     */
    reset() {
        this.isSetup = false;
        this.markerRegions = [];
        this.referenceCorners = [];
        this.currentPositions = [];
        this.lastKnownPositions = [];
        this.trackingQuality = [];
        this.setupImageData = null;
        console.log('Corner tracking reset');
    }
} 