/**
 * Corner Tracker
 * Implements corner detection and tracking for marker points
 */

class CornerTracker {
    constructor(debugMode = true) {
        this.markerRegions = [];        // Stored reference regions around each marker
        this.referenceCorners = [];     // Corner features for each region
        this.currentPositions = [];     // Current tracked positions
        this.lastKnownPositions = [];   // Last known good positions
        this.trackingQuality = [];      // Quality scores for each marker
        
        // Tuned configuration
        this.regionSize = 120;           // Even larger region
        this.searchRadius = 50;          // Larger search area
        this.cornerThreshold = 0.0001;   // Even lower threshold
        this.matchThreshold = 0.4;       // Lower match threshold
        
        // Debug
        this.debugMode = debugMode;
        this.lastDebugCorners = [];
        this.lastDebugRegions = [];
        
        // State
        this.isSetup = false;
        this.setupImageData = null;
        
        console.log('CornerTracker initialized (debugMode:', debugMode, ')');
    }
    
    /**
     * Setup markers with selected points and current image
     * @param {Array} points - Array of {x, y} points
     * @param {ImageData} imageData - Current frame image data
     */
    setupMarkers(points, imageData) {
        console.log('Setting up marker with point:', points);
        if (points.length !== 1) {
            throw new Error('Exactly 1 marker point required');
        }
        this.setupImageData = imageData;
        this.markerRegions = [];
        this.referenceCorners = [];
        this.currentPositions = [...points];
        this.lastKnownPositions = [...points];
        this.trackingQuality = [1.0];
        this.lastDebugRegions = [];
        // Extract reference region and detect corners for the marker
        const point = points[0];
        try {
            const region = this.extractRegion(imageData, point.x, point.y);
            const corners = this.detectCorners(region);
            this.markerRegions.push(region);
            this.referenceCorners.push(corners);
            if (this.debugMode) {
                this.lastDebugRegions.push({
                    x: point.x,
                    y: point.y,
                    w: region.width,
                    h: region.height
                });
            }
            console.log(`Marker: Found ${corners.length} corners at (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`);
        } catch (error) {
            console.error('Error setting up marker:', error);
            this.markerRegions.push(null);
            this.referenceCorners.push([]);
        }
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
            console.warn('Marker not set up yet');
            return [];
        }
        const results = [];
        const lastPos = this.currentPositions[0];
        try {
            const result = this.trackSingleMarker(imageData, 0, lastPos);
            results.push(result);
            if (result.found) {
                this.currentPositions[0] = { x: result.x, y: result.y };
                this.lastKnownPositions[0] = { x: result.x, y: result.y };
                this.trackingQuality[0] = result.quality;
            } else {
                this.trackingQuality[0] *= 0.8;
            }
        } catch (error) {
            console.error('Error tracking marker:', error);
            results.push({
                index: 0,
                found: false,
                x: lastPos.x,
                y: lastPos.y,
                quality: 0
            });
            this.trackingQuality[0] = 0;
        }
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
        try {
            const currentRegion = this.extractRegion(imageData, lastPosition.x, lastPosition.y);
            const currentCorners = this.detectCorners(currentRegion);
            const score = this.matchCorners(referenceCorners, currentCorners);
            console.log(`[trackSingleMarker] Last pos: (${lastPosition.x.toFixed(1)}, ${lastPosition.y.toFixed(1)}), Score: ${score}`);
            if (score > this.matchThreshold) {
                // For now, just return the same position (no search).
                // In a real tracker, you'd search nearby for the best match.
                console.log(`[trackSingleMarker] Marker FOUND at (${lastPosition.x.toFixed(1)}, ${lastPosition.y.toFixed(1)}) with quality ${score}`);
                return {
                    index: markerIndex,
                    found: true,
                    x: lastPosition.x,
                    y: lastPosition.y,
                    quality: score
                };
            } else {
                console.log(`[trackSingleMarker] Marker NOT found, keeping last position (${lastPosition.x.toFixed(1)}, ${lastPosition.y.toFixed(1)}) with quality ${score}`);
                return {
                    index: markerIndex,
                    found: false,
                    x: lastPosition.x,
                    y: lastPosition.y,
                    quality: score
                };
            }
        } catch (error) {
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
        const startX = Math.max(0, Math.round(centerX - halfSize));
        const startY = Math.max(0, Math.round(centerY - halfSize));
        const endX = Math.min(imageData.width, Math.round(centerX + halfSize));
        const endY = Math.min(imageData.height, Math.round(centerY + halfSize));

        const regionWidth = endX - startX;
        const regionHeight = endY - startY;

        // Log extraction coordinates for debugging
        if (this.debugMode) {
            console.log(`Extracting region: center=(${centerX.toFixed(1)},${centerY.toFixed(1)}), start=(${startX},${startY}), size=(${regionWidth}x${regionHeight}), imageData=(${imageData.width}x${imageData.height})`);
        }

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
     * Detect corners in a region using a simple FAST-like detector
     * @param {ImageData} regionData - Region to analyze
     * @returns {Array} Array of corner points {x, y, strength}
     */
    detectCorners(regionData) {
        if (!regionData || regionData.width < 7 || regionData.height < 7) {
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

        // FAST circle offsets (16 pixels around a circle of radius 3)
        const circle = [
            [0, -3], [1, -3], [2, -2], [3, -1], [3, 0], [3, 1], [2, 2], [1, 3],
            [0, 3], [-1, 3], [-2, 2], [-3, 1], [-3, 0], [-3, -1], [-2, -2], [-1, -3]
        ];
        const N = 16;
        const threshold = 20; // Intensity difference threshold
        const contiguous = 9; // Number of contiguous pixels required

        for (let y = 3; y < height - 3; y++) {
            for (let x = 3; x < width - 3; x++) {
                const centerIdx = y * width + x;
                const centerVal = gray[centerIdx];
                let brighter = 0, darker = 0, maxBright = 0, maxDark = 0;

                // Check circle
                for (let i = 0; i < N; i++) {
                    const [dx, dy] = circle[i];
                    const idx = (y + dy) * width + (x + dx);
                    const val = gray[idx];
                    if (val - centerVal > threshold) {
                        brighter++;
                        maxBright = Math.max(maxBright, val - centerVal);
                        darker = 0;
                    } else if (centerVal - val > threshold) {
                        darker++;
                        maxDark = Math.max(maxDark, centerVal - val);
                        brighter = 0;
                    } else {
                        brighter = 0;
                        darker = 0;
                    }
                    if (brighter >= contiguous || darker >= contiguous) {
                        corners.push({ x, y, strength: Math.max(maxBright, maxDark) });
                        break;
                    }
                }
            }
        }

        // Debug: store corners for visualization
        if (this.debugMode) {
            this.lastDebugCorners = corners.slice(0, 100);
        }

        // Sort by strength and keep top corners
        corners.sort((a, b) => b.strength - a.strength);
        return corners.slice(0, 20);
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
     * Draw tracking indicators on canvas (with debug corners if enabled)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    drawTrackingIndicators(ctx) {
        if (!this.isSetup) return;
        const color = '#FF0000';
        // Debug: draw region boundary
        if (this.debugMode && this.lastDebugRegions && this.lastDebugRegions.length > 0) {
            ctx.save();
            ctx.globalAlpha = 0.5;
            const region = this.lastDebugRegions[0];
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(
                region.x - region.w / 2,
                region.y - region.h / 2,
                region.w,
                region.h
            );
            ctx.restore();
        }
        // Debug: draw color region of marker in top-left corner
        if (this.debugMode && this.markerRegions && this.markerRegions[0]) {
            const region = this.markerRegions[0];
            ctx.putImageData(region, 10, 10);
            ctx.save();
            ctx.strokeStyle = '#00FFFF';
            ctx.lineWidth = 2;
            ctx.strokeRect(10, 10, region.width, region.height);
            ctx.restore();
        }
        const pos = this.currentPositions[0];
        const quality = this.trackingQuality[0];
        ctx.save();
        ctx.globalAlpha = Math.max(0.3, quality);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 18, 0, 2 * Math.PI);
        ctx.strokeStyle = color;
        ctx.lineWidth = quality > 0.5 ? 3 : 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 8, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('1', pos.x, pos.y);
        // Draw quality bar
        if (quality < 1.0) {
            const barWidth = 28;
            const barHeight = 4;
            const barX = pos.x - barWidth / 2;
            const barY = pos.y + 22;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = quality > 0.7 ? '#00FF00' : quality > 0.3 ? '#FFFF00' : '#FF0000';
            ctx.fillRect(barX, barY, barWidth * quality, barHeight);
        }
        ctx.restore();
        // Debug: draw detected corners
        if (this.debugMode && this.lastDebugCorners && this.lastDebugCorners.length > 0) {
            ctx.save();
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = '#00FFFF';
            this.lastDebugCorners.forEach(corner => {
                ctx.beginPath();
                ctx.arc(corner.x, corner.y, 3, 0, 2 * Math.PI);
                ctx.fill();
            });
            ctx.restore();
        }
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