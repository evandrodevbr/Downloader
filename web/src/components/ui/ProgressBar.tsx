import * as React from "react";
import { cn } from "../../lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
    value?: number | null;
    max?: number;
    indicatorClassName?: string;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
    ({ className, value, max = 100, indicatorClassName, ...props }, ref) => {
        const percent = Math.min(Math.max(0, value || 0), max);

        return (
            <div
                ref={ref}
                className={cn(
                    "relative h-2 w-full overflow-hidden rounded-full bg-secondary",
                    className
                )}
                {...props}
            >
                <div
                    className={cn(
                        "h-full w-full flex-1 bg-primary transition-all duration-200 ease-in-out",
                        indicatorClassName
                    )}
                    style={{ transform: `translateX(-${100 - (percent / max) * 100}%)` }}
                />
            </div>
        );
    }
);
Progress.displayName = "Progress";

export { Progress };
