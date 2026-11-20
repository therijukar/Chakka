import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { authRoutes } from './routes/auth.js';
import { fleetRoutes } from './routes/fleet.js';
import { tripRoutes } from './routes/trips.js';
import { expenseRoutes } from './routes/expenses.js';
import { emiAndComplianceRoutes } from './routes/emis.js';
import { documentRoutes } from './routes/documents.js';
import { ocrRoutes } from './routes/ocr.js';
import { webhookAndTollRoutes } from './routes/webhooks.js';
import { adminRoutes } from './routes/admin.js';

export function buildServer() {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
  });

  app.register(cors, { origin: true });
  app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });
  app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB max for PDFs/docs
    },
  });

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request payload',
          details: err.flatten().fieldErrors,
        },
      });
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return reply.status(409).send({
          error: {
            code: 'CONFLICT',
            message: 'A record with this unique value already exists',
            details: err.meta,
          },
        });
      }
      if (err.code === 'P2025') {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Requested record was not found' },
        });
      }
    }

    app.log.error(err);
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    return reply.status(statusCode).send({
      error: {
        code: statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR',
        message: err instanceof Error ? err.message : 'Unexpected server error',
      },
    });
  });

  app.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', service: 'fleet-backend', timestamp: new Date().toISOString() };
  });

  app.register(authRoutes);
  app.register(fleetRoutes);
  app.register(tripRoutes);
  app.register(expenseRoutes);
  app.register(emiAndComplianceRoutes);
  app.register(documentRoutes);
  app.register(ocrRoutes);
  app.register(webhookAndTollRoutes);
  app.register(adminRoutes);

  return app;
}
