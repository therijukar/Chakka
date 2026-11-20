import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireFeature, requireOwner } from '../middleware/auth.js';
import { computeComplianceStatus, round2, toNumber } from '../utils/formatters.js';

const createEmiSchema = z.object({
  vehicle_id: z.string().uuid(),
  financer_name: z.string().min(2).max(150),
  total_loan_amount: z.coerce.number().positive(),
  monthly_emi_amount: z.coerce.number().positive(),
  total_tenure_months: z.coerce.number().int().positive(),
  emis_paid: z.coerce.number().int().nonnegative().default(0),
  due_day_of_month: z.coerce.number().int().min(1).max(31),
  remaining_principal: z.coerce.number().nonnegative().optional(),
  start_date: z.string().datetime().optional(),
});

const markPaidSchema = z.object({
  amount_paid: z.coerce.number().positive().optional(),
  payment_date: z.string().datetime().optional(),
  receipt_url: z.string().max(512).optional(),
  note: z.string().max(255).optional(),
});

function formatEmiResponse(emi: {
  id: string;
  vehicleId: string;
  financerName: string;
  totalLoanAmount: unknown;
  monthlyEmiAmount: unknown;
  totalTenureMonths: number;
  emisPaid: number;
  dueDayOfMonth: number;
  remainingPrincipal: unknown;
  startDate: Date;
  isActive: boolean;
  vehicle?: { id: string; vehicleNumber: string; makeModel: string | null };
  payments?: Array<{
    id: string;
    amountPaid: unknown;
    paymentDate: Date;
    receiptUrl: string | null;
    note: string | null;
  }>;
}) {
  const emisRemaining = Math.max(0, emi.totalTenureMonths - emi.emisPaid);
  const now = new Date();
  const nextDueDate = new Date(now.getFullYear(), now.getMonth(), emi.dueDayOfMonth);
  if (nextDueDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
  }
  const daysUntilDue = Math.ceil((nextDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return {
    id: emi.id,
    vehicle_id: emi.vehicleId,
    vehicle: emi.vehicle,
    financer_name: emi.financerName,
    total_loan_amount: toNumber(emi.totalLoanAmount as never),
    monthly_emi_amount: toNumber(emi.monthlyEmiAmount as never),
    total_tenure_months: emi.totalTenureMonths,
    emis_paid: emi.emisPaid,
    emis_remaining: emisRemaining,
    due_day_of_month: emi.dueDayOfMonth,
    next_due_date: nextDueDate.toISOString().slice(0, 10),
    days_until_due: daysUntilDue,
    is_due_soon: daysUntilDue <= 5 && emisRemaining > 0,
    remaining_principal: toNumber(emi.remainingPrincipal as never),
    start_date: emi.startDate,
    is_active: emi.isActive,
    payments: emi.payments,
  };
}

export async function emiAndComplianceRoutes(app: FastifyInstance) {
  // ---- Truck EMI Tracker ----
  app.get('/api/emis', { preHandler: [requireOwner, requireFeature('featureEmiTracker')] }, async (request) => {
    const emis = await prisma.vehicleEmi.findMany({
      where: { ownerId: request.user.ownerId, isActive: true },
      include: {
        vehicle: { select: { id: true, vehicleNumber: true, makeModel: true } },
        payments: { orderBy: { paymentDate: 'desc' }, take: 6 },
      },
      orderBy: { dueDayOfMonth: 'asc' },
    });

    const formatted = emis.map(formatEmiResponse);
    const totalMonthlyOutflow = round2(
      formatted.reduce((sum, e) => sum + e.monthly_emi_amount, 0),
    );
    const dueSoonCount = formatted.filter((e) => e.is_due_soon).length;

    return {
      emis: formatted,
      summary: {
        total_active_loans: formatted.length,
        total_monthly_emi_outflow: totalMonthlyOutflow,
        due_soon_count: dueSoonCount,
      },
    };
  });

  app.post('/api/emis', { preHandler: [requireOwner, requireFeature('featureEmiTracker')] }, async (request, reply) => {
    const body = createEmiSchema.parse(request.body);
    const remainingPrincipal = body.remaining_principal ?? body.total_loan_amount;

    const emi = await prisma.vehicleEmi.create({
      data: {
        ownerId: request.user.ownerId,
        vehicleId: body.vehicle_id,
        financerName: body.financer_name,
        totalLoanAmount: body.total_loan_amount.toFixed(2),
        monthlyEmiAmount: body.monthly_emi_amount.toFixed(2),
        totalTenureMonths: body.total_tenure_months,
        emisPaid: body.emis_paid,
        dueDayOfMonth: body.due_day_of_month,
        remainingPrincipal: remainingPrincipal.toFixed(2),
        startDate: body.start_date ? new Date(body.start_date) : new Date(),
      },
      include: { vehicle: { select: { id: true, vehicleNumber: true, makeModel: true } } },
    });

    return reply.status(201).send({ emi: formatEmiResponse(emi) });
  });

  app.post('/api/emis/:id/mark-paid', { preHandler: [requireOwner, requireFeature('featureEmiTracker')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = markPaidSchema.parse(request.body ?? {});

    const existing = await prisma.vehicleEmi.findFirst({
      where: { id, ownerId: request.user.ownerId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'EMI record not found' } });
    }

    const amountPaid = body.amount_paid ?? toNumber(existing.monthlyEmiAmount);
    const newRemainingPrincipal = Math.max(0, round2(toNumber(existing.remainingPrincipal) - amountPaid));
    const newEmisPaid = Math.min(existing.totalTenureMonths, existing.emisPaid + 1);

    const [payment, updatedEmi] = await prisma.$transaction([
      prisma.emiPayment.create({
        data: {
          emiId: existing.id,
          amountPaid: amountPaid.toFixed(2),
          paymentDate: body.payment_date ? new Date(body.payment_date) : new Date(),
          receiptUrl: body.receipt_url,
          note: body.note,
        },
      }),
      prisma.vehicleEmi.update({
        where: { id: existing.id },
        data: {
          emisPaid: newEmisPaid,
          remainingPrincipal: newRemainingPrincipal.toFixed(2),
          isActive: newEmisPaid < existing.totalTenureMonths,
        },
        include: {
          vehicle: { select: { id: true, vehicleNumber: true, makeModel: true } },
          payments: { orderBy: { paymentDate: 'desc' }, take: 6 },
        },
      }),
    ]);

    return { payment, emi: formatEmiResponse(updatedEmi) };
  });

  // ---- Compliance & Expiry Summary (Red / Amber / Green) ----
  app.get('/api/compliance/summary', { preHandler: [requireOwner, requireFeature('featureComplianceVault')] }, async (request) => {
    const docs = await prisma.vehicleDocument.findMany({
      where: { ownerId: request.user.ownerId, isActive: true },
      include: {
        vehicle: { select: { id: true, vehicleNumber: true, makeModel: true } },
        driver: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });

    const now = new Date();
    const items = docs.map((doc) => {
      const badge = computeComplianceStatus(doc.expiryDate, now);
      return {
        id: doc.id,
        doc_type: doc.docType,
        title: doc.title,
        document_number: doc.documentNumber,
        expiry_date: doc.expiryDate,
        status: badge.status,
        days_remaining: badge.daysRemaining,
        file_url: doc.fileUrl,
        vehicle: doc.vehicle,
        driver: doc.driver,
      };
    });

    const counts = {
      red: items.filter((i) => i.status === 'RED').length,
      amber: items.filter((i) => i.status === 'AMBER').length,
      green: items.filter((i) => i.status === 'GREEN').length,
      no_expiry: items.filter((i) => i.status === 'NO_EXPIRY').length,
    };

    return { counts, documents: items };
  });
}
