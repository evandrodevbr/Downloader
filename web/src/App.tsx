import "./App.css";
import { DownloadForm } from "./components/feature/DownloadForm";
import { DownloadItem } from "./components/feature/DownloadItem";
import { Layout } from "./components/ui/Layout";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/Alert";
import { AlertCircle } from "lucide-react";
import { SessionProvider, useSession } from "./context/SessionContext";
import { SessionTimer } from "./components/feature/SessionTimer";

function DownloadList() {
  const { tasks, expiresAt } = useSession();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Active Downloads</h2>
        <SessionTimer expiresAt={expiresAt} />
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg bg-card/50">
          <p>No downloads in session</p>
          <p className="text-xs opacity-70">Files are removed after 1 hour of inactivity</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {tasks.map((task) => (
            <DownloadItem key={task.id} item={task} />
          ))}
        </div>
      )}
    </div>
  );
}

function Main() {
  const { queueDownload } = useSession();

  const handleDownload = async (url: string) => {
    try {
      await queueDownload(url);
    } catch (error) {
      console.error("Failed to queue", error);
    }
  };

  return (
    <Layout>
      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left Column: Input Form */}
        <div className="lg:col-span-4 space-y-6">
          <div className="sticky top-24 space-y-6">
            <section className="space-y-4">
              <div className="space-y-2">
                <h2 className="text-xl font-semibold tracking-tight">New Download</h2>
                <p className="text-sm text-muted-foreground">
                  Paste a link to start. Files are downloaded to the server first.
                </p>
              </div>
              <DownloadForm onDownload={handleDownload} />
            </section>

            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Ephemeral Session</AlertTitle>
              <AlertDescription>
                Files are stored for <strong>1 hour</strong>. The timer resets on interaction.
                After expiration, all files are permanently deleted.
              </AlertDescription>
            </Alert>
          </div>
        </div>

        {/* Right Column: Downloads List */}
        <div className="lg:col-span-8">
          <DownloadList />
        </div>
      </div>
    </Layout>
  );
}

function App() {
  return (
    <SessionProvider>
      <Main />
    </SessionProvider>
  );
}

export default App;
