import type { FastifyInstance } from 'fastify';
import { ApprovalStatus, LanguageCode, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, checkOwnerQuota, requireFeature, requireOwner } from '../middleware/auth.js';
import { normalizeIndianPhone, normalizeVehicleNumber, round2, toNumber } from '../utils/formatters.js';

const vehicleSchema = z.object({
  vehicle_number: z.string().min(4).max(20),
  make_model: z.string().max(120).optional(),
  baseline_mileage_kmpl: z.coerce.number().positive().max(50).default(4.0),
});

const driverCreateSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().min(10).max(20),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be 4 digits'),
  language: z.nativeEnum(LanguageCode).default('hi'),
  assigned_vehicle_id: z.string().uuid().nullable().optional(),
  permissions: z
    .object({
      can_start_end_trip: z.boolean().optional(),
      can_add_fuel: z.boolean().optional(),
      can_add_other_expenses: z.boolean().optional(),
      can_view_own_bata_and_advance: z.boolean().optional(),
      can_view_toll_history: z.boolean().optional(),
      can_view_doc_vault: z.boolean().optional(),
    })
    .optional(),
});

const driverUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  pin: z.string().regex(/^\d{4}$/).optional(),
  language: z.nativeEnum(LanguageCode).optional(),
  assigned_vehicle_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
});

const driverPermissionsSchema = z.object({
  can_start_end_trip: z.boolean().optional(),
  can_add_fuel: z.boolean().optional(),
  can_add_other_expenses: z.boolean().optional(),
  can_view_own_bata_and_advance: z.boolean().optional(),
  can_view_toll_history: z.boolean().optional(),
  can_view_doc_vault: z.boolean().optional(),
});

const categorySchema = z.object({
  name: z.string().min(2).max(80),
  icon: z.string().max(60).default('receipt'),
  is_fuel: z.boolean().default(false),
});

