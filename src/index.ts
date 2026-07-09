import "dotenv/config";

import fastifyCors from "@fastify/cors";
import fastifySwagger from "@fastify/swagger";
import fastifyApiReference from "@scalar/fastify-api-reference";
import { fromNodeHeaders } from "better-auth/node";
import Fastify from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import z, { uuid } from "zod";

import { Weekday } from "./generated/prisma/enums.js";
import { auth } from "./lib/auth.js";
import { CreateWorkoutPlan } from "./usecases/CreateWourkoutPlan.js";

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

await app.register(fastifyCors, {
  origin: "http://localhost:3000",
  credentials: true,
});

await app.register(fastifyApiReference, {
  routePrefix: "/docs",
  configuration: {
    sources: [
      {
        title: "Treinos API",
        slug: "Treinos-api",
        url: "/docs/openapi.json",
      },
      {
        title: "Auth API",
        slug: "auth-api",
        url: "/api/auth/open-api/generate-schema",
      },
    ],
  },
});

app.withTypeProvider<ZodTypeProvider>().route({
  method: "POST",
  url: "/workout-plans",
  schema: {
    body: z.object({
      name: z.string().trim().min(1),
      workoutDays: z.array(
        z.object({
          name: z.string().trim().min(1),
          weekday: z.enum(Weekday),
          isRest: z.boolean().default(false),
          estimatedDurationInSeconds: z.number().int().min(1),
          exercises: z.array(
            z.object({
              order: z.number().min(0),
              name: z.string().trim().min(1),
              sets: z.number().min(1),
              reps: z.number().min(1),
              restTimeSeconds: z.number().min(1),
            }),
          ),
        }),
      ),
    }),

    response: {
      201: z.object({
        id: uuid(),
        name: z.string().trim().min(1),
        userId: uuid(),
        isActive: z.boolean(),
        createdAt: z.date(),
        updateAt: z.date(),
        workoutDays: z.array(
          z.object({
            id: uuid(),
            name: z.string().trim().min(1),
            workoutPlanId: uuid(),
            isRest: z.boolean(),
            weekday: z.enum(Weekday),
            estimatedDurationInSeconds: z.number().int().min(1),
            createdAt: z.date(),
            updateAt: z.date(),
            exercises: z.array(
              z.object({
                id: uuid(),
                order: z.number().min(0),
                name: z.string().trim().min(1),
                workoutDayId: uuid(),
                sets: z.number().min(1),
                reps: z.number().min(1),
                restTimeSeconds: z.number().min(1),
                createdAt: z.date(),
                updateAt: z.date(),
              }),
            ),
          }),
        ),
      }),
      400: z.object({
        error: z.string(),
        code: z.string(),
      }),
      401: z.object({
        error: z.string(),
        code: z.string(),
      }),
      500: z.object({
        error: z.string(),
        code: z.string(),
      }),
    },
  },
  handler: async (request, reply) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });
      if (!session) {
        return reply.status(401).send({
          error: "Unauthorized",
          code: "UNAUTHORIZED",
        });
      }
      const createWorkoutPlan = new CreateWorkoutPlan();
      const result = await createWorkoutPlan.execute({
        userId: session.user.id,
        name: request.body.name,
        workoutDays: request.body.workoutDays,
      });
      return reply.status(201).send(result);
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      });
    }
  },
});

    

app.withTypeProvider<ZodTypeProvider>().route({
  method: "GET",
  url: "/swagger.json",
  schema: {
    hide: true,
  },
  handler: async () => {
    return app.swagger();
  },
});

app.withTypeProvider<ZodTypeProvider>().route({
  method: "GET",
  url: "/",
  schema: {
    hide: true,
  },
  handler: async () => {
    return { message: "API is running" };
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
