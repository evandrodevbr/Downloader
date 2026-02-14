import { existsSync, mkdirSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const STORAGE_ROOT = resolve(process.cwd(), "server/storage");
const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 Hour

type SessionData = {
    id: string;
    lastActive: number;
};

export class SessionManager {
    private sessions: Map<string, SessionData> = new Map();

    constructor() {
        // Ensure storage root exists
        if (!existsSync(STORAGE_ROOT)) {
            mkdirSync(STORAGE_ROOT, { recursive: true });
        }

        // Start Garbage Collector
        setInterval(() => this.cleanup(), 60 * 1000); // Check every minute
        console.log("[SessionManager] Garbage Collector started.");
    }

    /**
     * Gets or creates a session. Updates lastActive timestamp.
     */
    public getSession(id?: string): SessionData {
        const now = Date.now();

        if (id && this.sessions.has(id)) {
            const session = this.sessions.get(id)!;
            session.lastActive = now;
            return session;
        }

        // If ID provided but not in memory, check if folder exists (recovery)
        if (id && existsSync(join(STORAGE_ROOT, id))) {
            const session = { id, lastActive: now };
            this.sessions.set(id, session);
            return session;
        }

        // Create new session
        const newId = randomUUID();
        const session = { id: newId, lastActive: now };
        this.sessions.set(newId, session);

        // Create folder
        const sessionPath = this.getSessionPath(newId);
        if (!existsSync(sessionPath)) {
            mkdirSync(sessionPath, { recursive: true });
        }

        return session;
    }

    public getSessionPath(sessionId: string): string {
        return join(STORAGE_ROOT, sessionId);
    }

    public getSessionTimeRemaining(sessionId: string): number {
        const session = this.sessions.get(sessionId);
        if (!session) return 0;
        const expiresAt = session.lastActive + SESSION_TIMEOUT_MS;
        return Math.max(0, expiresAt - Date.now());
    }

    public getExpiresAt(sessionId: string): string {
        const session = this.sessions.get(sessionId);
        if (!session) return new Date().toISOString();
        return new Date(session.lastActive + SESSION_TIMEOUT_MS).toISOString();
    }

    public touch(sessionId: string) {
        if (this.sessions.has(sessionId)) {
            this.sessions.get(sessionId)!.lastActive = Date.now();
        }
    }

    /**
     * Removes expired sessions and deletes their files.
     */
    private cleanup() {
        const now = Date.now();

        // Check in-memory sessions
        for (const [id, session] of this.sessions.entries()) {
            if (now - session.lastActive > SESSION_TIMEOUT_MS) {
                console.log(`[SessionManager] Session ${id} expired. Cleaning up...`);
                this.destroySession(id);
            }
        }

        // Double check orphaned folders (in case server restarted)
        // accessible folders in storage that are not in memory OR are too old
        try {
            const dirs = readdirSync(STORAGE_ROOT);
            for (const dir of dirs) {
                if (dir === ".gitignore") continue;

                const dirPath = join(STORAGE_ROOT, dir);
                const stats = statSync(dirPath);

                // If folder is older than timeout and not in active memory (or in memory but expired)
                // Note: mtime might update when files are written, so this is a heuristic fallback
                const isInMemory = this.sessions.has(dir);
                if (!isInMemory && (now - stats.mtimeMs > SESSION_TIMEOUT_MS)) {
                    console.log(`[SessionManager] Removing orphaned session folder: ${dir}`);
                    rmSync(dirPath, { recursive: true, force: true });
                }
            }
        } catch (err) {
            console.error("[SessionManager] Error during fallback cleanup", err);
        }
    }

    private destroySession(id: string) {
        this.sessions.delete(id);
        const path = this.getSessionPath(id);
        if (existsSync(path)) {
            try {
                rmSync(path, { recursive: true, force: true });
                console.log(`[SessionManager] Deleted storage for ${id}`);
            } catch (e) {
                console.error(`[SessionManager] Failed to delete ${path}`, e);
            }
        }
    }
}

export const sessionManager = new SessionManager();
