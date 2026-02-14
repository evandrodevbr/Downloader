import { createWriteStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { request, Dispatcher } from "undici";
import { randomUUID } from "node:crypto";
import { sessionManager } from "./SessionManager";

type DownloadStatus = "queued" | "downloading" | "completed" | "error";

export type DownloadTask = {
    id: string;
    sessionId: string;
    url: string;
    filename: string;
    status: DownloadStatus;
    progress: number;
    totalBytes: number;
    receivedBytes: number;
    speed: number;
    error?: string;
    createdAt: number;
};

// Map to store active task metadata in memory (for speed)
// Ideally this would be persisted to JSON in the session folder for crash recovery
const tasks = new Map<string, DownloadTask>();
const agent = new Dispatcher(); // Should use the global agent from index.ts ideally, or pass it in.

export class DownloadManager {

    constructor(private globalAgent: Dispatcher) { }

    public getTasks(sessionId: string): DownloadTask[] {
        return Array.from(tasks.values()).filter(t => t.sessionId === sessionId);
    }

    public getTask(taskId: string): DownloadTask | undefined {
        return tasks.get(taskId);
    }

    public async queueDownload(sessionId: string, url: string): Promise<DownloadTask> {
        const id = randomUUID();

        // Try to determine filename
        let filename = "download.bin";
        try {
            const u = new URL(url);
            const p = u.pathname.split("/").pop();
            if (p) filename = p;
        } catch { }

        const task: DownloadTask = {
            id,
            sessionId,
            url,
            filename, // Will be updated after HEAD request if possible
            status: "queued",
            progress: 0,
            totalBytes: 0,
            receivedBytes: 0,
            speed: 0,
            createdAt: Date.now()
        };

        tasks.set(id, task);
        this.startDownload(task);

        return task;
    }

    private async startDownload(task: DownloadTask) {
        const sessionPath = sessionManager.getSessionPath(task.sessionId);
        if (!existsSync(sessionPath)) {
            task.status = "error";
            task.error = "Session expired or missing";
            return;
        }

        task.status = "downloading";

        try {
            // Step 1: HEAD/GET to stream
            const response = await request(task.url, {
                dispatcher: this.globalAgent,
                headersTimeout: 15000,
                headers: { "User-Agent": "Ephemeral-Downloader/2.0" }
            });

            if (response.statusCode >= 400) {
                throw new Error(`HTTP Error ${response.statusCode}`);
            }

            // Update filename from headers if available
            const disposition = response.headers["content-disposition"];
            if (typeof disposition === "string") {
                const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
                if (match?.[1]) {
                    task.filename = decodeURIComponent(match[1].replace(/"/g, ""));
                }
            }

            // Size
            const len = response.headers["content-length"];
            if (len) {
                task.totalBytes = Number(Array.isArray(len) ? len[0] : len);
            }

            const filePath = join(sessionPath, `${task.id}_${task.filename}`);
            const fileStream = createWriteStream(filePath);

            let lastUpdate = Date.now();
            let bytesAtLastUpdate = 0;

            for await (const chunk of response.body) {
                fileStream.write(chunk);
                task.receivedBytes += chunk.length;

                const now = Date.now();
                if (now - lastUpdate > 500) { // Update speed every 500ms
                    const diff = now - lastUpdate;
                    const bytesDiff = task.receivedBytes - bytesAtLastUpdate;
                    task.speed = (bytesDiff / diff) * 1000;

                    if (task.totalBytes > 0) {
                        task.progress = Math.round((task.receivedBytes / task.totalBytes) * 100);
                    }

                    lastUpdate = now;
                    bytesAtLastUpdate = task.receivedBytes;

                    // Touch session to keep it alive during download
                    sessionManager.touch(task.sessionId);
                }
            }

            fileStream.end();
            task.status = "completed";
            task.progress = 100;
            task.speed = 0;
            sessionManager.touch(task.sessionId); // keep alive after finish

        } catch (err) {
            task.status = "error";
            task.error = err instanceof Error ? err.message : "Unknown error";
            console.error(`[DownloadManager] Download failed: ${task.url}`, err);
        }
    }
}
