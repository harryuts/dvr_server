# Performance Logging System

This document describes the performance logging system implemented for tracking video processing API performance.

## Overview

The performance logging system tracks the execution time of each step in the `getVideo` and `getLiveVideo` API endpoints, allowing you to identify bottlenecks in video processing.

## Backend Components

### 1. Performance Logger (`performanceLogger.js`)

A singleton module that tracks request performance:

- **`startRequest(requestId, endpoint, params)`** - Begins tracking a request
- **`logStep(requestId, stepName, metadata)`** - Logs a processing step with timing
- **`endRequest(requestId, status, result)`** - Completes tracking and saves to file
- **`getLogs(limit, endpoint)`** - Retrieves performance logs
- **`getStats(endpoint)`** - Calculates performance statistics
- **`clearLogs()`** - Clears all logs

Logs are stored in `performance_logs.json` (max 1000 entries).

### 2. API Endpoints (`routes/logs_api.js`)

- **GET `/api/logs`** - Fetch performance logs
  - Query params: `limit` (default: 100), `endpoint` (optional filter)
  
- **GET `/api/logs/stats`** - Get performance statistics
  - Query params: `endpoint` (optional filter)
  
- **DELETE `/api/logs`** - Clear all performance logs

### 3. Instrumented Functions

Both `getVideo` and `getLiveVideo` functions in `processVideo.js` now track:

1. Get recording configurations
2. Database queries
3. Partial segment extraction
4. FFmpeg operations (download, trim, concatenation)
5. File validation
6. Evidence storage

Each step is logged with:
- Step name
- Duration (milliseconds)
- Metadata (file counts, sizes, errors, etc.)

## Frontend Component

### Video Processing Tab (`VideoProcessingTab.tsx`)

Located in Settings > Logs tab, displays:

#### Statistics Cards
- Total requests (successful/failed)
- Average duration
- Min/Max duration
- 95th percentile

#### Step Performance Breakdown
- Average time per processing step
- Identifies slowest operations

#### Logs Table
- Timestamp
- Endpoint (getVideo/getLiveVideo)
- Channel number
- Total duration
- Status (success/error)
- Number of steps
- Detailed view button

#### Log Details Dialog
- Complete request parameters
- Step-by-step timing breakdown
- Metadata for each step
- Final result

## Usage

### Viewing Logs

1. Navigate to **Settings > Logs** in the web interface
2. Use the filter dropdown to view specific endpoints
3. Click the info icon on any log entry to see detailed breakdown
4. Click "Refresh" to update the data
5. Click "Clear Logs" to delete all performance data

### Identifying Bottlenecks

1. Check the **Step Performance Breakdown** section
2. Steps are sorted by average duration (slowest first)
3. Look for steps with high average times:
   - **FFmpeg download** - Network/NVR speed issues
   - **FFmpeg concatenation** - Large file processing
   - **Trim operations** - File I/O performance
   - **Database queries** - Database optimization needed

### Example Bottleneck Analysis

If you see:
```
FFmpeg download - complete: Average 15,000ms
Database query complete: Average 50ms
FFmpeg concatenation - complete: Average 8,000ms
```

This indicates:
- Network/NVR download is the primary bottleneck (15s)
- Database performance is good (50ms)
- Concatenation is secondary bottleneck (8s)

## Performance Tips

1. **Slow Downloads**: Check network connection to NVR/cameras
2. **Slow Concatenation**: Consider faster storage (SSD)
3. **Slow Database**: Add indexes, optimize queries
4. **Slow Trimming**: Check disk I/O performance

## Log File Location

Backend logs: `performance_logs.json` in the server root directory

## Configuration

To change the maximum number of log entries, edit `performanceLogger.js`:

```javascript
const MAX_LOG_ENTRIES = 1000; // Change this value
```

## API Authentication

All log endpoints require session authentication (same as other API endpoints).

