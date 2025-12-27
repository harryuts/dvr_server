const ffmpegProcesses = new Map();
const processLogs = new Map();
const sessionStreams = new Map(); // Track active streams per session: sessionId -> Set of PIDs
const MAX_LOG_LINES = 100;

export function registerFFmpegProcess(pid, context, command, processInstance, sessionId = null) {
    ffmpegProcesses.set(pid, {
        pid,
        context, // e.g., 'schedule_recording', 'get_video', 'get_picture', 'stream_standard', 'stream_dahua'
        startTime: new Date(),
        command,
        sessionId, // Track which session owns this process
    });
    
    // Track streaming processes per session
    if (sessionId && (context === 'stream_standard' || context === 'stream_dahua')) {
        if (!sessionStreams.has(sessionId)) {
            sessionStreams.set(sessionId, new Set());
        }
        sessionStreams.get(sessionId).add(pid);
    }

    // Initialize logs
    processLogs.set(pid, []);

    // Capture logs
    if (processInstance) {
        // Capture stderr (FFmpeg usually writes status/errors here)
        if (processInstance.stderr) {
            processInstance.stderr.on('data', (data) => {
                addLog(pid, data.toString().trim());
            });
        }

        // Attempt stdout if available
        if (processInstance.stdout) {
            processInstance.stdout.on('data', (data) => {
                addLog(pid, data.toString().trim());
            });
        }
    }
}

function addLog(pid, message) {
    if (!message) return;
    const logs = processLogs.get(pid);
    if (!logs) return;

    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}`;

    logs.push(logLine);
    if (logs.length > MAX_LOG_LINES) {
        logs.shift();
    }
}

export function unregisterFFmpegProcess(pid) {
    // Guard against null/undefined PID
    if (pid === null || pid === undefined) {
        console.warn(`[ffmpegRegistry] Attempted to unregister process with null/undefined PID`);
        return;
    }
    
    const process = ffmpegProcesses.get(pid);
    if (process) {
        // Remove from session tracking if it's a stream
        if (process.sessionId && (process.context === 'stream_standard' || process.context === 'stream_dahua')) {
            const sessionPids = sessionStreams.get(process.sessionId);
            if (sessionPids) {
                sessionPids.delete(pid);
                if (sessionPids.size === 0) {
                    sessionStreams.delete(process.sessionId);
                }
            }
        }
        ffmpegProcesses.delete(pid);
    }
    if (processLogs.has(pid)) {
        processLogs.delete(pid);
    }
    removeProcessInstance(pid);
}

// Kill all active streams for a session
export function killSessionStreams(sessionId) {
    const sessionPids = sessionStreams.get(sessionId);
    if (!sessionPids || sessionPids.size === 0) {
        return [];
    }
    
    const killedPids = [];
    const pidsToKill = Array.from(sessionPids);
    
    console.log(`[ffmpegRegistry] Killing ${pidsToKill.length} active stream(s) for session ${sessionId}`);
    
    for (const pid of pidsToKill) {
        const process = ffmpegProcesses.get(pid);
        if (process && (process.context === 'stream_standard' || process.context === 'stream_dahua')) {
            try {
                const processInstance = processInstances.get(pid);
                if (processInstance && !processInstance.killed) {
                    console.log(`[ffmpegRegistry] Killing stream process ${pid} for session ${sessionId}`);
                    processInstance.kill('SIGKILL'); // Force kill immediately
                    killedPids.push(pid);
                }
                // Clean up registry entries
                unregisterFFmpegProcess(pid);
                removeProcessInstance(pid);
            } catch (err) {
                console.error(`[ffmpegRegistry] Error killing process ${pid}:`, err);
                // Still try to clean up even if kill failed
                unregisterFFmpegProcess(pid);
                removeProcessInstance(pid);
            }
        }
    }
    
    // Clear the session streams map
    sessionStreams.delete(sessionId);
    
    return killedPids;
}

// Get process instance by PID (we need to store these)
const processInstances = new Map();

export function storeProcessInstance(pid, processInstance) {
    processInstances.set(pid, processInstance);
}

export function getProcessInstance(pid) {
    return processInstances.get(pid);
}

export function removeProcessInstance(pid) {
    processInstances.delete(pid);
}

export function getAllFFmpegProcesses() {
    const now = new Date();
    return Array.from(ffmpegProcesses.values()).map(proc => ({
        ...proc,
        uptime: calculateUptime(proc.startTime, now),
        startTimeISO: proc.startTime.toISOString(),
    }));
}

export function getProcessLogs(pid) {
    return processLogs.get(parseInt(pid)) || [];
}

function calculateUptime(startTime, now) {
    const diff = now.getTime() - startTime.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const formatTwoDigits = (num) => num.toString().padStart(2, '0');
    return `${days > 0 ? days + 'd ' : ''}${formatTwoDigits(hours % 24)}:${formatTwoDigits(minutes % 60)}:${formatTwoDigits(seconds % 60)}`;
}
