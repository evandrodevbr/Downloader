import {
    Download,
    FileCheck,
    FileWarning,
    Loader2,
    Play,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { Progress } from "../ui/ProgressBar";
import { formatBytes, formatSpeed } from "../../lib/utils";

export type DownloadStatus = "pending" | "downloading" | "completed" | "error";

export type DownloadItemData = {
    id: number;
    url: string;
    status: DownloadStatus;
    progress: number | null;
    receivedBytes?: number;
    totalBytes?: number;
    speedBytesPerSecond?: number;
    speedHistory: number[];
    error?: string;
};

interface DownloadItemProps {
    item: DownloadItemData;
    onRetry: (id: number, url: string) => void;
}

export function DownloadItem({ item, onRetry }: DownloadItemProps) {
    const isCompleted = item.status === "completed";
    const isError = item.status === "error";
    const isDownloading = item.status === "downloading";

    return (
        <Card className="overflow-hidden transition-all hover:bg-muted/50">
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                            <div
                                className={`flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground ${isCompleted ? "bg-green-500/10 text-green-500" : ""
                                    } ${isError ? "bg-red-500/10 text-red-500" : ""} ${isDownloading ? "bg-primary/10 text-primary" : ""
                                    }`}
                            >
                                {isCompleted ? (
                                    <FileCheck className="size-4" />
                                ) : isError ? (
                                    <FileWarning className="size-4" />
                                ) : isDownloading ? (
                                    <Download className="size-4 animate-bounce" />
                                ) : (
                                    <Loader2 className="size-4 animate-spin" />
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium leading-none">
                                    {item.url.split("/").pop() || item.url}
                                </p>
                                <p className="mt-1 truncate text-xs text-muted-foreground">
                                    {item.url}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{item.progress ?? 0}%</span>
                                <span>
                                    <span>
                                        {item.status === "downloading" &&
                                            formatSpeed(item.speedBytesPerSecond)}
                                    </span>
                                </span>
                            </div>
                            <Progress
                                value={item.progress}
                                className={`h-2 ${isError ? "bg-red-900/20" : ""} ${isCompleted ? "bg-green-900/20" : ""
                                    }`}
                                indicatorClassName={`${isError ? "bg-red-500" : ""} ${isCompleted ? "bg-green-500" : ""
                                    }`}
                            />

                            {/* Sparkline for speed history */}
                            {item.status === "downloading" && item.speedHistory.length > 1 && (
                                <div className="h-8 w-full overflow-hidden opacity-50">
                                    <svg
                                        className="h-full w-full"
                                        viewBox={`0 0 ${item.speedHistory.length - 1} 100`}
                                        preserveAspectRatio="none"
                                    >
                                        <path
                                            d={`M 0,100 ${item.speedHistory
                                                .map((s, i) => {
                                                    const max = Math.max(...item.speedHistory);
                                                    const y = max > 0 ? 100 - (s / max) * 100 : 100;
                                                    return `L ${i},${y}`;
                                                })
                                                .join(" ")} L ${item.speedHistory.length - 1},100 Z`}
                                            fill="currentColor"
                                            className="text-primary/20"
                                        />
                                        <path
                                            d={`M 0,${100 - (item.speedHistory[0] / Math.max(...item.speedHistory)) * 100} ${item.speedHistory
                                                .map((s, i) => {
                                                    const max = Math.max(...item.speedHistory);
                                                    const y = max > 0 ? 100 - (s / max) * 100 : 100;
                                                    return `L ${i},${y}`;
                                                })
                                                .join(" ")}`}
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1"
                                            className="text-primary"
                                            vectorEffect="non-scaling-stroke"
                                        />
                                    </svg>
                                </div>
                            )}

                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>
                                    {formatBytes(item.receivedBytes)} /{" "}
                                    {formatBytes(item.totalBytes)}
                                </span>
                                <span className="capitalize">{item.status}</span>
                            </div>
                        </div>

                        {isError && (
                            <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                                {item.error}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        {isError && (
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => onRetry(item.id, item.url)}
                                className="h-8 w-8"
                            >
                                <Play className="size-4" />
                            </Button>
                        )}
                        {/* Placeholder for pause/cancel in future */}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
