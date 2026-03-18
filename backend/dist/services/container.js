"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pingDocker = pingDocker;
exports.getContainer = getContainer;
exports.forceStopContainer = forceStopContainer;
exports.spawnContainer = spawnContainer;
exports.execInContainer = execInContainer;
exports.stopContainer = stopContainer;
exports.cleanupAllContainers = cleanupAllContainers;
exports.getContainerPorts = getContainerPorts;
// Docker container service for managing IDE environments
const dockerode_1 = __importDefault(require("dockerode"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
// Auto-detect Docker socket (Docker Desktop uses a different path on Linux)
function getDockerSocket() {
    const homeDir = os_1.default.homedir();
    const desktopSocket = path_1.default.join(homeDir, '.docker/desktop/docker.sock');
    // Check if Docker Desktop socket exists
    if (fs_1.default.existsSync(desktopSocket)) {
        return desktopSocket;
    }
    // Check for Windows named pipe
    if (os_1.default.platform() === 'win32') {
        return '//./pipe/docker_engine';
    }
    // Fallback to standard Docker socket
    return '/var/run/docker.sock';
}
const docker = new dockerode_1.default({ socketPath: getDockerSocket() });
async function pingDocker() {
    try {
        await docker.ping();
        return true;
    }
    catch (error) {
        return false;
    }
}
// Environment to Docker image mapping
// We use standard images to ensure broad compatibility without needing to build custom images
const ENVIRONMENT_IMAGES = {
    python: 'python:3.11-alpine',
    node: 'node:20-alpine',
    java: 'eclipse-temurin:21-jdk-alpine',
    multi: 'node:20-alpine',
    base: 'node:20-alpine',
};
// Port range for container bindings (21000+ to avoid conflicts)
const PORT_RANGE_START = 21000;
const PORT_RANGE_SIZE = 10;
// Track active containers: userId-projectId -> ContainerInfo
const activeContainers = new Map();
// Track containers currently being spawned to prevent cleanup race conditions
const pendingContainerIds = new Set();
// Track used host ports
const usedPorts = new Set();
function getContainerKey(userId, projectId) {
    return `${userId}-${projectId}`;
}
// Check if a port is actually available on the system
async function isPortAvailable(port) {
    return new Promise((resolve) => {
        const net = require('net');
        const server = net.createServer();
        server.listen(port, '0.0.0.0');
        server.on('listening', () => {
            server.close();
            resolve(true);
        });
        server.on('error', () => {
            resolve(false);
        });
    });
}
async function findAvailablePort() {
    for (let port = PORT_RANGE_START; port < PORT_RANGE_START + 1000; port++) {
        if (!usedPorts.has(port) && await isPortAvailable(port)) {
            usedPorts.add(port);
            return port;
        }
    }
    throw new Error('No available ports');
}
function releasePort(port) {
    usedPorts.delete(port);
}
async function getContainer(userId, projectId) {
    const key = getContainerKey(userId, projectId);
    const info = activeContainers.get(key);
    if (!info)
        return null;
    // Verify container is still running
    try {
        const container = docker.getContainer(info.containerId);
        const data = await container.inspect();
        if (data.State.Running) {
            return info;
        }
    }
    catch (error) {
        // Container no longer exists
        activeContainers.delete(key);
    }
    return null;
}
async function forceStopContainer(userId, projectId) {
    await stopContainer(userId, projectId);
}
async function spawnContainer(userId, projectId, environment, projectPath) {
    const key = getContainerKey(userId, projectId);
    // Check if container already exists
    const existing = await getContainer(userId, projectId);
    if (existing) {
        return existing;
    }
    const imageName = ENVIRONMENT_IMAGES[environment] || 'node:20-alpine';
    // Find available ports for common dev server ports
    const portBindings = {};
    const ports = new Map();
    // Bind ports 3000-3005 from container to available host ports
    for (let containerPort = 3000; containerPort <= 3005; containerPort++) {
        const hostPort = await findAvailablePort();
        portBindings[`${containerPort}/tcp`] = [{ HostPort: hostPort.toString() }];
        ports.set(containerPort, hostPort);
    }
    // Ensure project directory exists and get absolute path
    let absoluteProjectPath = path_1.default.resolve(projectPath);
    // Fix for Windows Docker mounting: ensure forward slashes and proper drive casing
    if (os_1.default.platform() === 'win32') {
        absoluteProjectPath = absoluteProjectPath.replace(/\\/g, '/');
        // Ensure drive letter is lowercase (often required for WSL2/Docker backend)
        if (absoluteProjectPath.match(/^[a-zA-Z]:\//)) {
            absoluteProjectPath = absoluteProjectPath.charAt(0).toLowerCase() + absoluteProjectPath.slice(1);
        }
    }
    console.log(`Spawning container with image: ${imageName} for path: ${absoluteProjectPath}`);
    // Ensure image exists or pull it
    try {
        const image = docker.getImage(imageName);
        const imageInfo = await image.inspect().catch(() => null);
        if (!imageInfo) {
            console.log(`Image ${imageName} not found locally, pulling...`);
            await new Promise((resolve, reject) => {
                docker.pull(imageName, (err, stream) => {
                    if (err)
                        return reject(err);
                    docker.modem.followProgress(stream, onFinished, onProgress);
                    function onFinished(err, output) {
                        if (err)
                            return reject(err);
                        resolve(output);
                    }
                    function onProgress(event) {
                        // console.log(event);
                    }
                });
            });
            console.log(`Image ${imageName} pulled successfully`);
        }
    }
    catch (pullError) {
        console.error(`Error checking/pulling image ${imageName}:`, pullError);
    }
    try {
        // Create container
        const container = await docker.createContainer({
            Image: imageName,
            Cmd: ['/bin/sh'],
            Tty: true,
            OpenStdin: true,
            WorkingDir: '/workspace',
            ExposedPorts: Object.keys(portBindings).reduce((acc, port) => ({ ...acc, [port]: {} }), {}),
            HostConfig: {
                Binds: [`${absoluteProjectPath}:/workspace:rw`],
                PortBindings: portBindings,
                NetworkMode: 'bridge',
                // Resource limits
                Memory: 512 * 1024 * 1024, // 512MB
                CpuShares: 256, // 25% of CPU
            },
            Labels: {
                'codeblocking.userId': userId,
                'codeblocking.projectId': projectId,
            },
            Env: [
                'TERM=xterm-256color',
                'PS1=\\u@\\h:\\w\\$ ', // Set a clear prompt showing current directory
            ],
        });
        // Mark as pending so cleanup doesn't delete it
        pendingContainerIds.add(container.id);
        try {
            await container.start();
            // Wait a brief moment to ensure container is fully up
            await new Promise(resolve => setTimeout(resolve, 500));
            const info = {
                containerId: container.id,
                environment,
                ports,
                projectPath: absoluteProjectPath,
            };
            activeContainers.set(key, info);
            console.log(`Container started for ${key}: ${container.id.substring(0, 12)}`);
            console.log(`Port mappings:`, Array.from(ports.entries()).map(([c, h]) => `${c}->${h}`).join(', '));
            return info;
        }
        finally {
            // Remove from pending whether success or fail
            pendingContainerIds.delete(container.id);
        }
    }
    catch (error) {
        // Release ports if container creation failed
        ports.forEach((hostPort) => releasePort(hostPort));
        throw error;
    }
}
async function execInContainer(userId, projectId) {
    const info = await getContainer(userId, projectId);
    if (!info)
        return null;
    const container = docker.getContainer(info.containerId);
    const exec = await container.exec({
        Cmd: ['/bin/bash'],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
    });
    return exec;
}
async function stopContainer(userId, projectId) {
    const key = getContainerKey(userId, projectId);
    const info = activeContainers.get(key);
    if (!info)
        return;
    try {
        const container = docker.getContainer(info.containerId);
        await container.stop({ t: 5 });
        await container.remove();
        console.log(`Container stopped for ${key}`);
    }
    catch (error) {
        console.error(`Error stopping container ${key}:`, error);
    }
    // Release ports
    info.ports.forEach((hostPort) => releasePort(hostPort));
    activeContainers.delete(key);
}
async function cleanupAllContainers() {
    console.log('Cleaning up all containers...');
    const keys = Array.from(activeContainers.keys());
    for (const key of keys) {
        const [userId, projectId] = key.split('-');
        await stopContainer(userId, projectId);
    }
    // Also clean up any orphaned codeblocking containers
    const containers = await docker.listContainers({
        filters: { label: ['codeblocking.userId'] },
    });
    const activeIds = new Set(Array.from(activeContainers.values()).map(c => c.containerId));
    for (const containerInfo of containers) {
        // Skip if this container is currently active or pending
        if (activeIds.has(containerInfo.Id) || pendingContainerIds.has(containerInfo.Id)) {
            continue;
        }
        try {
            const container = docker.getContainer(containerInfo.Id);
            await container.stop({ t: 1 });
            await container.remove();
            console.log(`Cleaned up orphaned container: ${containerInfo.Id.substring(0, 12)}`);
        }
        catch (error) {
            console.error(`Error cleaning up orphaned container:`, error);
        }
    }
}
function getContainerPorts(userId, projectId) {
    const key = getContainerKey(userId, projectId);
    const info = activeContainers.get(key);
    return info?.ports || null;
}
