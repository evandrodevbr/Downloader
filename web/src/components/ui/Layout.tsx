import type { ReactNode } from "react";
import { MoveDown, Server } from "lucide-react";

type LayoutProps = {
    children: ReactNode;
};

export function Layout({ children }: LayoutProps) {
    return (
        <div className="min-h-screen bg-background text-foreground font-sans antialiased selection:bg-primary selection:text-primary-foreground">
            <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px]"></div>
            <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-primary/20 opacity-20 blur-[100px]"></div>

            <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-14 max-w-screen-2xl items-center px-4 md:px-8">
                    <div className="mr-4 flex items-center space-x-2">
                        <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                            <MoveDown className="size-5" />
                        </div>
                        <span className="hidden font-bold sm:inline-block">
                            Ephemeral Downloader
                        </span>
                    </div>
                    <div className="flex flex-1 items-center justify-end space-x-2 md:justify-end">
                        <nav className="flex items-center space-x-2 text-sm font-medium text-muted-foreground">
                            <div className="flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs">
                                <Server className="size-3" />
                                <span>VPS Proxy Active</span>
                            </div>
                        </nav>
                    </div>
                </div>
            </header>
            <main className="container max-w-screen-xl py-6 md:py-10 px-4 md:px-8">
                {children}
            </main>
        </div>
    );
}
