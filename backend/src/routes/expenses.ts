import type { FastifyInstance } from 'fastify';
import { ApprovalStatus, SyncEntityType, SyncStatus, UserRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireFeature, requireOwner } from '../middleware/auth.js';
import { round2, toNumber } from '../utils/formatters.js';

const createExpenseSchema = z.object({
  client_id: z.string().min(4).max(64),
  trip_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid(),
  category_id: z.string().uuid(),
  amount: z.coerce.number().positive().optional(),
  liters: z.coerce.number().positive().optional(),
  rate_per_liter: z.coerce.number().positive().optional(),
  pump_name: z.string().max(180).optional(),
  bill_date: z.string().datetime().optional(),
  bill_photo_url: z.string().max(512).optional(),
  note: z.string().optional(),
  ocr_confidence: z.coerce.number().min(0).max(100).optional(),
  expense_date: z.string().datetime().optional(),
});

const rejectSchema = z.object({
  reason: z.string().max(255).optional(),
});

export async function expenseRoutes(app: FastifyInstance) {
  app.get('/api/expenses', { preHandler: [authenticate] }, async (request) => {
    const query = request.query as {
      trip_id?: string;
      vehicle_id?: string;
      approval_status?: ApprovalStatus;
    };

    const expenses = await prisma.expense.findMany({
      where: {
        ownerId: request.user.ownerId,
        ...(request.user.role === UserRole.DRIVER ? { driverId: request.user.sub } : {}),
        ...(query.trip_id ? { tripId: query.trip_id } : {}),
        ...(query.vehicle_id ? { vehicleId: query.vehicle_id } : {}),
        ...(query.approval_status ? { approvalStatus: query.approval_status } : {}),
      },
      include: {
        category: true,
        vehicle: { select: { id: true, vehicleNumber: true } },
        driver: { select: { id: true, name: true } },
      },
      orderBy: { expenseDate: 'desc' },
    });

    return { expenses };
  });

  // Idempotent expense creation (enforces can_add_fuel vs can_add_other_expenses for drivers)
  app.post('/api/expenses', { preHandler: [authenticate] }, async (request, reply) => {
    const body = createExpenseSchema.parse(request.body);

    const existing = await prisma.expense.findUnique({
      where: { clientId: body.client_id },
      include: { category: true },
    });
    if (existing) {
      return reply.status(200).send({ expense: existing, idempotent: true });
    }

    const category = await prisma.expenseCategory.findFirst({
      where: { id: body.category_id, ownerId: request.user.ownerId },
    });
    if (!category) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Expense category not found' } });
    }

    if (request.user.role === UserRole.DRIVER) {
      const perms = await prisma.driverPermission.findUnique({
        where: { driverId: request.user.sub },
      });
      const allowed = category.isFuel ? perms?.canAddFuel : perms?.canAddOtherExpenses;
      if (!allowed) {
        return reply.status(403).send({
          error: {
            code: 'PERMISSION_DENIED',
            message: category.isFuel
              ? 'Driver does not have permission to add fuel'
              : 'Driver does not have permission to add other expenses',
          },
        });
      }
    }

    // Auto-calculate missing fuel fields: total = liters * rate_per_liter
    let computedAmount = body.amount;
    if (computedAmount === undefined && body.liters !== undefined && body.rate_per_liter !== undefined) {
      computedAmount = round2(body.liters * body.rate_per_liter);
    }
    if (computedAmount === undefined) {
      return reply.status(400).send({
        error: {
          code: 'AMOUNT_REQUIRED',
          message: 'Provide amount, or both liters and rate_per_liter',
        },
      });
    }

    const isOwner = request.user.role === UserRole.OWNER;
    const expense = await prisma.expense.create({
      data: {
        clientId: body.client_id,
        ownerId: request.user.ownerId,
        tripId: body.trip_id ?? null,
        vehicleId: body.vehicle_id,
        driverId: isOwner ? null : request.user.sub,
        categoryId: body.category_id,
        amount: computedAmount.toFixed(2),
        liters: body.liters !== undefined ? body.liters.toFixed(2) : null,
        ratePerLiter: body.rate_per_liter !== undefined ? body.rate_per_liter.toFixed(2) : null,
        pumpName: body.pump_name,
        billDate: body.bill_date ? new Date(body.bill_date) : null,
        billPhotoUrl: body.bill_photo_url,
        note: body.note,
        ocrConfidence: body.ocr_confidence !== undefined ? body.ocr_confidence.toFixed(2) : null,
        approvalStatus: isOwner ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING,
        approvedById: isOwner ? request.user.sub : null,
        approvedAt: isOwner ? new Date() : null,
        expenseDate: body.expense_date ? new Date(body.expense_date) : new Date(),
      },
      include: { category: true },
    });

    await prisma.syncLog.create({
      data: {
        clientId: body.client_id,
        userId: request.user.sub,
        entityType: SyncEntityType.EXPENSE,
        status: SyncStatus.SYNCED,
      },
    });

    return reply.status(201).send({ expense, idempotent: false });
  });

  app.patch('/api/expenses/:id/approve', { preHandler: [requireOwner] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.expense.findFirst({
      where: { id, ownerId: request.user.ownerId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Expense not found' } });
    }

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        rejectionReason: null,
        approvedById: request.user.sub,
        approvedAt: new Date(),
      },
    });
    return { expense };
  });

  app.patch('/api/expenses/:id/reject', { preHandler: [requireOwner] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = rejectSchema.parse(request.body ?? {});

    const existing = await prisma.expense.findFirst({
      where: { id, ownerId: request.user.ownerId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Expense not found' } });
    }

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        approvalStatus: ApprovalStatus.REJECTED,
        rejectionReason: body.reason ?? 'Rejected by owner',
        approvedById: request.user.sub,
        approvedAt: new Date(),
      },
    });
    return { expense };
  });

  // Monthly Net Fleet Profit (with optional EMI deduction)
  app.get(
    '/api/analytics/monthly',
    { preHandler: [requireOwner, requireFeature('featureMonthlyAnalytics')] },
    async (request) => {
    const query = request.query as { year?: string; month?: string; include_emis?: string };
    const now = new Date();
    const year = query.year ? Number(query.year) : now.getFullYear();
    const month = query.month ? Number(query.month) : now.getMonth() + 1;
    const includeEmis = query.include_emis === 'true';

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const [trips, expenses, tolls, activeEmis] = await Promise.all([
      prisma.trip.findMany({
        where: { ownerId: request.user.ownerId, createdAt: { gte: start, lt: end } },
      }),
      prisma.expense.findMany({
        where: {
          ownerId: request.user.ownerId,
          approvalStatus: ApprovalStatus.APPROVED,
          expenseDate: { gte: start, lt: end },
        },
        include: { category: true },
      }),
      prisma.toll.findMany({
        where: { ownerId: request.user.ownerId, transactionTime: { gte: start, lt: end } },
      }),
      prisma.vehicleEmi.findMany({
        where: { ownerId: request.user.ownerId, isActive: true },
      }),
    ]);

    const totalFreight = round2(trips.reduce((s, t) => s + toNumber(t.agreedFreight), 0));
    const totalFuel = round2(
      expenses.filter((e) => e.category.isFuel).reduce((s, e) => s + toNumber(e.amount), 0),
    );
    const totalOtherExpenses = round2(
      expenses.filter((e) => !e.category.isFuel).reduce((s, e) => s + toNumber(e.amount), 0),
    );
    const totalTolls = round2(tolls.reduce((s, t) => s + toNumber(t.amount), 0));
    const totalMonthlyEmis = round2(
      activeEmis.reduce((s, e) => s + toNumber(e.monthlyEmiAmount), 0),
    );

    const operatingProfit = round2(totalFreight - (totalFuel + totalOtherExpenses + totalTolls));
    const netProfit = includeEmis ? round2(operatingProfit - totalMonthlyEmis) : operatingProfit;

    return {
      year,
      month,
      include_emis: includeEmis,
      trip_count: trips.length,
      total_freight: totalFreight,
      total_fuel: totalFuel,
      total_other_expenses: totalOtherExpenses,
      total_tolls: totalTolls,
      total_monthly_emis: totalMonthlyEmis,
      operating_profit: operatingProfit,
      net_profit: netProfit,
    };
  });

  // In-Depth Fleet Report (Truck-wise, Driver-wise, Collection & Due summary)
  app.get('/api/analytics/report', { preHandler: [requireOwner] }, async (request) => {
    const query = request.query as { year?: string; month?: string; include_emis?: string };
    const now = new Date();
    const year = query.year ? Number(query.year) : now.getFullYear();
    const month = query.month ? Number(query.month) : now.getMonth() + 1;
    const includeEmis = query.include_emis === 'true';

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const [trips, expenses, tolls, activeEmis, vehicles, drivers, advanceEntries] = await Promise.all([
      prisma.trip.findMany({
        where: { ownerId: request.user.ownerId, createdAt: { gte: start, lt: end } },
        include: {
          vehicle: { select: { id: true, vehicleNumber: true, makeModel: true } },
          driver: { select: { id: true, name: true } },
        },
      }),
      prisma.expense.findMany({
        where: {
          ownerId: request.user.ownerId,
          approvalStatus: ApprovalStatus.APPROVED,
          expenseDate: { gte: start, lt: end },
        },
        include: { category: true },
      }),
      prisma.toll.findMany({
        where: { ownerId: request.user.ownerId, transactionTime: { gte: start, lt: end } },
      }),
      prisma.vehicleEmi.findMany({
        where: { ownerId: request.user.ownerId, isActive: true },
      }),
      prisma.vehicle.findMany({
        where: { ownerId: request.user.ownerId, isActive: true },
        select: { id: true, vehicleNumber: true, makeModel: true },
      }),
      prisma.user.findMany({
        where: { ownerId: request.user.ownerId, role: 'DRIVER', isActive: true },
        select: { id: true, name: true },
      }),
      prisma.driverAdvanceEntry.findMany({
        where: { ownerId: request.user.ownerId },
      }),
    ]);

    const totalFreight = round2(trips.reduce((s, t) => s + toNumber(t.agreedFreight), 0));
    const totalCollected = round2(trips.reduce((s, t) => s + toNumber(t.advanceReceived), 0));
    const totalPendingDue = round2(trips.reduce((s, t) => s + toNumber(t.balancePending), 0));
    const totalFuel = round2(
      expenses.filter((e) => e.category.isFuel).reduce((s, e) => s + toNumber(e.amount), 0),
    );
    const totalOtherExpenses = round2(
      expenses.filter((e) => !e.category.isFuel).reduce((s, e) => s + toNumber(e.amount), 0),
    );
    const totalTolls = round2(tolls.reduce((s, t) => s + toNumber(t.amount), 0));
    const totalMonthlyEmis = round2(
      activeEmis.reduce((s, e) => s + toNumber(e.monthlyEmiAmount), 0),
    );
    const totalKmRun = round2(
      trips.reduce((s, t) => {
        if (t.startOdometerKm !== null && t.endOdometerKm !== null) {
          return s + Math.max(0, toNumber(t.endOdometerKm) - toNumber(t.startOdometerKm));
        }
        return s;
      }, 0),
    );

    const operatingProfit = round2(totalFreight - (totalFuel + totalOtherExpenses + totalTolls));
    const netProfit = includeEmis ? round2(operatingProfit - totalMonthlyEmis) : operatingProfit;

    const byTruck = vehicles.map((v) => {
      const vTrips = trips.filter((t) => t.vehicleId === v.id);
      const vFreight = round2(vTrips.reduce((s, t) => s + toNumber(t.agreedFreight), 0));
      const vExp = round2(
        expenses.filter((e) => e.vehicleId === v.id).reduce((s, e) => s + toNumber(e.amount), 0),
      );
      const vTolls = round2(
        tolls.filter((t) => t.vehicleId === v.id).reduce((s, t) => s + toNumber(t.amount), 0),
      );
      const vKm = round2(
        vTrips.reduce((s, t) => {
          if (t.startOdometerKm !== null && t.endOdometerKm !== null) {
            return s + Math.max(0, toNumber(t.endOdometerKm) - toNumber(t.startOdometerKm));
          }
          return s;
        }, 0),
      );
      return {
        vehicle_id: v.id,
        vehicle_number: v.vehicleNumber,
        make_model: v.makeModel,
        trip_count: vTrips.length,
        total_freight: vFreight,
        total_expenses: vExp,
        total_tolls: vTolls,
        net_profit: round2(vFreight - vExp - vTolls),
        km_run: vKm,
      };
    });

    const byDriver = drivers.map((d) => {
      const dTrips = trips.filter((t) => t.driverId === d.id);
      const dFreight = round2(dTrips.reduce((s, t) => s + toNumber(t.agreedFreight), 0));
      const dExpenses = round2(
        expenses.filter((e) => e.driverId === d.id).reduce((s, e) => s + toNumber(e.amount), 0),
      );
      const dEntries = advanceEntries.filter((e) => e.driverId === d.id);
      const advGiven = round2(
        dEntries.filter((e) => e.type === 'GIVEN').reduce((s, e) => s + toNumber(e.amount), 0),
      );
      const advReturned = round2(
        dEntries.filter((e) => e.type === 'RETURNED').reduce((s, e) => s + toNumber(e.amount), 0),
      );
      return {
        driver_id: d.id,
        driver_name: d.name,
        trip_count: dTrips.length,
        total_freight: dFreight,
        total_expenses: dExpenses,
        advance_given: advGiven,
        advance_balance: round2(advGiven - dExpenses - advReturned),
      };
    });

    return {
      year,
      month,
      include_emis: includeEmis,
      summary: {
        trip_count: trips.length,
        active_trips: trips.filter((t) => t.status === 'ACTIVE').length,
        completed_trips: trips.filter((t) => t.status === 'COMPLETED' || t.status === 'CLOSED').length,
        total_freight: totalFreight,
        total_collected: totalCollected,
        total_pending_due: totalPendingDue,
        total_fuel: totalFuel,
        total_other_expenses: totalOtherExpenses,
        total_tolls: totalTolls,
        total_monthly_emis: totalMonthlyEmis,
        operating_profit: operatingProfit,
        net_profit: netProfit,
        total_km_run: totalKmRun,
        avg_profit_per_trip: trips.length > 0 ? round2(operatingProfit / trips.length) : 0,
      },
      by_truck: byTruck,
      by_driver: byDriver,
    };
  });
}
