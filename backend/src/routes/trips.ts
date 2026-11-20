import type { FastifyInstance } from 'fastify';
import { ApprovalStatus, SyncEntityType, SyncStatus, TripStatus, UserRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireDriverPermission, requireOwner } from '../middleware/auth.js';
import { computeTripAnalytics, toNumber } from '../utils/formatters.js';

const createTripSchema = z.object({
  client_id: z.string().min(4).max(64),
  vehicle_id: z.string().uuid(),
  driver_id: z.string().uuid().optional(),
  origin: z.string().min(2).max(180),
  destination: z.string().min(2).max(180),
  party_name: z.string().max(180).optional(),
  agreed_freight: z.coerce.number().nonnegative().default(0),
  advance_received: z.coerce.number().nonnegative().default(0),
  driver_advance: z.coerce.number().nonnegative().default(0),
  driver_bata: z.coerce.number().nonnegative().default(0),
  start_odometer_km: z.coerce.number().nonnegative().optional(),
  start_odometer_photo_url: z.string().max(512).optional(),
  start_lat: z.coerce.number().min(-90).max(90).optional(),
  start_lng: z.coerce.number().min(-180).max(180).optional(),
  started_at: z.string().datetime().optional(),
  status: z.nativeEnum(TripStatus).optional(),
  notes: z.string().optional(),
});

const startTripSchema = z.object({
  start_odometer_km: z.coerce.number().nonnegative(),
  start_odometer_photo_url: z.string().max(512).optional(),
  start_lat: z.coerce.number().min(-90).max(90).optional(),
  start_lng: z.coerce.number().min(-180).max(180).optional(),
  started_at: z.string().datetime().optional(),
});

const endTripSchema = z.object({
  end_odometer_km: z.coerce.number().nonnegative(),
  end_odometer_photo_url: z.string().max(512).optional(),
  end_lat: z.coerce.number().min(-90).max(90).optional(),
  end_lng: z.coerce.number().min(-180).max(180).optional(),
  ended_at: z.string().datetime().optional(),
});

