import { useState } from "react";
import type { FormEvent } from "react";
import { Download } from "lucide-react";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";

interface DownloadFormProps {
    onSubmit: (urls: string[]) => void;
}

export function DownloadForm({ onSubmit }: DownloadFormProps) {
    const [text, setText] = useState("");
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        setError(null);

        const urls = text
            .split(/\r?\n/)
            .map((u) => u.trim())
            .filter(Boolean);

        if (urls.length === 0) {
            setError("Please enter at least one URL.");
            return;
        }

        const invalidUrl = urls.find((u) => {
            try {
                new URL(u);
                return false;
            } catch {
                return true;
            }
        });

        if (invalidUrl) {
            setError(`Invalid URL detected: ${invalidUrl}`);
            return;
        }

        onSubmit(urls);
        setText("");
    };

    return (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
                <CardTitle>New Download</CardTitle>
                <CardDescription>
                    Enter direct links (HTTP/HTTPS) to stream via VPS. One URL per line.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Textarea
                        placeholder="https://example.com/file.iso"
                        className="min-h-[120px] font-mono text-sm"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                    />
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <div className="flex justify-end">
                        <Button type="submit" className="w-full sm:w-auto">
                            <Download className="mr-2 size-4" />
                            Start Download
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
