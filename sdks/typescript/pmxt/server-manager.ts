/**
 * Server manager for PMXT TypeScript SDK.
 * 
 * Handles automatic server startup and health checks.
 */

import { DefaultApi, Configuration } from "../generated/src/index.js";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";

export interface ServerManagerOptions {
    baseUrl?: string;
    maxRetries?: number;
    retryDelayMs?: number;
}

interface ServerLockInfo {
    port: number;
    pid: number;
    timestamp: number;
}

export class ServerManager {
    private baseUrl: string;
    private maxRetries: number;
    private retryDelayMs: number;
    private api: DefaultApi;
    private lockPath: string;
    private static readonly DEFAULT_PORT = 3847;

    constructor(options: ServerManagerOptions = {}) {
        this.baseUrl = options.baseUrl || `http://localhost:${ServerManager.DEFAULT_PORT}`;
        this.maxRetries = options.maxRetries || 30;
        this.retryDelayMs = options.retryDelayMs || 1000;
        this.lockPath = join(homedir(), '.pmxt', 'server.lock');

        const config = new Configuration({ basePath: this.baseUrl });
        this.api = new DefaultApi(config);
    }

    /**
     * Read server information from lock file.
     */
    private getServerInfo(): ServerLockInfo | null {
        try {
            if (!existsSync(this.lockPath)) {
                return null;
            }
            const content = readFileSync(this.lockPath, 'utf-8');
            return JSON.parse(content) as ServerLockInfo;
        } catch {
            return null;
        }
    }

    /**
     * Get the actual port the server is running on.
     * 
     * This reads the lock file to determine the actual port,
     * which may differ from the default if the default port was busy.
     */
    getRunningPort(): number {
        const info = this.getServerInfo();
        return info?.port || ServerManager.DEFAULT_PORT;
    }

    /**
     * Check if the server is running.
     */
    /**
     * Check if the server is running.
     */
    async isServerRunning(): Promise<boolean> {
        // Read lock file to get current port
        const port = this.getRunningPort();

        try {
            // Use native fetch to check health on the actual running port
            // This avoids issues where this.api is configured with the wrong port
            const response = await fetch(`http://localhost:${port}/health`);
            if (response.ok) {
                const data = await response.json();
                return (data as any).status === "ok";
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Wait for the server to be ready.
     */
    private async waitForServer(): Promise<void> {
        for (let i = 0; i < this.maxRetries; i++) {
            if (await this.isServerRunning()) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
        }
        throw new Error(
            `Server did not start within ${(this.maxRetries * this.retryDelayMs) / 1000}s`
        );
    }

    /**
     * Ensure the server is running, starting it if necessary.
     */
    async ensureServerRunning(): Promise<void> {
        // Check if already running
        if (await this.isServerRunning()) {
            return;
        }

        // Locate pmxt-ensure-server
        let launcherPath = 'pmxt-ensure-server'; // Default to PATH

        try {
            // Try to resolve from pmxt-core dependency
            // For CommonJS build (which is primary), we can use require directly
            // For ESM build, this will be transpiled appropriately
            const corePackageJson = require.resolve('pmxt-core/package.json');
            const coreDir = dirname(corePackageJson);
            const binPath = join(coreDir, 'bin', 'pmxt-ensure-server');

            if (existsSync(binPath)) {
                launcherPath = binPath;
            }
        } catch (error) {
            // If resolution fails, fall back to PATH
            // This could happen in dev environments where pmxt-core is globally installed
        }

        // Try to start the server using pmxt-ensure-server
        const { spawn } = await import("child_process");

        try {
            const proc = spawn(launcherPath, [], {
                detached: true,
                stdio: "ignore",
            });
            proc.unref();

            // Wait for server to be ready
            await this.waitForServer();
        } catch (error) {
            throw new Error(
                `Failed to start PMXT server: ${error}\n\n` +
                `Please ensure 'pmxt-core' is installed: npm install -g pmxt-core\n` +
                `Or start the server manually: pmxt-server`
            );
        }
    }
}

