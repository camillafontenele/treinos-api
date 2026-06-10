import "dotenv/config";

import fastifyCors from "@fastify/cors";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { fromNodeHeaders } from "better-auth/node";
import Fastify from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import z from "zod";

import { auth } from "./lib/auth.js";

const app = Fastify({
  logger: true,
});

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

await app.register(fastifySwagger, {
  openapi: {
    info: {
      title: "App de Treinos",
      description: "API para gerenciamento de treinos",
      version: "1.0.0",
    },
    servers: [
      {
        description: "Servidor local",
        url: "http://localhost:3000",
      },
    ],
  },

  transform: jsonSchemaTransform,
});

await app.register(fastifySwaggerUi, {
  routePrefix: "/docs",
});

await app.register(fastifyCors, {
  origin: "http://localhost:3000",
  credentials: true,
});

app.withTypeProvider<ZodTypeProvider>().route({
  method: "GET",
  url: "/",
  schema: {
    description: "Hello world",
    tags: ["hello World"],
    response: {
      200: z.object({
        message: z.string(),
      }),
    },
  },
  handler: () => {
    return { message: "Hello world" };
  },
});

app.route({
  method: ["GET", "POST"],
  url: "/api/auth/*",
  async handler(request, reply) {
    try {
      // Construct request URL
      const url = new URL(request.url, `http://${request.headers.host}`);

      // Convert Fastify headers to standard Headers object
      const headers = fromNodeHeaders(request.headers);
      // Create Fetch API-compatible request
      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });
      // Process authentication request
      const response = await auth.handler(req);
      // Forward response to client
      reply.status(response.status);
      response.headers.forEach((value: string, key: string) =>
        reply.header(key, value),
      );
      return reply.send(response.body ? await response.text() : null);
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Internal authentication error",
        code: "AUTH_FAILURE",
      });
    }
  },
});

try {
  await app.listen({ port: Number(process.env.PORT) || 3000 });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
