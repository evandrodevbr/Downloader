import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { z } from "zod";
import { Agent, setGlobalDispatcher, request } from "undici";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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

app.get("/stream", async (requestFastify, reply) => {
  const parseResult = streamQuerySchema.safeParse(requestFastify.query);

  if (!parseResult.success) {
    const firstError = parseResult.error.errors[0]?.message ?? "Parâmetros inválidos";
    reply.status(400);
    return { error: firstError };
  }

  const { url, offset } = parseResult.data;

  try {
    // HEAD para validar link e obter metadados.
    const headResponse = await request(url, {
      method: "HEAD",
      headersTimeout: 15000,
      headers: {
        "User-Agent": "Ephemeral-Downloader/1.0",
      },
      dispatcher: agent,
    });

    if (headResponse.statusCode && headResponse.statusCode >= 400) {
      reply.status(502);
      return { error: `Erro na origem: ${headResponse.statusCode}` };
    }

    const contentType =
      headResponse.headers["content-type"] ?? "application/octet-stream";
    const contentLength = headResponse.headers["content-length"];
    const originDisposition = headResponse.headers["content-disposition"];

    // Nome de arquivo fallback.
    const fallbackName = (() => {
      try {
        const parsedUrl = new URL(url);
        const nameFromPath = parsedUrl.pathname.split("/").filter(Boolean).pop();
        return nameFromPath ?? "download.bin";
      } catch {
        return "download.bin";
      }
    })();

    const filename = (() => {
      if (typeof originDisposition === "string") {
        const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(originDisposition);
        if (match?.[1]) {
          return decodeURIComponent(match[1].replace(/"/g, ""));
        }
      }
      return fallbackName;
    })();

    const headers: Record<string, string> = {
      "User-Agent": "Ephemeral-Downloader/1.0",
    };

    if (typeof offset === "number" && Number.isFinite(offset) && offset > 0) {
      headers.Range = `bytes=${offset}-`;
    }

    // GET streaming da origem.
    const originResponse = await request(url, {
      method: "GET",
      headers,
      headersTimeout: 30000,
      maxRedirections: 5,
      dispatcher: agent,
    });

    if (!originResponse.body) {
      reply.status(502);
      return { error: "Sem corpo de resposta na origem." };
    }

    if (originResponse.statusCode && originResponse.statusCode >= 400) {
      reply.status(originResponse.statusCode);
      return { error: "Falha ao baixar arquivo da origem." };
    }

    const normalizedLength = Array.isArray(contentLength)
      ? contentLength[0]
      : contentLength;

    // Configura headers de resposta.
    reply.headers({
      "Content-Type": Array.isArray(contentType) ? contentType[0] : contentType,
      ...(normalizedLength
        ? {
          "Content-Length": normalizedLength,
          "X-Origin-Content-Length": normalizedLength,
        }
        : {}),
      "Content-Disposition": `attachment; filename="${filename}"`,
    });

    // Pipe direto.
    return reply.send(originResponse.body);
  } catch (error) {
    requestFastify.log.error({ err: error, url }, "Erro no proxy");
    if (!reply.sent) {
      return reply.status(502).send({ error: "Erro interno no proxy." });
    }
  }
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

