import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { request } from "undici";
import { pipeline } from "node:stream/promises";
const app = Fastify({
    logger: true,
});
// Registro de CORS básico para permitir o frontend em desenvolvimento/produção.
await app.register(cors, {
    origin: true,
});
app.get("/health", async () => {
    return { status: "ok" };
});
const streamQuerySchema = z.object({
    url: z
        .string()
        .url("URL inválida")
        .refine((value) => {
        // Evita SSRF localizando apenas http/https genérico.
        return value.startsWith("http://") || value.startsWith("https://");
    }, { message: "Apenas URLs HTTP/HTTPS são permitidas." }),
});
app.get("/stream", async (requestFastify, reply) => {
    const parseResult = streamQuerySchema.safeParse(requestFastify.query);
    if (!parseResult.success) {
        const firstError = parseResult.error.errors[0]?.message ?? "Parâmetros inválidos";
        reply.status(400);
        return { error: firstError };
    }
    const { url } = parseResult.data;
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
        const contentType = headResponse.headers["content-type"] ?? "application/octet-stream";
        const contentLength = headResponse.headers["content-length"];
        const originDisposition = headResponse.headers["content-disposition"];
        // Nome de arquivo derivado do header Content-Disposition ou da URL.
        const fallbackName = (() => {
            try {
                const parsedUrl = new URL(url);
                const nameFromPath = parsedUrl.pathname.split("/").filter(Boolean).pop();
                return nameFromPath ?? "download.bin";
            }
            catch {
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
        // GET streaming da origem.
        const originResponse = await request(url, {
            method: "GET",
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
        // Configura headers de resposta para o cliente final.
        reply.headers({
            "Content-Type": Array.isArray(contentType) ? contentType[0] : contentType,
            ...(contentLength
                ? {
                    "Content-Length": Array.isArray(contentLength)
                        ? contentLength[0]
                        : contentLength,
                }
                : {}),
            "Content-Disposition": `attachment; filename="${filename}"`,
        });
        // Se o cliente fechar a conexão, garantimos o encerramento do stream de origem.
        reply.raw.on("close", () => {
            originResponse.body?.destroy();
        });
        // Conecta o stream de origem diretamente ao socket do cliente.
        await pipeline(originResponse.body, reply.raw);
        // Fastify exige que retornemos void quando manipulamos reply.raw diretamente.
        return reply;
    }
    catch (error) {
        requestFastify.log.error({ err: error, url }, "Erro durante o streaming do arquivo");
        if (!reply.sent) {
            reply.status(502);
            return { error: "Erro ao realizar o proxy do arquivo." };
        }
        return reply;
    }
});
const port = Number(process.env.PORT) || 3000;
try {
    await app.listen({
        port,
        host: "0.0.0.0",
    });
    app.log.info(`Server listening on port ${port}`);
}
catch (err) {
    app.log.error(err);
    process.exit(1);
}
