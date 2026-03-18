"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectEnvironment = detectEnvironment;
exports.getContainerImage = getContainerImage;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function detectEnvironment(projectPath) {
    const files = fs.readdirSync(projectPath);
    // Check root level
    const hasPython = files.includes('requirements.txt') ||
        files.includes('setup.py') ||
        files.includes('pyproject.toml') ||
        files.includes('Pipfile') ||
        files.some(f => f.endsWith('.py'));
    const hasNode = files.includes('package.json') ||
        files.some(f => f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.jsx') || f.endsWith('.tsx'));
    // Check subdirectories for package.json
    if (!hasNode) {
        for (const file of files) {
            const fullPath = path.join(projectPath, file);
            if (fs.statSync(fullPath).isDirectory()) {
                const subFiles = fs.readdirSync(fullPath);
                if (subFiles.includes('package.json')) {
                    return { environment: 'node', reason: 'Found package.json in subdirectory' };
                }
            }
        }
    }
    if (hasPython && hasNode) {
        return { environment: 'multi', reason: 'Found both Python and Node.js files' };
    }
    if (hasPython) {
        return { environment: 'python', reason: 'Found Python files' };
    }
    if (hasNode) {
        return { environment: 'node', reason: 'Found Node.js/JavaScript files' };
    }
    return { environment: 'node', reason: 'Default to Node.js environment' };
}
function getContainerImage(environment) {
    const images = {
        python: 'python:3.11-alpine',
        node: 'node:20-alpine',
        java: 'eclipse-temurin:21-jdk-alpine',
        multi: 'node:20-alpine',
        base: 'node:20-alpine'
    };
    return images[environment];
}
