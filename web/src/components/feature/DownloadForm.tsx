import { useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Download } from "lucide-react";
import { z } from "zod";

const formSchema = z.object({
    url: z.string().url("Please enter a valid URL"),
});

interface DownloadFormProps {
    onDownload: (url: string) => void;
}

export function DownloadForm({ onDownload }: DownloadFormProps) {
    const [url, setUrl] = useState("");
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const result = formSchema.safeParse({ url });

        if (!result.success) {
            setError(result.error.errors[0].message);
            return;
        }

        onDownload(url);
        setUrl("");
    };

    return (
        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
            <div className="flex w-full items-start gap-2">
                <div className="flex-1 space-y-1">
                    <Input
                        type="url"
                        placeholder="https://example.com/file.zip"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className={error ? "border-destructive focus-visible:ring-destructive" : ""}
                    />
                    {error && <p className="text-xs text-destructive">{error}</p>}
                </div>
                <Button type="submit">
                    <Download className="mr-2 h-4 w-4" />
                    Download
                </Button>
            </div>
        </form>
    );
}
