const ffmpegProcesses = new Map();
const processLogs = new Map();
const MAX_LOG_LINES = 100;

export function registerFFmpegProcess(pid, context, command, processInstance) {
    ffmpegProcesses.set(pid, {
        pid,
        context, // e.g., 'schedule_recording', 'get_video', 'get_picture'
        startTime: new Date(),
        command,
    });

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
    if (ffmpegProcesses.has(pid)) {
        ffmpegProcesses.delete(pid);
    }
    if (processLogs.has(pid)) {
        processLogs.delete(pid);
    }
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
