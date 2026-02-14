import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export const formatBytes = (bytes: number | undefined): string => {
    if (!bytes || !Number.isFinite(bytes)) return "-";
    const units = ["B", "KB", "MB", "GB", "TB"] as const;
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    return `${value.toFixed(1)} ${units[unitIndex]}`;
};

export const formatSpeed = (bytesPerSecond: number | undefined): string => {
    if (!bytesPerSecond || !Number.isFinite(bytesPerSecond)) return "- / -";
    const mbPerSecond = bytesPerSecond / (1024 * 1024);
    const mbitPerSecond = (bytesPerSecond * 8) / 1_000_000;
    return `${mbPerSecond.toFixed(2)} MB/s · ${mbitPerSecond.toFixed(2)} Mbps`;
};
