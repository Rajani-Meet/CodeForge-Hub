import * as fs from 'fs'
import * as path from 'path'

type ProjectEnvironment = 'python' | 'node' | 'java' | 'multi' | 'base'

interface EnvironmentResult {
    environment: ProjectEnvironment
    reason: string
}

export function detectEnvironment(projectPath: string): EnvironmentResult {
    const files = fs.readdirSync(projectPath)

    // Check root level
    const hasPython =
        files.includes('requirements.txt') ||
        files.includes('setup.py') ||
        files.includes('pyproject.toml') ||
        files.includes('Pipfile') ||
        files.some(f => f.endsWith('.py'))

    const hasNode =
        files.includes('package.json') ||
        files.some(f => f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.jsx') || f.endsWith('.tsx'))

    // Check subdirectories for package.json
    if (!hasNode) {
        for (const file of files) {
            const fullPath = path.join(projectPath, file)
            if (fs.statSync(fullPath).isDirectory()) {
                const subFiles = fs.readdirSync(fullPath)
                if (subFiles.includes('package.json')) {
                    return { environment: 'node', reason: 'Found package.json in subdirectory' }
                }
            }
        }
    }

    if (hasPython && hasNode) {
        return { environment: 'multi', reason: 'Found both Python and Node.js files' }
    }

    if (hasPython) {
        return { environment: 'python', reason: 'Found Python files' }
    }

    if (hasNode) {
        return { environment: 'node', reason: 'Found Node.js/JavaScript files' }
    }

    return { environment: 'node', reason: 'Default to Node.js environment' }
}

export function getContainerImage(environment: ProjectEnvironment): string {
    const images: Record<ProjectEnvironment, string> = {
        python: 'python:3.11-alpine',
        node: 'node:20-alpine',
        java: 'eclipse-temurin:21-jdk-alpine',
        multi: 'node:20-alpine',
        base: 'node:20-alpine'
    }
    return images[environment]
}
