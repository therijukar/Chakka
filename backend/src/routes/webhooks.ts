import type { FastifyInstance } from 'fastify';
import { TripStatus, UserRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireDriverPermission, requireFeature } from '../middleware/auth.js';
import { parseFastagEmail } from '../services/tollParserService.js';

// Compatible with Postmark, Mailgun, AWS SES, or generic JSON webhook forwarders
const inboundEmailSchema = z.object({
  to: z.string().min(3),
  from: z.string().optional(),
  subject: z.string().default(''),
  text: z.string().optional(),
  html: z.string().optional(),
  message_id: z.string().max(180).optional(),
});

function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match?.[1] ?? raw).trim().toLowerCase();
}

export async function webhookAndTollRoutes(app: FastifyInstance) {
  app.post('/api/webhooks/inbound-email', async (request, reply) => {
    const body = inboundEmailSchema.parse(request.body);
    const recipient = extractEmailAddress(body.to);

    const owner = await prisma.user.findUnique({
      where: { inboundTollEmail: recipient },
    });
    if (!owner) {
      return reply.status(404).send({
        error: { code: 'OWNER_NOT_FOUND', message: `No owner matches inbound email ${recipient}` },
      });
    }

    // Webhook idempotency via raw_email_id
    if (body.message_id) {
      const existing = await prisma.toll.findUnique({
        where: { rawEmailId: body.message_id },
      });
      if (existing) {
        return reply.status(200).send({ toll: existing, idempotent: true });
      }
    }

    const plainBody = body.text || (body.html ? body.html.replace(/<[^>]+>/g, ' ') : '');
    const parsed = parseFastagEmail({
      subject: body.subject,
      body: plainBody,
      from: body.from,
    });

    if (!parsed) {
      return reply.status(422).send({
        error: {
          code: 'PARSE_FAILED',
          message: 'Could not extract vehicle number or toll amount from email',
        },
      });
    }

    // Match vehicle_number -> owner's vehicle -> currently ACTIVE trip
    const vehicle = await prisma.vehicle.findUnique({
      where: {
        ownerId_vehicleNumber: {
          ownerId: owner.id,
          vehicleNumber: parsed.vehicle_number,
        },
      },
    });

    let activeTripId: string | null = null;
    if (vehicle) {
      const activeTrip = await prisma.trip.findFirst({
        where: {
          ownerId: owner.id,
          vehicleId: vehicle.id,
          status: TripStatus.ACTIVE,
        },
        orderBy: { startedAt: 'desc' },
      });
      activeTripId = activeTrip?.id ?? null;
    }

    const toll = await prisma.toll.create({
      data: {
        ownerId: owner.id,
        vehicleId: vehicle?.id ?? null,
        tripId: activeTripId,
        vehicleNumberRaw: parsed.vehicle_number,
        tollPlaza: parsed.toll_plaza,
        amount: parsed.amount_inr.toFixed(2),
        transactionTime: parsed.transaction_time,
        bankSource: parsed.bank_source,
        rawEmailId: body.message_id ?? null,
      },
    });

    return reply.status(201).send({
      toll,
      matched_vehicle: Boolean(vehicle),
      matched_active_trip: Boolean(activeTripId),
      idempotent: false,
    });
  });

  app.get(
    '/api/tolls',
    { preHandler: [requireFeature('featureFastagAutoSync'), requireDriverPermission('canViewTollHistory')] },
    async (request) => {
      const query = request.query as { trip_id?: string; vehicle_id?: string; unassigned?: string };

      let vehicleFilter = query.vehicle_id;
      if (request.user.role === UserRole.DRIVER) {
        const driver = await prisma.user.findUnique({
          where: { id: request.user.sub },
          select: { assignedVehicleId: true },
        });
        vehicleFilter = driver?.assignedVehicleId ?? undefined;
      }

      const tolls = await prisma.toll.findMany({
        where: {
          ownerId: request.user.ownerId,
          ...(query.trip_id ? { tripId: query.trip_id } : {}),
          ...(vehicleFilter ? { vehicleId: vehicleFilter } : {}),
          ...(query.unassigned === 'true' ? { tripId: null } : {}),
        },
        include: {
          vehicle: { select: { id: true, vehicleNumber: true } },
          trip: { select: { id: true, origin: true, destination: true } },
        },
        orderBy: { transactionTime: 'desc' },
      });

      return { tolls };
    },
  );

  // Parse & log FASTag Toll from Android SMS text
  app.post('/api/tolls/sms', { preHandler: [authenticate] }, async (request, reply) => {
    const body = z
      .object({
        sms_text: z.string().min(5).max(1000),
        sender: z.string().optional(),
        trip_id: z.string().uuid().optional(),
        sms_id: z.string().max(180).optional(),
      })
      .parse(request.body);

    if (body.sms_id) {
      const existing = await prisma.toll.findUnique({ where: { rawEmailId: body.sms_id } });
      if (existing) return reply.status(200).send({ toll: existing, idempotent: true });
    }

    const parsed = parseFastagEmail({
      subject: body.sender ?? 'FASTag SMS Alert',
      body: body.sms_text,
      from: body.sender,
    });

    if (!parsed) {
      return reply.status(422).send({
        error: { code: 'PARSE_FAILED', message: 'Could not extract vehicle number or toll amount from SMS' },
      });
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: {
        ownerId_vehicleNumber: {
          ownerId: request.user.ownerId,
          vehicleNumber: parsed.vehicle_number,
        },
      },
    });

    let activeTripId: string | null = body.trip_id ?? null;
    if (!activeTripId && vehicle) {
      const activeTrip = await prisma.trip.findFirst({
        where: {
          ownerId: request.user.ownerId,
          vehicleId: vehicle.id,
          status: TripStatus.ACTIVE,
        },
        orderBy: { startedAt: 'desc' },
      });
      activeTripId = activeTrip?.id ?? null;
    }

    const toll = await prisma.toll.create({
      data: {
        ownerId: request.user.ownerId,
        vehicleId: vehicle?.id ?? null,
        tripId: activeTripId,
        vehicleNumberRaw: parsed.vehicle_number,
        tollPlaza: parsed.toll_plaza,
        amount: parsed.amount_inr.toFixed(2),
        transactionTime: parsed.transaction_time,
        bankSource: parsed.bank_source,
        rawEmailId: body.sms_id ?? null,
      },
    });

    return reply.status(201).send({
      toll,
      matched_vehicle: Boolean(vehicle),
      matched_active_trip: Boolean(activeTripId),
    });
  });
}
