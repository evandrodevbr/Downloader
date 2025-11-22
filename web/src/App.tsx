import { useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

type DownloadStatus = "pending" | "downloading" | "completed" | "error";

type DownloadItem = {
  id: number;
  url: string;
  status: DownloadStatus;
  progress: number | null;
  receivedBytes?: number;
  totalBytes?: number;
  speedBytesPerSecond?: number;
  error?: string;
};

const formatBytes = (bytes: number | undefined): string => {
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

const formatSpeed = (bytesPerSecond: number | undefined): string => {
  if (!bytesPerSecond || !Number.isFinite(bytesPerSecond)) return "- / -";
  const mbPerSecond = bytesPerSecond / (1024 * 1024);
  const mbitPerSecond = (bytesPerSecond * 8) / 1_000_000;
  return `${mbPerSecond.toFixed(2)} MB/s · ${mbitPerSecond.toFixed(2)} Mbps`;
};

function App() {
  const [urlsText, setUrlsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);

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
        const message = "Falha ao iniciar o download.";
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

      // Atualiza progresso incrementalmente conforme os bytes chegam.
      // Para manter o código claro, usamos um loop while padrão.
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
            current.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    progress: percentage,
                    receivedBytes: received,
                    totalBytes: totalBytes || item.totalBytes,
                    speedBytesPerSecond: bytesPerSecond,
                  }
                : item,
            ),
          );
        }
      }

      const contentType =
        response.headers.get("content-type") ?? "application/octet-stream";
      const blob = new Blob(chunks, { type: contentType });

      // Resolve nome do arquivo pelo header Content-Disposition ou pela URL.
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
        err instanceof Error ? err.message : "Erro inesperado durante o download.";
      setDownloads((current) =>
        current.map((item) =>
          item.id === itemId
            ? { ...item, status: "error", error: message, progress: null }
            : item,
        ),
      );
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const urls = urlsText
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      setError("Informe ao menos uma URL de download direto (uma por linha).");
      return;
    }

    const invalidUrl = urls.find((value) => {
      try {
        // eslint-disable-next-line no-new
        new URL(value);
        return false;
      } catch {
        return true;
      }
    });

    if (invalidUrl) {
      setError(`URL inválida detectada: ${invalidUrl}`);
      return;
    }

    const baseId = Date.now();
    const newItems: DownloadItem[] = urls.map((value, index) => ({
      id: baseId + index,
      url: value,
      status: "pending",
      progress: 0,
    }));

    setDownloads((current) => [...newItems, ...current]);

    newItems.forEach((item) => {
      void startDownload(item.id, item.url);
    });
  };

  return (
    <div className="app-root">
      <header className="app-header">
        <h1>Ephemeral Downloader</h1>
        <p>Proxy de download efêmero com streaming direto da origem para você.</p>
        <div className="app-header-meta">
          <span>Use a rota e peering da sua VPS a seu favor.</span>
          <span>Ideal para ROMs, ISOs e arquivos grandes.</span>
        </div>
      </header>

      <main className="app-main">
        <form className="download-form" onSubmit={handleSubmit}>
          <label htmlFor="url-input" className="field-label">
            Links diretos dos arquivos
          </label>
          <p className="field-helper">
            Uma URL por linha. Aceita links HTTP/HTTPS diretos para arquivos.
          </p>
          <textarea
            id="url-input"
            placeholder={
              "https://exemplo.com/arquivo-1.iso\nhttps://exemplo.com/arquivo-2.zip"
            }
            value={urlsText}
            onChange={(event) => setUrlsText(event.target.value)}
            className="url-input url-input--multiline"
            rows={5}
          />

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="primary-button">
            Iniciar download
          </button>
        </form>

        <section className="downloads-section" aria-label="Progresso dos downloads">
          <h2 className="downloads-title">Downloads recentes</h2>

          {downloads.length === 0 ? (
            <p className="downloads-empty">
              Nenhum download ativo ainda. Cole um ou mais links diretos ao lado e clique em
              &nbsp;
              <strong>Iniciar download</strong>
              &nbsp;para começar.
            </p>
          ) : (
            <ul className="downloads-list">
              {downloads.map((item) => (
                <li key={item.id} className="download-item">
                  <div className="download-main">
                    <p className="download-url" title={item.url}>
                      {item.url}
                    </p>
                    <span className={`badge badge--${item.status}`}>
                      {item.status === "pending" && "Pendente"}
                      {item.status === "downloading" && "Baixando"}
                      {item.status === "completed" && "Concluído"}
                      {item.status === "error" && "Erro"}
                    </span>
                  </div>

                  {item.progress !== null && (
                    <div className="progress-wrapper">
                      <div className="progress-bar">
                        <div
                          className="progress-bar__fill"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <span className="progress-label">
                        {item.progress}%
                      </span>
                    </div>
                  )}

                  {(item.receivedBytes ?? 0) > 0 && (
                    <p className="download-meta">
                      <span>
                        {formatBytes(item.receivedBytes)} /{" "}
                        {formatBytes(item.totalBytes)}
                      </span>
                      <span>·</span>
                      <span>{formatSpeed(item.speedBytesPerSecond)}</span>
                    </p>
                  )}

                  {item.error && (
                    <div className="download-footer">
                      <p className="download-error">
                        {item.error}
                      </p>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          void startDownload(item.id, item.url, true);
                        }}
                      >
                        Retomar download
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
