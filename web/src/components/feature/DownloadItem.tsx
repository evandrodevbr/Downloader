import {
    FileCheck,
    FileWarning,
    Loader2,
    Server,
    HardDrive
} from "lucide-react";
import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { Progress } from "../ui/ProgressBar";
import { formatBytes, formatSpeed } from "../../lib/utils";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export type DownloadStatus = "queued" | "downloading" | "completed" | "error";

export type DownloadItemData = {
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

interface DownloadItemProps {
    item: DownloadItemData;
}

export function DownloadItem({ item }: DownloadItemProps) {
    const isCompleted = item.status === "completed";
    const isError = item.status === "error";
    const isQueued = item.status === "queued";

    const handleDownloadFile = () => {
        const download = async () => {
            try {
                const sessionId = localStorage.getItem("downloader_session_id") || "";
                const res = await fetch(`${API_URL}/api/download/${item.id}`, {
                    headers: { "x-session-id": sessionId }
                });
                if (!res.ok) throw new Error("Download failed");

                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = item.filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } catch (e) {
                alert("Failed to download file");
            }
        };

        download();
    };

    return (
        <Card className="overflow-hidden transition-all hover:bg-muted/50">
            <CardContent className="p-4">
                <div className="flex items-start gap-4">
                    <div className="mt-1">
                        {isCompleted ? (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                                <FileCheck className="h-5 w-5" />
                            </div>
                        ) : isError ? (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                                <FileWarning className="h-5 w-5" />
                            </div>
                        ) : isQueued ? (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                                <Server className="h-5 w-5 animate-pulse" />
                            </div>
                        ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <Loader2 className="h-5 w-5 animate-spin" />
                            </div>
                        )}
                    </div>

                    <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1 truncate">
                                <h3 className="font-medium leading-none truncate" title={item.filename || item.url}>
                                    {item.filename || item.url}
                                </h3>
                                <p className="text-xs text-muted-foreground truncate" title={item.url}>
                                    {item.url}
                                </p>
                            </div>
                            {isCompleted && (
                                <Button size="sm" onClick={handleDownloadFile} className="shrink-0 gap-2">
                                    <HardDrive className="w-4 h-4" />
                                    Save to Disk
                                </Button>
                            )}
                        </div>

                        {/* Progress Section */}
                        {!isCompleted && !isError && (
                            <div className="space-y-2 pt-2">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>{isQueued ? "Queued on server..." : item.status}</span>
                                    <span>{formatBytes(item.receivedBytes || 0)} / {item.totalBytes ? formatBytes(item.totalBytes) : "??"}</span>
                                </div>
                                <Progress value={item.progress || 0} className="h-1.5" />
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>{item.speed ? formatSpeed(item.speed) : "0 B/s"}</span>
                                    <span>{item.progress ? `${Math.round(item.progress)}%` : "0%"}</span>
                                </div>
                            </div>
                        )}

                        {isCompleted && (
                            <div className="pt-2 flex items-center gap-2 text-xs text-green-500">
                                <FileCheck className="w-3 h-3" />
                                <span>Ready for download ({formatBytes(item.totalBytes)})</span>
                            </div>
                        )}

                        {isError && (
                            <div className="text-sm text-destructive pt-1">
                                {item.error || "Unknown error occurred"}
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
