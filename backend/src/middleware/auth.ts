import type { FastifyReply, FastifyRequest } from 'fastify';
import { SubscriptionStatus, UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { toNumber } from '../utils/formatters.js';

export interface JwtUserPayload {
  sub: string;
  role: UserRole;
  ownerId: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtUserPayload;
    user: JwtUserPayload;
  }
}

export type DriverPermissionKey =
  | 'canStartEndTrip'
  | 'canAddFuel'
  | 'canAddOtherExpenses'
  | 'canViewOwnBataAndAdvance'
  | 'canViewTollHistory'
  | 'canViewDocVault';

export type SubscriptionFeatureKey =
  | 'featureOcrVision'
  | 'featureFastagAutoSync'
  | 'featureEmiTracker'
  | 'featureComplianceVault'
  | 'featureDriverPermissions'
  | 'featureMonthlyAnalytics';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Valid authentication token required' },
    });
  }
}

export async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply);
  if (reply.sent) return;
  if (request.user.role !== UserRole.SUPER_ADMIN) {
    return reply.status(403).send({
      error: { code: 'FORBIDDEN', message: 'Super Admin access required' },
    });
  }
}

export async function requireOwner(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply);
  if (reply.sent) return;
  if (request.user.role !== UserRole.OWNER && request.user.role !== UserRole.SUPER_ADMIN) {
    return reply.status(403).send({
      error: { code: 'FORBIDDEN', message: 'Owner access required' },
    });
  }
}

export function requireDriverPermission(permission: DriverPermissionKey) {
  return async function checkPermission(request: FastifyRequest, reply: FastifyReply) {
    await authenticate(request, reply);
    if (reply.sent) return;

    if (request.user.role === UserRole.OWNER || request.user.role === UserRole.SUPER_ADMIN) return;

    const perms = await prisma.driverPermission.findUnique({
      where: { driverId: request.user.sub },
    });

    if (!perms || !perms[permission]) {
      return reply.status(403).send({
        error: {
          code: 'PERMISSION_DENIED',
          message: `Driver does not have permission: ${permission}`,
        },
      });
    }
  };
}

export async function getOwnerSubscriptionSummary(ownerId: string) {
  const [sub, trucksUsed, driversUsed] = await Promise.all([
    prisma.ownerSubscription.findUnique({
      where: { ownerId },
      include: { plan: true },
    }),
    prisma.vehicle.count({ where: { ownerId, isActive: true } }),
    prisma.user.count({ where: { ownerId, role: UserRole.DRIVER, isActive: true } }),
  ]);

  if (!sub) return null;

  const isExpired =
    sub.status === SubscriptionStatus.EXPIRED ||
    sub.status === SubscriptionStatus.SUSPENDED ||
    sub.expiresAt.getTime() < Date.now();

  return {
    id: sub.id,
    status: isExpired && sub.status !== SubscriptionStatus.SUSPENDED ? SubscriptionStatus.EXPIRED : sub.status,
    is_active: !isExpired,
    starts_at: sub.startsAt,
    expires_at: sub.expiresAt,
    payment_note: sub.paymentNote,
    plan: {
      id: sub.plan.id,
      name: sub.plan.name,
      slug: sub.plan.slug,
      price_monthly_inr: toNumber(sub.plan.priceMonthlyInr),
      price_yearly_inr: toNumber(sub.plan.priceYearlyInr),
      max_trucks: sub.plan.maxTrucks,
      max_drivers: sub.plan.maxDrivers,
      features: {
        feature_ocr_vision: sub.plan.featureOcrVision,
        feature_fastag_auto_sync: sub.plan.featureFastagAutoSync,
        feature_emi_tracker: sub.plan.featureEmiTracker,
        feature_compliance_vault: sub.plan.featureComplianceVault,
        feature_driver_permissions: sub.plan.featureDriverPermissions,
        feature_monthly_analytics: sub.plan.featureMonthlyAnalytics,
      },
    },
    usage: {
      trucks_used: trucksUsed,
      max_trucks: sub.plan.maxTrucks,
      drivers_used: driversUsed,
      max_drivers: sub.plan.maxDrivers,
    },
  };
}

/**
 * Enforces that the Owner's active subscription package includes the given feature.
 */
export function requireFeature(feature: SubscriptionFeatureKey) {
  return async function checkFeature(request: FastifyRequest, reply: FastifyReply) {
    await authenticate(request, reply);
    if (reply.sent) return;
    if (request.user.role === UserRole.SUPER_ADMIN) return;

    const sub = await prisma.ownerSubscription.findUnique({
      where: { ownerId: request.user.ownerId },
      include: { plan: true },
    });

    if (!sub) {
      return reply.status(403).send({
        error: {
          code: 'NO_SUBSCRIPTION',
          message: 'No active subscription plan assigned. Contact platform admin.',
        },
      });
    }

    const isInactive =
      sub.status === SubscriptionStatus.SUSPENDED ||
      sub.status === SubscriptionStatus.EXPIRED ||
      sub.expiresAt.getTime() < Date.now();

    if (isInactive) {
      return reply.status(403).send({
        error: {
          code: 'SUBSCRIPTION_INACTIVE',
          message: 'Your subscription is expired or suspended. Contact admin to renew.',
        },
      });
    }

    if (!sub.plan[feature]) {
      return reply.status(403).send({
        error: {
          code: 'FEATURE_LOCKED',
          message: `This feature (${feature}) is not included in your ${sub.plan.name} plan. Upgrade to unlock.`,
        },
      });
    }
  };
}

export async function checkOwnerQuota(ownerId: string, resource: 'trucks' | 'drivers') {
  const sub = await prisma.ownerSubscription.findUnique({
    where: { ownerId },
    include: { plan: true },
  });
  if (!sub) {
    return { allowed: false, code: 'NO_SUBSCRIPTION', message: 'No active subscription plan assigned.' };
  }
  if (
    sub.status === SubscriptionStatus.SUSPENDED ||
    sub.status === SubscriptionStatus.EXPIRED ||
    sub.expiresAt.getTime() < Date.now()
  ) {
    return {
      allowed: false,
      code: 'SUBSCRIPTION_INACTIVE',
      message: 'Your subscription is expired or suspended.',
    };
  }

  if (resource === 'trucks') {
    const used = await prisma.vehicle.count({ where: { ownerId, isActive: true } });
    if (used >= sub.plan.maxTrucks) {
      return {
        allowed: false,
        code: 'QUOTA_EXCEEDED',
        message: `Truck limit reached (${used}/${sub.plan.maxTrucks}) on ${sub.plan.name}. Upgrade your plan to add more trucks.`,
      };
    }
  } else {
    const used = await prisma.user.count({ where: { ownerId, role: UserRole.DRIVER, isActive: true } });
    if (used >= sub.plan.maxDrivers) {
      return {
        allowed: false,
        code: 'QUOTA_EXCEEDED',
        message: `Driver limit reached (${used}/${sub.plan.maxDrivers}) on ${sub.plan.name}. Upgrade your plan to add more drivers.`,
      };
    }
  }

  return { allowed: true as const };
}