export async function fleetRoutes(app: FastifyInstance) {
  // ---- Vehicles ----
  app.get('/api/vehicles', { preHandler: [authenticate] }, async (request) => {
    const vehicles = await prisma.vehicle.findMany({
      where: { ownerId: request.user.ownerId, isActive: true },
      include: {
        assignedDrivers: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { vehicles };
  });

  app.post('/api/vehicles', { preHandler: [requireOwner] }, async (request, reply) => {
    const quota = await checkOwnerQuota(request.user.ownerId, 'trucks');
    if (!quota.allowed) {
      return reply.status(403).send({ error: { code: quota.code, message: quota.message } });
    }
    const body = vehicleSchema.parse(request.body);
    const vehicleNumber = normalizeVehicleNumber(body.vehicle_number);

    const vehicle = await prisma.vehicle.create({
      data: {
        ownerId: request.user.ownerId,
        vehicleNumber,
        makeModel: body.make_model,
        baselineMileageKmpl: body.baseline_mileage_kmpl.toFixed(2),
      },
    });
    return reply.status(201).send({ vehicle });
  });

  app.patch('/api/vehicles/:id', { preHandler: [requireOwner] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = vehicleSchema.partial().extend({ is_active: z.boolean().optional() }).parse(request.body);

    const existing = await prisma.vehicle.findFirst({
      where: { id, ownerId: request.user.ownerId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Vehicle not found' } });
    }

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: {
        vehicleNumber: body.vehicle_number ? normalizeVehicleNumber(body.vehicle_number) : undefined,
        makeModel: body.make_model,
        baselineMileageKmpl:
          body.baseline_mileage_kmpl !== undefined ? body.baseline_mileage_kmpl.toFixed(2) : undefined,
        isActive: body.is_active,
      },
    });
    return { vehicle };
  });

  // ---- Drivers & Granular Permissions ----
  app.get('/api/drivers', { preHandler: [requireOwner] }, async (request) => {
    const [drivers, advanceEntries, driverExpenses] = await Promise.all([
      prisma.user.findMany({
        where: { ownerId: request.user.ownerId, role: UserRole.DRIVER },
        select: {
          id: true,
          name: true,
          phone: true,
          language: true,
          isActive: true,
          assignedVehicleId: true,
          assignedVehicle: true,
          permissions: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.driverAdvanceEntry.findMany({
        where: { ownerId: request.user.ownerId },
      }),
      prisma.expense.findMany({
        where: {
          ownerId: request.user.ownerId,
          approvalStatus: { not: ApprovalStatus.REJECTED },
        },
        select: { driverId: true, amount: true },
      }),
    ]);

    const driversWithLedger = drivers.map((d) => {
      const entries = advanceEntries.filter((e) => e.driverId === d.id);
      const totalGiven = round2(
        entries.filter((e) => e.type === 'GIVEN').reduce((s, e) => s + toNumber(e.amount), 0),
      );
      const totalReturned = round2(
        entries.filter((e) => e.type === 'RETURNED').reduce((s, e) => s + toNumber(e.amount), 0),
      );
      const totalExpenses = round2(
        driverExpenses.filter((e) => e.driverId === d.id).reduce((s, e) => s + toNumber(e.amount), 0),
      );
      const remainingBalance = round2(totalGiven - totalExpenses - totalReturned);
      return {
        ...d,
        advance_summary: {
          total_given: totalGiven,
          total_returned: totalReturned,
          total_expenses: totalExpenses,
          remaining_balance: remainingBalance,
        },
      };
    });

    return { drivers: driversWithLedger };
  });

  app.get('/api/drivers/:id/ledger', { preHandler: [requireOwner] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const driver = await prisma.user.findFirst({
      where: { id, ownerId: request.user.ownerId, role: UserRole.DRIVER },
      select: { id: true, name: true, phone: true },
    });
    if (!driver) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Driver not found' } });
    }

    const [entries, expenses] = await Promise.all([
      prisma.driverAdvanceEntry.findMany({
        where: { ownerId: request.user.ownerId, driverId: id },
        orderBy: { entryDate: 'desc' },
      }),
      prisma.expense.findMany({
        where: {
          ownerId: request.user.ownerId,
          driverId: id,
          approvalStatus: { not: ApprovalStatus.REJECTED },
        },
        include: { category: { select: { name: true, isFuel: true } } },
        orderBy: { expenseDate: 'desc' },
      }),
    ]);

    const totalGiven = round2(
      entries.filter((e) => e.type === 'GIVEN').reduce((s, e) => s + toNumber(e.amount), 0),
    );
    const totalReturned = round2(
      entries.filter((e) => e.type === 'RETURNED').reduce((s, e) => s + toNumber(e.amount), 0),
    );
    const totalExpenses = round2(expenses.reduce((s, e) => s + toNumber(e.amount), 0));
    const remainingBalance = round2(totalGiven - totalExpenses - totalReturned);

    return {
      driver,
      summary: {
        total_given: totalGiven,
        total_returned: totalReturned,
        total_expenses: totalExpenses,
        remaining_balance: remainingBalance,
      },
      entries,
      expenses,
    };
  });

  app.post('/api/drivers/:id/advance', { preHandler: [requireOwner] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        amount: z.coerce.number().positive(),
        type: z.enum(['GIVEN', 'RETURNED']).default('GIVEN'),
        note: z.string().max(255).optional(),
        trip_id: z.string().uuid().optional(),
      })
      .parse(request.body);

    const driver = await prisma.user.findFirst({
      where: { id, ownerId: request.user.ownerId, role: UserRole.DRIVER },
    });
    if (!driver) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Driver not found' } });
    }

    const entry = await prisma.driverAdvanceEntry.create({
      data: {
        ownerId: request.user.ownerId,
        driverId: id,
        tripId: body.trip_id ?? null,
        type: body.type,
        amount: body.amount.toFixed(2),
        note: body.note,
      },
    });

    return reply.status(201).send({ entry });
  });

  app.post('/api/drivers', { preHandler: [requireOwner] }, async (request, reply) => {
    const quota = await checkOwnerQuota(request.user.ownerId, 'drivers');
    if (!quota.allowed) {
      return reply.status(403).send({ error: { code: quota.code, message: quota.message } });
    }
    const body = driverCreateSchema.parse(request.body);
    const phone = normalizeIndianPhone(body.phone);
    const pinHash = await bcrypt.hash(body.pin, 10);

    const driver = await prisma.user.create({
      data: {
        role: UserRole.DRIVER,
        ownerId: request.user.ownerId,
        name: body.name,
        phone,
        pinHash,
        language: body.language,
        assignedVehicleId: body.assigned_vehicle_id ?? null,
        permissions: {
          create: {
            canStartEndTrip: body.permissions?.can_start_end_trip ?? true,
            canAddFuel: body.permissions?.can_add_fuel ?? true,
            canAddOtherExpenses: body.permissions?.can_add_other_expenses ?? true,
            canViewOwnBataAndAdvance: body.permissions?.can_view_own_bata_and_advance ?? true,
            canViewTollHistory: body.permissions?.can_view_toll_history ?? false,
            canViewDocVault: body.permissions?.can_view_doc_vault ?? true,
          },
        },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        language: true,
        assignedVehicle: true,
        permissions: true,
      },
    });
    return reply.status(201).send({ driver });
  });

  app.patch('/api/drivers/:id', { preHandler: [requireOwner] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = driverUpdateSchema.parse(request.body);

    const existing = await prisma.user.findFirst({
      where: { id, ownerId: request.user.ownerId, role: UserRole.DRIVER },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Driver not found' } });
    }

    const pinHash = body.pin ? await bcrypt.hash(body.pin, 10) : undefined;
    const driver = await prisma.user.update({
      where: { id },
      data: {
        name: body.name,
        pinHash,
        language: body.language,
        assignedVehicleId: body.assigned_vehicle_id,
        isActive: body.is_active,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        language: true,
        isActive: true,
        assignedVehicle: true,
        permissions: true,
      },
    });
    return { driver };
  });

  app.patch(
    '/api/drivers/:id/permissions',
    { preHandler: [requireOwner, requireFeature('featureDriverPermissions')] },
    async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = driverPermissionsSchema.parse(request.body);

    const driver = await prisma.user.findFirst({
      where: { id, ownerId: request.user.ownerId, role: UserRole.DRIVER },
    });
    if (!driver) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Driver not found' } });
    }

    const permissions = await prisma.driverPermission.upsert({
      where: { driverId: id },
      create: {
        driverId: id,
        canStartEndTrip: body.can_start_end_trip ?? true,
        canAddFuel: body.can_add_fuel ?? true,
        canAddOtherExpenses: body.can_add_other_expenses ?? true,
        canViewOwnBataAndAdvance: body.can_view_own_bata_and_advance ?? true,
        canViewTollHistory: body.can_view_toll_history ?? false,
        canViewDocVault: body.can_view_doc_vault ?? true,
      },
      update: {
        canStartEndTrip: body.can_start_end_trip,
        canAddFuel: body.can_add_fuel,
        canAddOtherExpenses: body.can_add_other_expenses,
        canViewOwnBataAndAdvance: body.can_view_own_bata_and_advance,
        canViewTollHistory: body.can_view_toll_history,
        canViewDocVault: body.can_view_doc_vault,
      },
    });

    return { permissions };
  });

  // ---- Expense Categories ----
  app.get('/api/expense-categories', { preHandler: [authenticate] }, async (request) => {
    const includeArchived = (request.query as { include_archived?: string }).include_archived === 'true';
    const categories = await prisma.expenseCategory.findMany({
      where: {
        ownerId: request.user.ownerId,
        ...(includeArchived ? {} : { isArchived: false }),
      },
      orderBy: [{ isFuel: 'desc' }, { name: 'asc' }],
    });
    return { categories };
  });

  app.post('/api/expense-categories', { preHandler: [requireOwner] }, async (request, reply) => {
    const body = categorySchema.parse(request.body);
    const category = await prisma.expenseCategory.create({
      data: {
        ownerId: request.user.ownerId,
        name: body.name,
        icon: body.icon,
        isFuel: body.is_fuel,
      },
    });
    return reply.status(201).send({ category });
  });

  app.patch('/api/expense-categories/:id', { preHandler: [requireOwner] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = categorySchema
      .partial()
      .extend({ is_archived: z.boolean().optional() })
      .parse(request.body);

    const existing = await prisma.expenseCategory.findFirst({
      where: { id, ownerId: request.user.ownerId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Category not found' } });
    }

    const category = await prisma.expenseCategory.update({
      where: { id },
      data: {
        name: body.name,
        icon: body.icon,
        isFuel: body.is_fuel,
        isArchived: body.is_archived,
      },
    });
    return { category };
  });
}
