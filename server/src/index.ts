import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { z } from "zod";
import { Agent, setGlobalDispatcher } from "undici";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { sessionManager } from "./lib/SessionManager";
import { DownloadManager } from "./lib/DownloadManager";

// Otimização: Agente HTTP global com conexões persistentes e timeout relaxado.
// Isso ajuda a manter a performance em downloads paralelos e evita gargalos de socket.
const agent = new Agent({
  connect: {
    timeout: 30_000,
  },
  pipelining: 1,
  keepAliveTimeout: 10_000,
  connections: 500, // Aumenta limite de conexões simultâneas
});

setGlobalDispatcher(agent);

const app = Fastify({
  logger: true,
  disableRequestLogging: true, // Reduz ruído de log em transferências grandes
});

// Registro de CORS básico para permitir o frontend em desenvolvimento/produção.
await app.register(cors, {
  origin: true,
});

// Servir frontend buildado (Vite) em produção.
const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const clientDistPath = resolve(currentDir, "../../web/dist");

await app.register(fastifyStatic, {
  root: clientDistPath,
  prefix: "/",
  index: ["index.html"],
});

// Rota explícita para a SPA.
app.get("/", (_request, reply) => {
  return reply.sendFile("index.html");
});

app.get("/health", async () => {
  return { status: "ok" };
});

const streamQuerySchema = z.object({
  url: z.string().url("URL inválida").startsWith("http", "Apenas HTTP/HTTPS permitidos"),
  // Offset opcional em bytes para retomar download.
  offset: z
    .string()
    .regex(/^\d+$/)
    .transform((value) => Number.parseInt(value, 10))
    .optional(),
});

const downloadManager = new DownloadManager(agent);

// Helper to get session from header
const getSession = (req: FastifyRequest, reply: FastifyReply) => {
  const authHeader = req.headers["x-session-id"];
  const id = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const session = sessionManager.getSession(id);

  // Return the ID for the client to store if it's new
  reply.header("x-session-id", session.id);
  return session;
};

// 1. Session Status & Timer
app.get("/api/session", async (request, reply) => {
  const session = getSession(request, reply);
  return {
    sessionId: session.id,
    expiresAt: sessionManager.getExpiresAt(session.id),
    remainingMs: sessionManager.getSessionTimeRemaining(session.id),
  };
});

// 2. Queue Download
const queueSchema = z.object({
  url: z.string().url(),
});

app.post("/api/queue", async (request, reply) => {
  const session = getSession(request, reply);

  const parse = queueSchema.safeParse(request.body);
  if (!parse.success) return reply.status(400).send({ error: "Invalid URL" });

  const task = await downloadManager.queueDownload(session.id, parse.data.url);
  return task;
});

// 3. List Tasks (Polling)
app.get("/api/tasks", async (request, reply) => {
  const session = getSession(request, reply);
  const tasks = downloadManager.getTasks(session.id);
  return tasks;
});

// 4. Download Completed File (Local -> User)
app.get("/api/download/:taskId", async (request, reply) => {
  const session = getSession(request, reply);
  const { taskId } = request.params as { taskId: string };

  const task = downloadManager.getTask(taskId);

  if (!task) return reply.status(404).send({ error: "Task not found" });
  if (task.sessionId !== session.id) return reply.status(403).send({ error: "Unauthorized" });
  if (task.status !== "completed") return reply.status(400).send({ error: "Download not ready" });

  const sessionPath = sessionManager.getSessionPath(session.id);
  const filePath = resolve(sessionPath, `${task.id}_${task.filename}`);

  try {
    sessionManager.touch(session.id); // Reset timer on interaction
    return reply.download(filePath, task.filename); // requires @fastify/static or sendFile
  } catch (e) {
    return reply.status(404).send({ error: "File removed or missing" });
  }
});

// Legacy Stream (Redirect or Deprecate)
app.get("/stream", async (req, reply) => {
  reply.status(410).send({ error: "Direct streaming is deprecated. Use the new Dashboard." });
});

// Fallback para SPA.
app.setNotFoundHandler((requestFastify, reply) => {
  if (requestFastify.method === "GET") {
    return reply.sendFile("index.html");
  }
  reply.status(404).send({ error: "Endpoint não encontrado." });
});

const port = Number(process.env.PORT) || 3000;

try {
  await app.listen({
    port,
    host: "0.0.0.0",
  });
  console.log(`🚀 Server running on port ${port}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}

