import React, { createContext, useContext, useEffect, useState } from "react";

type SessionData = {
    sessionId: string;
    expiresAt: string;
    remainingMs: number;
};

type DownloadTask = {
    id: string;
    sessionId: string;
    url: string;
    filename: string;
    status: "queued" | "downloading" | "completed" | "error";
    progress: number;
    totalBytes: number;
    receivedBytes: number;
    speed: number;
    error?: string;
    createdAt: number;
};

type SessionContextType = {
    sessionId: string;
    tasks: DownloadTask[];
    expiresAt: string | null;
    queueDownload: (url: string) => Promise<void>;
    refreshTasks: () => void;
};

const SessionContext = createContext<SessionContextType | null>(null);

const API_URL = import.meta.env.VITE_API_URL || "";

export function SessionProvider({ children }: { children: React.ReactNode }) {
    const [sessionId, setSessionId] = useState<string>(() => {
        return localStorage.getItem("downloader_session_id") || "";
    });
    const [tasks, setTasks] = useState<DownloadTask[]>([]);
    const [expiresAt, setExpiresAt] = useState<string | null>(null);

    // Initialize Session
    useEffect(() => {
        const initSession = async () => {
            try {
                const headers: Record<string, string> = {};
                if (sessionId) headers["x-session-id"] = sessionId;

                const res = await fetch(`${API_URL}/api/session`, { headers });
                const data = (await res.json()) as SessionData;

                if (data.sessionId && data.sessionId !== sessionId) {
                    setSessionId(data.sessionId);
                    localStorage.setItem("downloader_session_id", data.sessionId);
                }
                setExpiresAt(data.expiresAt);
            } catch (err) {
                console.error("Failed to init session", err);
            }
        };

        initSession();
    }, [sessionId]);

    // Poll Tasks
    const refreshTasks = async () => {
        if (!sessionId) return;
        try {
            const res = await fetch(`${API_URL}/api/tasks`, {
                headers: { "x-session-id": sessionId },
            });
            if (res.ok) {
                const data = await res.json();
                setTasks(data);
            }
        } catch (err) {
            console.error("Failed to fetch tasks", err);
        }
    };

    useEffect(() => {
        if (!sessionId) return;

        // Initial fetch
        refreshTasks();

        // Poll every 2 seconds
        const interval = setInterval(refreshTasks, 2000);
        return () => clearInterval(interval);
    }, [sessionId]);

    const queueDownload = async (url: string) => {
        if (!sessionId) return;
        try {
            const res = await fetch(`${API_URL}/api/queue`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-session-id": sessionId,
                },
                body: JSON.stringify({ url }),
            });

            if (!res.ok) throw new Error("Failed to queue download");

            await refreshTasks(); // Immediate refresh

            // Update expiration from action
            // Ideally we should re-fetch /api/session here too, or just rely on the side-effect
            const sessionRes = await fetch(`${API_URL}/api/session`, {
                headers: { "x-session-id": sessionId }
            });
            const sessionData = await sessionRes.json();
            setExpiresAt(sessionData.expiresAt);

        } catch (err) {
            console.error(err);
            throw err;
        }
    };

    return (
        <SessionContext.Provider value={{ sessionId, tasks, expiresAt, queueDownload, refreshTasks }}>
            {children}
        </SessionContext.Provider>
    );
}

export function useSession() {
    const context = useContext(SessionContext);
    if (!context) throw new Error("useSession must be used within SessionProvider");
    return context;
}
