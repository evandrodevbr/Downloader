import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { z } from "zod";
import { request } from "undici";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const app = Fastify({
  logger: true,
});

// Registro de CORS básico para permitir o frontend em desenvolvimento/produção.
await app.register(cors, {
  origin: true,
});

// Servir frontend buildado (Vite) em produção, similar ao Next.js.
const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const clientDistPath = resolve(currentDir, "../../web/dist");

await app.register(fastifyStatic, {
  root: clientDistPath,
  prefix: "/",
  index: ["index.html"],
});

app.get("/health", async () => {
  return { status: "ok" };
});

const streamQuerySchema = z.object({
  url: z
    .string()
    .url("URL inválida")
    .refine(
      (value) => {
        // Evita SSRF localizando apenas http/https genérico.
        return value.startsWith("http://") || value.startsWith("https://");
      },
      { message: "Apenas URLs HTTP/HTTPS são permitidas." },
    ),
  // Offset opcional em bytes para retomar download dentro da mesma sessão.
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
      // timeout conservador, em produção pode ser configurável.
      headersTimeout: 15000,
    });

    if (headResponse.statusCode && headResponse.statusCode >= 400) {
      reply.status(502);
      return { error: "Não foi possível acessar o recurso de origem." };
    }

    const contentType =
      headResponse.headers["content-type"] ?? "application/octet-stream";
    const contentLength = headResponse.headers["content-length"];
    const originDisposition = headResponse.headers["content-disposition"];

    // Nome de arquivo derivado do header Content-Disposition ou da URL.
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

    const headers: Record<string, string> = {};
    if (typeof offset === "number" && Number.isFinite(offset) && offset > 0) {
      headers.Range = `bytes=${offset}-`;
    }

    // GET streaming da origem (possivelmente com Range para retomada).
    const originResponse = await request(url, {
      method: "GET",
      headers,
      headersTimeout: 30000,
      maxRedirections: 3,
    });

    if (!originResponse.body) {
      reply.status(502);
      return { error: "Resposta de origem sem corpo para streaming." };
    }

    if (originResponse.statusCode && originResponse.statusCode >= 400) {
      reply.status(originResponse.statusCode);
      return { error: "Falha ao obter o arquivo de origem." };
    }

    const normalizedLength = Array.isArray(contentLength)
      ? contentLength[0]
      : contentLength;

    // Configura headers de resposta para o cliente final.
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

    // Entregamos o stream diretamente para o Fastify gerenciar (pipe + backpressure).
    return reply.send(originResponse.body);
  } catch (error) {
    requestFastify.log.error(
      { err: error, url },
      "Erro durante o streaming do arquivo",
    );
    if (!reply.sent) {
      // Em caso de falha antes de iniciar o streaming, respondemos com JSON.
      return reply
        .status(502)
        .send({ error: "Erro ao realizar o proxy do arquivo." });
    }
    // Se a resposta já foi enviada/fechada, apenas não fazemos mais nada.
  }
});

// Fallback para SPA: qualquer rota GET não atendida cai no index.html.
app.setNotFoundHandler((requestFastify, reply) => {
  if (requestFastify.method === "GET") {
    return reply.sendFile("index.html");
  }

  reply.status(404).send({ error: "Recurso não encontrado." });
});

const port = Number(process.env.PORT) || 3000;

try {
  await app.listen({
    port,
    host: "0.0.0.0",
  });
  app.log.info(`Server listening on port ${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

