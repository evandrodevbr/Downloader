import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "../../lib/utils";

interface SessionTimerProps {
    expiresAt: string | null;
    className?: string;
}

export function SessionTimer({ expiresAt, className }: SessionTimerProps) {
    const [timeLeft, setTimeLeft] = useState<string>("--:--");
    const [isCritical, setIsCritical] = useState(false);

    useEffect(() => {
        if (!expiresAt) return;

        const tick = () => {
            const now = Date.now();
            const end = new Date(expiresAt).getTime();
            const diff = Math.max(0, end - now);

            if (diff <= 0) {
                setTimeLeft("Expired");
                setIsCritical(true);
                return;
            }

            const minutes = Math.floor(diff / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);

            setTimeLeft(`${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`);
            setIsCritical(minutes < 5); // Critical if less than 5 minutes
        };

        tick(); // Initial call
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [expiresAt]);

    if (!expiresAt) return null;

    return (
        <div className={cn("flex items-center gap-2 text-sm font-medium", isCritical ? "text-destructive" : "text-muted-foreground", className)}>
            <Clock className="w-4 h-4" />
            <span>Session: {timeLeft}</span>
        </div>
    );
}