export async function tripRoutes(app: FastifyInstance) {
  app.get('/api/trips', { preHandler: [authenticate] }, async (request) => {
    const query = request.query as { status?: TripStatus; vehicle_id?: string; driver_id?: string };

    const where = {
      ownerId: request.user.ownerId,
      ...(request.user.role === UserRole.DRIVER ? { driverId: request.user.sub } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.vehicle_id ? { vehicleId: query.vehicle_id } : {}),
      ...(query.driver_id && request.user.role === UserRole.OWNER ? { driverId: query.driver_id } : {}),
    };

    const trips = await prisma.trip.findMany({
      where,
      include: {
        vehicle: { select: { id: true, vehicleNumber: true, makeModel: true, baselineMileageKmpl: true } },
        driver: { select: { id: true, name: true, phone: true } },
        _count: { select: { expenses: true, tolls: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { trips };
  });

  // Idempotent Trip creation (supports both Owner creating planned trips & Driver offline Start Trip)
  app.post(
    '/api/trips',
    { preHandler: [requireDriverPermission('canStartEndTrip')] },
    async (request, reply) => {
      const body = createTripSchema.parse(request.body);

      // Idempotency check on client_id
      const existing = await prisma.trip.findUnique({
        where: { clientId: body.client_id },
        include: { vehicle: true, driver: { select: { id: true, name: true, phone: true } } },
      });
      if (existing) {
        return reply.status(200).send({ trip: existing, idempotent: true });
      }

      const driverId =
        request.user.role === UserRole.DRIVER ? request.user.sub : (body.driver_id ?? request.user.sub);
      const balancePending = Math.max(0, body.agreed_freight - body.advance_received);
      const isStartingNow = body.start_odometer_km !== undefined || body.status === TripStatus.ACTIVE;

      const trip = await prisma.trip.create({
        data: {
          clientId: body.client_id,
          ownerId: request.user.ownerId,
          vehicleId: body.vehicle_id,
          driverId,
          origin: body.origin,
          destination: body.destination,
          partyName: body.party_name,
          agreedFreight: body.agreed_freight.toFixed(2),
          advanceReceived: body.advance_received.toFixed(2),
          balancePending: balancePending.toFixed(2),
          driverAdvance: body.driver_advance.toFixed(2),
          driverBata: body.driver_bata.toFixed(2),
          startOdometerKm: body.start_odometer_km !== undefined ? body.start_odometer_km.toFixed(2) : null,
          startOdometerPhotoUrl: body.start_odometer_photo_url,
          startLat: body.start_lat !== undefined ? body.start_lat.toFixed(7) : null,
          startLng: body.start_lng !== undefined ? body.start_lng.toFixed(7) : null,
          startedAt: isStartingNow ? (body.started_at ? new Date(body.started_at) : new Date()) : null,
          status: body.status ?? (isStartingNow ? TripStatus.ACTIVE : TripStatus.PLANNED),
          notes: body.notes,
        },
        include: { vehicle: true, driver: { select: { id: true, name: true, phone: true } } },
      });

      await prisma.syncLog.create({
        data: {
          clientId: body.client_id,
          userId: request.user.sub,
          entityType: SyncEntityType.TRIP,
          status: SyncStatus.SYNCED,
        },
      });

      if (body.advance_received > 0) {
        await prisma.tripPayment.create({
          data: {
            tripId: trip.id,
            ownerId: request.user.ownerId,
            amount: body.advance_received.toFixed(2),
            paymentMode: 'ADVANCE',
            note: 'Initial advance at trip creation',
          },
        });
      }

      if (body.driver_advance > 0 && driverId) {
        await prisma.driverAdvanceEntry.create({
          data: {
            ownerId: request.user.ownerId,
            driverId,
            tripId: trip.id,
            type: 'GIVEN',
            amount: body.driver_advance.toFixed(2),
            note: `Trip advance: ${trip.origin} → ${trip.destination}`,
          },
        });
      }

      return reply.status(201).send({ trip, idempotent: false });
    },
  );

  app.post(
    '/api/trips/:id/start',
    { preHandler: [requireDriverPermission('canStartEndTrip')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = startTripSchema.parse(request.body);

      const trip = await prisma.trip.findFirst({
        where: {
          id,
          ownerId: request.user.ownerId,
          ...(request.user.role === UserRole.DRIVER ? { driverId: request.user.sub } : {}),
        },
      });
      if (!trip) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Trip not found' } });
      }

      const updated = await prisma.trip.update({
        where: { id },
        data: {
          startOdometerKm: body.start_odometer_km.toFixed(2),
          startOdometerPhotoUrl: body.start_odometer_photo_url ?? trip.startOdometerPhotoUrl,
          startLat: body.start_lat !== undefined ? body.start_lat.toFixed(7) : trip.startLat,
          startLng: body.start_lng !== undefined ? body.start_lng.toFixed(7) : trip.startLng,
          startedAt: body.started_at ? new Date(body.started_at) : new Date(),
          status: TripStatus.ACTIVE,
        },
      });
      return { trip: updated };
    },
  );

  app.post(
    '/api/trips/:id/end',
    { preHandler: [requireDriverPermission('canStartEndTrip')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = endTripSchema.parse(request.body);

      const trip = await prisma.trip.findFirst({
        where: {
          id,
          ownerId: request.user.ownerId,
          ...(request.user.role === UserRole.DRIVER ? { driverId: request.user.sub } : {}),
        },
      });
      if (!trip) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Trip not found' } });
      }

      const updated = await prisma.trip.update({
        where: { id },
        data: {
          endOdometerKm: body.end_odometer_km.toFixed(2),
          endOdometerPhotoUrl: body.end_odometer_photo_url ?? trip.endOdometerPhotoUrl,
          endLat: body.end_lat !== undefined ? body.end_lat.toFixed(7) : trip.endLat,
          endLng: body.end_lng !== undefined ? body.end_lng.toFixed(7) : trip.endLng,
          endedAt: body.ended_at ? new Date(body.ended_at) : new Date(),
          status: TripStatus.COMPLETED,
        },
      });
      return { trip: updated };
    },
  );

  app.post('/api/trips/:id/close', { preHandler: [requireOwner] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.trip.findFirst({
      where: { id, ownerId: request.user.ownerId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    }

    const updated = await prisma.trip.update({
      where: { id },
      data: { status: TripStatus.CLOSED },
    });
    return { trip: updated };
  });

  app.get('/api/trips/:id/pnl', { preHandler: [requireOwner] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const trip = await prisma.trip.findFirst({
      where: { id, ownerId: request.user.ownerId },
        include: {
        vehicle: true,
        driver: { select: { id: true, name: true, phone: true } },
        expenses: { include: { category: true } },
        tolls: true,
        payments: { orderBy: { receivedAt: 'desc' } },
      },
    });
    if (!trip) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    }

    let fuelTotal = 0;
    let totalFuelLiters = 0;
    let approvedOtherExpenses = 0;

    for (const exp of trip.expenses) {
      if (exp.approvalStatus === ApprovalStatus.REJECTED) continue;
      if (exp.category.isFuel) {
        if (exp.approvalStatus === ApprovalStatus.APPROVED) {
          fuelTotal += toNumber(exp.amount);
          totalFuelLiters += toNumber(exp.liters);
        }
      } else if (exp.approvalStatus === ApprovalStatus.APPROVED) {
        approvedOtherExpenses += toNumber(exp.amount);
      }
    }

    const tollsTotal = trip.tolls.reduce((sum, t) => sum + toNumber(t.amount), 0);

    const pnl = computeTripAnalytics({
      agreedFreight: toNumber(trip.agreedFreight),
      fuelTotal,
      tollsTotal,
      approvedOtherExpenses,
      startOdometerKm: trip.startOdometerKm ? toNumber(trip.startOdometerKm) : null,
      endOdometerKm: trip.endOdometerKm ? toNumber(trip.endOdometerKm) : null,
      totalFuelLiters,
      baselineMileageKmpl: toNumber(trip.vehicle.baselineMileageKmpl),
    });

    return {
      trip,
      pnl: {
        ...pnl,
        advance_received: toNumber(trip.advanceReceived),
        balance_pending: toNumber(trip.balancePending),
        driver_advance: toNumber(trip.driverAdvance),
        driver_bata: toNumber(trip.driverBata),
      },
    };
  });

  // Incoming Freight Payments (mid-trip or post-trip) -> auto-recalculates balancePending
  app.post('/api/trips/:id/payments', { preHandler: [requireOwner] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        amount: z.coerce.number().positive(),
        payment_mode: z.enum(['CASH', 'UPI', 'BANK', 'CHEQUE']).default('CASH'),
        note: z.string().max(255).optional(),
        received_at: z.string().datetime().optional(),
      })
      .parse(request.body);

    const existing = await prisma.trip.findFirst({
      where: { id, ownerId: request.user.ownerId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    }

    const payment = await prisma.tripPayment.create({
      data: {
        tripId: id,
        ownerId: request.user.ownerId,
        amount: body.amount.toFixed(2),
        paymentMode: body.payment_mode,
        note: body.note,
        receivedAt: body.received_at ? new Date(body.received_at) : new Date(),
      },
    });

    const newAdvanceReceived = toNumber(existing.advanceReceived) + body.amount;
    const newBalancePending = Math.max(0, toNumber(existing.agreedFreight) - newAdvanceReceived);

    const updatedTrip = await prisma.trip.update({
      where: { id },
      data: {
        advanceReceived: newAdvanceReceived.toFixed(2),
        balancePending: newBalancePending.toFixed(2),
      },
    });

    return reply.status(201).send({ payment, trip: updatedTrip });
  });
}
