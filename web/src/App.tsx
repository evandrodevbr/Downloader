import { useState } from "react";
import { Layout } from "./components/ui/Layout";
import { DownloadForm } from "./components/feature/DownloadForm";
import { DownloadItem, type DownloadItemData } from "./components/feature/DownloadItem";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/Card";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

function App() {
  const [downloads, setDownloads] = useState<DownloadItemData[]>([]);

  const startDownload = async (itemId: number, url: string, resume = false) => {
    const existing = downloads.find((item) => item.id === itemId);
    const alreadyReceived = resume && existing?.receivedBytes
      ? existing.receivedBytes
      : 0;

    setDownloads((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
            ...item,
            status: "downloading",
            progress: item.progress ?? 0,
            error: undefined,
            speedHistory: [], // Reset history on start/resume
          }
          : item,
      ),
    );

    try {
      const query = new URLSearchParams({
        url,
      });
      if (resume && alreadyReceived > 0) {
        query.set("offset", String(alreadyReceived));
      }

      const response = await fetch(
        `${API_URL}/stream?${query.toString()}`,
      );

      if (!response.ok || !response.body) {
        const message = "Failed to start download.";
        setDownloads((current) =>
          current.map((item) =>
            item.id === itemId
              ? { ...item, status: "error", error: message, progress: null }
              : item,
          ),
        );
        return;
      }

      const contentLengthHeader =
        response.headers.get("x-origin-content-length") ??
        response.headers.get("content-length");

      const totalBytes = contentLengthHeader
        ? Number.parseInt(contentLengthHeader, 10)
        : 0;

      const reader = response.body.getReader();
      const chunks: BlobPart[] = [];
      let received = alreadyReceived;
      const startedAt = performance.now();

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value.buffer as ArrayBuffer);
          received += value.length;
          const elapsedSeconds = (performance.now() - startedAt) / 1000;
          const bytesPerSecond =
            elapsedSeconds > 0 ? received / elapsedSeconds : 0;
          const percentage =
            totalBytes > 0 ? Math.round((received / totalBytes) * 100) : null;

          setDownloads((current) =>
            current.map((item) => {
              if (item.id !== itemId) return item;

              const newHistory = [...(item.speedHistory || []), bytesPerSecond];
              // Keep last 50 data points for the graph
              if (newHistory.length > 50) newHistory.shift();

              return {
                ...item,
                progress: percentage,
                receivedBytes: received,
                totalBytes: totalBytes || item.totalBytes,
                speedBytesPerSecond: bytesPerSecond,
                speedHistory: newHistory,
              };
            }),
          );
        }
      }

      const contentType =
        response.headers.get("content-type") ?? "application/octet-stream";
      const blob = new Blob(chunks, { type: contentType });

      const disposition = response.headers.get("content-disposition");
      const fallbackName = (() => {
        try {
          const parsed = new URL(url);
          const nameFromPath = parsed.pathname.split("/").filter(Boolean).pop();
          return nameFromPath ?? "download.bin";
        } catch {
          return "download.bin";
        }
      })();

      const filename = (() => {
        if (disposition) {
          const match =
            /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
          if (match?.[1]) {
            return decodeURIComponent(match[1].replace(/"/g, ""));
          }
        }
        return fallbackName;
      })();

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      setDownloads((current) =>
        current.map((item) =>
          item.id === itemId
            ? { ...item, status: "completed", progress: 100 }
            : item,
        ),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unexpected error during download.";
      setDownloads((current) =>
        current.map((item) =>
          item.id === itemId
            ? { ...item, status: "error", error: message, progress: null }
            : item,
        ),
      );
    }
  };

  const handleNewDownloads = (urls: string[]) => {
    const baseId = Date.now();
    const newItems: DownloadItemData[] = urls.map((value, index) => ({
      id: baseId + index,
      url: value,
      status: "pending",
      progress: 0,
      speedHistory: [],
    }));

    setDownloads((current) => [...newItems, ...current]);

    newItems.forEach((item) => {
      void startDownload(item.id, item.url);
    });
  };

  const handleRetry = (id: number, url: string) => {
    void startDownload(id, url, true);
  };

  return (
    <Layout>
      <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
        <div className="space-y-6">
          <DownloadForm onSubmit={handleNewDownloads} />

          <Card className="border-border/50 bg-card/50 backdrop-blur-sm hidden lg:block">
            <CardHeader>
              <CardTitle className="text-lg">Tips</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>• Use direct links ending in .iso, .zip, .mp4, etc.</p>
              <p>• Downloads are streamed directly to your browser memory, then saved.</p>
              <p>• If the tab closes, the download is lost.</p>
            </CardContent>
          </Card>
        </div>

        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Active Downloads</h2>
            <span className="text-sm text-muted-foreground">{downloads.length} items</span>
          </div>

          <div className="space-y-4">
            {downloads.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center animate-in fade-in-50">
                <div className="mb-4 rounded-full bg-secondary/50 p-4">
                  <div className="i-lucide-download size-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">No downloads yet</h3>
                <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                  Paste your links on the left sidebar to get started. The VPS proxy will handle the connection.
                </p>
              </div>
            ) : (
              downloads.map((item) => (
                <DownloadItem
                  key={item.id}
                  item={item}
                  onRetry={handleRetry}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
}

export default App;
