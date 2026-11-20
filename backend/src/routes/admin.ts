import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { LanguageCode, SubscriptionStatus, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import {
  authenticate,
  getOwnerSubscriptionSummary,
  requireOwner,
  requireSuperAdmin,
} from '../middleware/auth.js';
import { normalizeIndianPhone, round2, toNumber } from '../utils/formatters.js';

const planSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(80).optional(),
  description: z.string().max(255).optional(),
  price_monthly_inr: z.coerce.number().nonnegative().default(0),
  price_yearly_inr: z.coerce.number().nonnegative().default(0),
  max_trucks: z.coerce.number().int().positive().default(3),
  max_drivers: z.coerce.number().int().positive().default(5),
  feature_ocr_vision: z.boolean().default(false),
  feature_fastag_auto_sync: z.boolean().default(false),
  feature_emi_tracker: z.boolean().default(false),
  feature_compliance_vault: z.boolean().default(true),
  feature_driver_permissions: z.boolean().default(true),
  feature_monthly_analytics: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

const createOwnerByAdminSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().min(10).max(20),
  email: z.string().email().optional().or(z.literal('')),
  password: z.string().min(6).max(100),
  plan_id: z.string().uuid(),
  duration_days: z.coerce.number().int().positive().default(30),
  status: z.nativeEnum(SubscriptionStatus).default(SubscriptionStatus.ACTIVE),
  payment_note: z.string().max(255).optional(),
});

const updateSubscriptionSchema = z.object({
  plan_id: z.string().uuid().optional(),
  status: z.nativeEnum(SubscriptionStatus).optional(),
  extend_days: z.coerce.number().int().positive().optional(),
  expires_at: z.string().datetime().optional(),
  payment_note: z.string().max(255).optional(),
});

const updateOwnerByAdminSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().min(10).max(20).optional(),
  email: z.string().email().nullable().optional().or(z.literal('')),
  password: z.string().min(6).max(100).optional().or(z.literal('')),
  is_active: z.boolean().optional(),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function adminRoutes(app: FastifyInstance) {
  // ---- Serve Super Admin Web Dashboard at /admin ----
  app.get('/admin', async (_request, reply) => {
    const htmlPath = path.resolve(process.cwd(), 'src/admin/dashboard.html');
    const html = await fs.readFile(htmlPath, 'utf-8');
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // ---- Public: List active subscription plans (for Owner Signup & Plan Switcher) ----
  app.get('/api/plans', async () => {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthlyInr: 'asc' },
    });
    return {
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        price_monthly_inr: toNumber(p.priceMonthlyInr),
        price_yearly_inr: toNumber(p.priceYearlyInr),
        max_trucks: p.maxTrucks,
        max_drivers: p.maxDrivers,
        feature_ocr_vision: p.featureOcrVision,
        feature_fastag_auto_sync: p.featureFastagAutoSync,
        feature_emi_tracker: p.featureEmiTracker,
        feature_compliance_vault: p.featureComplianceVault,
        feature_driver_permissions: p.featureDriverPermissions,
        feature_monthly_analytics: p.featureMonthlyAnalytics,
      })),
    };
  });

  // ---- Owner / Driver: Get current subscription & usage ----
  app.get('/api/subscription/my-plan', { preHandler: [authenticate] }, async (request) => {
    const subscription = await getOwnerSubscriptionSummary(request.user.ownerId);
    return { subscription };
  });

  // ---- Owner: Self-serve switch / activate subscription plan (no payment required) ----
  app.post('/api/subscription/select-plan', { preHandler: [requireOwner] }, async (request, reply) => {
    const body = z
      .object({
        plan_id: z.string().uuid(),
        billing_cycle: z.enum(['monthly', 'yearly']).default('monthly'),
      })
      .parse(request.body);

    const plan = await prisma.subscriptionPlan.findFirst({
      where: { id: body.plan_id, isActive: true },
    });
    if (!plan) {
      return reply.status(404).send({
        error: { code: 'PLAN_NOT_FOUND', message: 'Subscription plan not found or inactive' },
      });
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + (body.billing_cycle === 'yearly' ? 365 : 30));

    await prisma.ownerSubscription.upsert({
      where: { ownerId: request.user.ownerId },
      update: {
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        startsAt: now,
        expiresAt,
        paymentNote: `Self-serve Activated (${body.billing_cycle}, no payment required)`,
      },
      create: {
        ownerId: request.user.ownerId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        startsAt: now,
        expiresAt,
        paymentNote: `Self-serve Activated (${body.billing_cycle}, no payment required)`,
      },
    });

    const subscription = await getOwnerSubscriptionSummary(request.user.ownerId);
    return { subscription };
  });

  // ---- Super Admin: Platform Stats ----
  app.get('/api/admin/stats', { preHandler: [requireSuperAdmin] }, async () => {
    const [totalOwners, totalVehicles, totalDrivers, activeSubs] = await Promise.all([
      prisma.user.count({ where: { role: UserRole.OWNER } }),
      prisma.vehicle.count({ where: { isActive: true } }),
      prisma.user.count({ where: { role: UserRole.DRIVER, isActive: true } }),
      prisma.ownerSubscription.findMany({
        where: {
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] },
          expiresAt: { gt: new Date() },
        },
        include: { plan: true },
      }),
    ]);

    const mrrInr = round2(
      activeSubs
        .filter((s) => s.status === SubscriptionStatus.ACTIVE)
        .reduce((sum, s) => sum + toNumber(s.plan.priceMonthlyInr), 0),
    );

    return {
      total_owners: totalOwners,
      active_subscriptions: activeSubs.length,
      total_trucks: totalVehicles,
      total_drivers: totalDrivers,
      mrr_inr: mrrInr,
    };
  });

  // ---- Super Admin: Subscription Plans CRUD ----
  app.get('/api/admin/plans', { preHandler: [requireSuperAdmin] }, async () => {
    const plans = await prisma.subscriptionPlan.findMany({
      include: { _count: { select: { subscriptions: true } } },
      orderBy: { priceMonthlyInr: 'asc' },
    });
    return {
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        price_monthly_inr: toNumber(p.priceMonthlyInr),
        price_yearly_inr: toNumber(p.priceYearlyInr),
        max_trucks: p.maxTrucks,
        max_drivers: p.maxDrivers,
        feature_ocr_vision: p.featureOcrVision,
        feature_fastag_auto_sync: p.featureFastagAutoSync,
        feature_emi_tracker: p.featureEmiTracker,
        feature_compliance_vault: p.featureComplianceVault,
        feature_driver_permissions: p.featureDriverPermissions,
        feature_monthly_analytics: p.featureMonthlyAnalytics,
        is_active: p.isActive,
        subscriber_count: p._count.subscriptions,
      })),
    };
  });

  app.post('/api/admin/plans', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const body = planSchema.parse(request.body);
    const slug = body.slug ? slugify(body.slug) : slugify(body.name);

    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: body.name,
        slug,
        description: body.description,
        priceMonthlyInr: body.price_monthly_inr.toFixed(2),
        priceYearlyInr: body.price_yearly_inr.toFixed(2),
        maxTrucks: body.max_trucks,
        maxDrivers: body.max_drivers,
        featureOcrVision: body.feature_ocr_vision,
        featureFastagAutoSync: body.feature_fastag_auto_sync,
        featureEmiTracker: body.feature_emi_tracker,
        featureComplianceVault: body.feature_compliance_vault,
        featureDriverPermissions: body.feature_driver_permissions,
        featureMonthlyAnalytics: body.feature_monthly_analytics,
        isActive: body.is_active,
      },
    });
    return reply.status(201).send({ plan });
  });

  app.patch('/api/admin/plans/:id', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = planSchema.partial().parse(request.body);

    const existing = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Plan not found' } });
    }

    const plan = await prisma.subscriptionPlan.update({
      where: { id },
      data: {
        name: body.name,
        slug: body.slug ? slugify(body.slug) : undefined,
        description: body.description,
        priceMonthlyInr:
          body.price_monthly_inr !== undefined ? body.price_monthly_inr.toFixed(2) : undefined,
        priceYearlyInr:
          body.price_yearly_inr !== undefined ? body.price_yearly_inr.toFixed(2) : undefined,
        maxTrucks: body.max_trucks,
        maxDrivers: body.max_drivers,
        featureOcrVision: body.feature_ocr_vision,
        featureFastagAutoSync: body.feature_fastag_auto_sync,
        featureEmiTracker: body.feature_emi_tracker,
        featureComplianceVault: body.feature_compliance_vault,
        featureDriverPermissions: body.feature_driver_permissions,
        featureMonthlyAnalytics: body.feature_monthly_analytics,
        isActive: body.is_active,
      },
    });

    return { plan };
  });

  // ---- Super Admin: Fleet Owners & Subscriptions ----
  app.get('/api/admin/owners', { preHandler: [requireSuperAdmin] }, async () => {
    const owners = await prisma.user.findMany({
      where: { role: UserRole.OWNER },
      include: {
        subscription: { include: { plan: true } },
        _count: {
          select: {
            ownedVehicles: true,
            drivers: true,
            ownedTrips: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      owners: owners.map((o) => ({
        id: o.id,
        name: o.name,
        phone: o.phone,
        email: o.email,
        is_active: o.isActive,
        inbound_toll_email: o.inboundTollEmail,
        created_at: o.createdAt,
        trucks_count: o._count.ownedVehicles,
        drivers_count: o._count.drivers,
        trips_count: o._count.ownedTrips,
        subscription: o.subscription
          ? {
              id: o.subscription.id,
              plan_id: o.subscription.planId,
              plan_name: o.subscription.plan.name,
              max_trucks: o.subscription.plan.maxTrucks,
              max_drivers: o.subscription.plan.maxDrivers,
              status: o.subscription.status,
              starts_at: o.subscription.startsAt,
              expires_at: o.subscription.expiresAt,
              payment_note: o.subscription.paymentNote,
            }
          : null,
      })),
    };
  });

  app.post('/api/admin/owners', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const body = createOwnerByAdminSchema.parse(request.body);
    const phone = normalizeIndianPhone(body.phone);

    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      return reply.status(409).send({
        error: { code: 'PHONE_EXISTS', message: 'Phone number already registered' },
      });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const slug = `${phone.slice(-6)}${Math.random().toString(36).slice(2, 5)}`;
    const inboundTollEmail = `owner_${slug}@${env.TOLL_EMAIL_DOMAIN}`;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + body.duration_days);

    const owner = await prisma.user.create({
      data: {
        role: UserRole.OWNER,
        name: body.name,
        phone,
        email: body.email || null,
        passwordHash,
        language: LanguageCode.en,
        inboundTollEmail,
        subscription: {
          create: {
            planId: body.plan_id,
            status: body.status,
            expiresAt,
            paymentNote: body.payment_note ?? `Assigned by Super Admin (${body.duration_days} days)`,
          },
        },
        expenseCategories: {
          create: [
            { name: 'Diesel', icon: 'fuel', isFuel: true, isSystem: true },
            { name: 'Driver Bata', icon: 'wallet', isFuel: false, isSystem: true },
            { name: 'Loading / Unloading', icon: 'package', isFuel: false, isSystem: true },
            { name: 'Repair & Maintenance', icon: 'wrench', isFuel: false, isSystem: true },
            { name: 'RTO / Challan', icon: 'shield-alert', isFuel: false, isSystem: true },
            { name: 'Food & Tea', icon: 'utensils', isFuel: false, isSystem: true },
          ],
        },
      },
      include: { subscription: { include: { plan: true } } },
    });

    return reply.status(201).send({ owner });
  });

  app.patch('/api/admin/owners/:id', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateOwnerByAdminSchema.parse(request.body);

    const existing = await prisma.user.findFirst({
      where: { id, role: UserRole.OWNER },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Owner not found' } });
    }

    const phone = body.phone ? normalizeIndianPhone(body.phone) : undefined;
    if (phone && phone !== existing.phone) {
      const conflict = await prisma.user.findUnique({ where: { phone } });
      if (conflict) {
        return reply.status(409).send({
          error: { code: 'PHONE_EXISTS', message: 'Phone number already in use by another account' },
        });
      }
    }

    const passwordHash =
      body.password && body.password.trim().length > 0
        ? await bcrypt.hash(body.password.trim(), 10)
        : undefined;

    const owner = await prisma.user.update({
      where: { id },
      data: {
        name: body.name,
        phone,
        email: body.email === '' ? null : body.email,
        passwordHash,
        isActive: body.is_active,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        isActive: true,
      },
    });

    return { owner };
  });

  app.delete('/api/admin/owners/:id', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.user.findFirst({
      where: { id, role: UserRole.OWNER },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Owner not found' } });
    }
    await prisma.user.delete({ where: { id } });
    return { deleted: true };
  });

  app.patch(
    '/api/admin/owners/:id/subscription',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateSubscriptionSchema.parse(request.body);

      const owner = await prisma.user.findFirst({
        where: { id, role: UserRole.OWNER },
        include: { subscription: true },
      });
      if (!owner) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Owner not found' } });
      }

      let nextExpiresAt = owner.subscription?.expiresAt ?? new Date();
      if (body.expires_at) {
        nextExpiresAt = new Date(body.expires_at);
      } else if (body.extend_days) {
        const base =
          nextExpiresAt.getTime() > Date.now() ? new Date(nextExpiresAt) : new Date();
        base.setDate(base.getDate() + body.extend_days);
        nextExpiresAt = base;
      }

      const planId = body.plan_id ?? owner.subscription?.planId;
      if (!planId) {
        return reply.status(400).send({
          error: { code: 'PLAN_REQUIRED', message: 'plan_id is required when creating a subscription' },
        });
      }

      const subscription = await prisma.ownerSubscription.upsert({
        where: { ownerId: owner.id },
        create: {
          ownerId: owner.id,
          planId,
          status: body.status ?? SubscriptionStatus.ACTIVE,
          expiresAt: nextExpiresAt,
          paymentNote: body.payment_note,
        },
        update: {
          planId: body.plan_id,
          status: body.status,
          expiresAt: body.expires_at || body.extend_days ? nextExpiresAt : undefined,
          paymentNote: body.payment_note,
        },
        include: { plan: true },
      });

      return { subscription };
    },
  );
}
