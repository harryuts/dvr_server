import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PERFORMANCE_LOG_FILE = path.join(__dirname, "performance_logs.json");
const MAX_LOG_ENTRIES = 1000; // Keep last 1000 entries

/**
 * Performance Logger for tracking API processing times
 */
class PerformanceLogger {
  constructor() {
    this.activeRequests = new Map();
    this.initLogFile();
  }

  /**
   * Initialize the log file if it doesn't exist
   */
  initLogFile() {
    if (!fs.existsSync(PERFORMANCE_LOG_FILE)) {
      fs.writeFileSync(PERFORMANCE_LOG_FILE, JSON.stringify({ logs: [] }, null, 2));
    }
  }

  /**
   * Start tracking a new request
   * @param {string} requestId - Unique identifier for the request
   * @param {string} endpoint - API endpoint name (getVideo, getLiveVideo, etc.)
   * @param {object} params - Request parameters
   */
  startRequest(requestId, endpoint, params = {}) {
    const requestData = {
      requestId,
      endpoint,
      params,
      startTime: Date.now(),
      steps: [],
      status: "in_progress",
    };
    this.activeRequests.set(requestId, requestData);
    return requestId;
  }

  /**
   * Log a step in the request processing
   * @param {string} requestId - Request identifier
   * @param {string} stepName - Name of the processing step
   * @param {object} metadata - Additional metadata for the step
   */
  logStep(requestId, stepName, metadata = {}) {
    const request = this.activeRequests.get(requestId);
    if (!request) {
      console.warn(`[PerformanceLogger] Request ${requestId} not found`);
      return;
    }

    const step = {
      name: stepName,
      timestamp: Date.now(),
      duration: Date.now() - (request.steps.length > 0 
        ? request.steps[request.steps.length - 1].timestamp 
        : request.startTime),
      metadata,
    };

    request.steps.push(step);
    this.activeRequests.set(requestId, request);
  }

  /**
   * End tracking for a request
   * @param {string} requestId - Request identifier
   * @param {string} status - Final status (success, error)
   * @param {object} result - Final result data
   */
  endRequest(requestId, status = "success", result = {}) {
    const request = this.activeRequests.get(requestId);
    if (!request) {
      console.warn(`[PerformanceLogger] Request ${requestId} not found`);
      return;
    }

    request.endTime = Date.now();
    request.totalDuration = request.endTime - request.startTime;
    request.status = status;
    request.result = result;

    // Write to file
    this.writeToFile(request);

    // Clean up from active requests
    this.activeRequests.delete(requestId);
  }

  /**
   * Write a completed request log to file
   * @param {object} requestData - Completed request data
   */
  writeToFile(requestData) {
    try {
      // Read existing logs
      let logData = { logs: [] };
      if (fs.existsSync(PERFORMANCE_LOG_FILE)) {
        const fileContent = fs.readFileSync(PERFORMANCE_LOG_FILE, "utf8");
        logData = JSON.parse(fileContent);
      }

      // Add new log entry with formatted timestamps
      const logEntry = {
        ...requestData,
        startTimeFormatted: new Date(requestData.startTime).toISOString(),
        endTimeFormatted: new Date(requestData.endTime).toISOString(),
      };

      logData.logs.unshift(logEntry); // Add to beginning

      // Keep only the last MAX_LOG_ENTRIES
      if (logData.logs.length > MAX_LOG_ENTRIES) {
        logData.logs = logData.logs.slice(0, MAX_LOG_ENTRIES);
      }

      // Write back to file
      fs.writeFileSync(PERFORMANCE_LOG_FILE, JSON.stringify(logData, null, 2));
    } catch (error) {
      console.error("[PerformanceLogger] Error writing to file:", error);
    }
  }

  /**
   * Get all logs
   * @param {number} limit - Maximum number of logs to return
   * @param {string} endpoint - Filter by endpoint
   */
  getLogs(limit = 100, endpoint = null) {
    try {
      if (!fs.existsSync(PERFORMANCE_LOG_FILE)) {
        return [];
      }

      const fileContent = fs.readFileSync(PERFORMANCE_LOG_FILE, "utf8");
      const logData = JSON.parse(fileContent);
      
      let logs = logData.logs || [];

      // Filter by endpoint if specified
      if (endpoint) {
        logs = logs.filter(log => log.endpoint === endpoint);
      }

      // Limit results
      return logs.slice(0, limit);
    } catch (error) {
      console.error("[PerformanceLogger] Error reading logs:", error);
      return [];
    }
  }

  /**
   * Get performance statistics
   */
  getStats(endpoint = null) {
    try {
      const logs = this.getLogs(1000, endpoint);
      
      if (logs.length === 0) {
        return null;
      }

      const durations = logs
        .filter(log => log.status === "success")
        .map(log => log.totalDuration);

      if (durations.length === 0) {
        return null;
      }

      durations.sort((a, b) => a - b);

      const stats = {
        totalRequests: logs.length,
        successfulRequests: durations.length,
        failedRequests: logs.filter(log => log.status === "error").length,
        averageDuration: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
        medianDuration: Math.round(durations[Math.floor(durations.length / 2)]),
        minDuration: Math.round(Math.min(...durations)),
        maxDuration: Math.round(Math.max(...durations)),
        p95Duration: Math.round(durations[Math.floor(durations.length * 0.95)]),
      };

      // Calculate average time per step
      const stepStats = {};
      logs.forEach(log => {
        log.steps.forEach(step => {
          if (!stepStats[step.name]) {
            stepStats[step.name] = { total: 0, count: 0, durations: [] };
          }
          stepStats[step.name].total += step.duration;
          stepStats[step.name].count += 1;
          stepStats[step.name].durations.push(step.duration);
        });
      });

      stats.stepAverages = {};
      Object.keys(stepStats).forEach(stepName => {
        const durations = stepStats[stepName].durations.sort((a, b) => a - b);
        stats.stepAverages[stepName] = {
          average: Math.round(stepStats[stepName].total / stepStats[stepName].count),
          count: stepStats[stepName].count,
          median: Math.round(durations[Math.floor(durations.length / 2)]),
          min: Math.round(Math.min(...durations)),
          max: Math.round(Math.max(...durations)),
        };
      });

      return stats;
    } catch (error) {
      console.error("[PerformanceLogger] Error calculating stats:", error);
      return null;
    }
  }

  /**
   * Clear all logs
   */
  clearLogs() {
    try {
      fs.writeFileSync(PERFORMANCE_LOG_FILE, JSON.stringify({ logs: [] }, null, 2));
      return true;
    } catch (error) {
      console.error("[PerformanceLogger] Error clearing logs:", error);
      return false;
    }
  }
}

// Export singleton instance
const performanceLogger = new PerformanceLogger();
export default performanceLogger;

