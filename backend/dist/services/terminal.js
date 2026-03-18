"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeTerminalService = initializeTerminalService;
exports.getActiveSessionCount = getActiveSessionCount;
exports.cleanupTerminals = cleanupTerminals;
const dockerode_1 = __importDefault(require("dockerode"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
const container_1 = require("./container");
const git_1 = require("./git");
// Auto-detect Docker socket (Docker Desktop uses a different path on Linux)
function getDockerSocket() {
    const homeDir = os_1.default.homedir();
    const desktopSocket = path_1.default.join(homeDir, '.docker/desktop/docker.sock');
    if (fs_1.default.existsSync(desktopSocket)) {
        return desktopSocket;
    }
    // Check for Windows named pipe
    if (os_1.default.platform() === 'win32') {
        return '//./pipe/docker_engine';
    }
    return '/var/run/docker.sock';
}
const docker = new dockerode_1.default({ socketPath: getDockerSocket() });
const sessions = new Map();
function initializeTerminalService(io) {
    // Middleware to authenticate socket connections
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) {
                return next(new Error('Authentication required'));
            }
            // Verify token with Supabase
            const { supabaseAdmin } = await import('../lib/supabase.js');
            const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
            if (error || !user) {
                return next(new Error('Invalid token'));
            }
            // Attach user to socket
            socket.data.userId = user.id;
            next();
        }
        catch (error) {
            next(new Error('Authentication failed'));
        }
    });
    io.on('connection', (socket) => {
        console.log('Terminal socket connected:', socket.id);
        socket.on('terminal:create', async (data) => {
            try {
                // Get user info from socket data (set by middleware)
                const userId = socket.data.userId;
                const projectId = data.projectId;
                if (!projectId) {
                    socket.emit('terminal:error', { message: 'Project ID required' });
                    return;
                }
                console.log(`Creating terminal for user ${userId}, project ${projectId}`);
                // Get project path and environment
                const projectPath = (0, git_1.getProjectPath)(userId, projectId);
                console.log(`Project path: ${projectPath}`);
                // Verify project directory exists
                const fs = await import('fs');
                if (!fs.existsSync(projectPath)) {
                    socket.emit('terminal:error', { message: 'Project not found. Please open the project first.' });
                    return;
                }
                // List files in project path for debugging
                const files = fs.readdirSync(projectPath);
                console.log(`Files in project path:`, files);
                // Get or spawn container
                let containerInfo = await (0, container_1.getContainer)(userId, projectId);
                if (!containerInfo) {
                    // Auto-detect environment from project files
                    const { detectEnvironment } = await import('./environment.js');
                    const detected = detectEnvironment(projectPath);
                    const environment = detected.environment;
                    console.log(`Auto-detected environment: ${environment} (${detected.reason})`);
                    console.log(`Spawning ${environment} container for ${userId}/${projectId}`);
                    containerInfo = await (0, container_1.spawnContainer)(userId, projectId, environment, projectPath);
                }
                else {
                    // Check if existing container has correct environment
                    const { detectEnvironment } = await import('./environment.js');
                    const detected = detectEnvironment(projectPath);
                    if (containerInfo.environment !== detected.environment) {
                        console.log(`Environment mismatch: ${containerInfo.environment} -> ${detected.environment}, restarting container`);
                        await (0, container_1.stopContainer)(userId, projectId);
                        containerInfo = await (0, container_1.spawnContainer)(userId, projectId, detected.environment, projectPath);
                    }
                }
                const container = docker.getContainer(containerInfo.containerId);
                // Create exec session for terminal
                const exec = await container.exec({
                    Cmd: ['/bin/sh'],
                    AttachStdin: true,
                    AttachStdout: true,
                    AttachStderr: true,
                    Tty: true,
                    WorkingDir: '/workspace', // Explicitly set working directory
                    Env: [
                        'TERM=xterm-256color',
                        'PS1=\\u@\\h:\\w\\$ ' // Ensure prompt shows current directory
                    ]
                });
                const stream = await exec.start({
                    hijack: true,
                    stdin: true,
                    Tty: true,
                });
                // Store session
                sessions.set(socket.id, {
                    userId,
                    projectId,
                    exec,
                    stream,
                    socket,
                });
                // Forward container output to client
                stream.on('data', (chunk) => {
                    socket.emit('terminal:output', chunk.toString());
                });
                stream.on('end', () => {
                    socket.emit('terminal:exit', { exitCode: 0 });
                    sessions.delete(socket.id);
                });
                stream.on('error', (err) => {
                    const errorMessage = err instanceof Error
                        ? err.message
                        : typeof err === 'string'
                            ? err
                            : 'Unknown terminal stream error';
                    console.error('Terminal stream error:', err);
                    socket.emit('terminal:error', { message: errorMessage || 'Stream error occurred' });
                });
                // Send initial command to show current directory
                setTimeout(() => {
                    stream.write('clear\n');
                }, 100);
                // Send port info to client
                const ports = {};
                containerInfo.ports.forEach((hostPort, containerPort) => {
                    ports[containerPort] = hostPort;
                });
                socket.emit('terminal:ready', { ports });
                console.log(`Terminal created for ${userId}/${projectId}`);
            }
            catch (error) {
                const errorMessage = error instanceof Error
                    ? error.message
                    : typeof error === 'string'
                        ? error
                        : 'Failed to create terminal';
                console.error('Error creating terminal:', error);
                socket.emit('terminal:error', { message: errorMessage });
            }
        });
        socket.on('terminal:input', (data) => {
            const session = sessions.get(socket.id);
            if (session?.stream) {
                const input = typeof data === 'string' ? data : data.data;
                if (input)
                    session.stream.write(input);
            }
        });
        socket.on('terminal:resize', (data) => {
            const session = sessions.get(socket.id);
            if (session?.exec) {
                // Docker exec resize
                session.exec.resize({ w: data.cols, h: data.rows }).catch((err) => {
                    console.error('Error resizing terminal:', err);
                });
            }
        });
        socket.on('disconnect', () => {
            const session = sessions.get(socket.id);
            if (session) {
                session.stream?.end();
                sessions.delete(socket.id);
                console.log('Terminal disconnected:', socket.id);
            }
        });
    });
    console.log('Terminal service initialized');
}
function getActiveSessionCount() {
    return sessions.size;
}
async function cleanupTerminals() {
    for (const [socketId, session] of sessions) {
        session.stream?.end();
        sessions.delete(socketId);
    }
}
