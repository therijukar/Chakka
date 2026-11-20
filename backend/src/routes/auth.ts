import type { FastifyInstance } from 'fastify';
import { LanguageCode, SubscriptionStatus, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { authenticate, getOwnerSubscriptionSummary } from '../middleware/auth.js';
import { normalizeIndianPhone } from '../utils/formatters.js';

const ownerRegisterSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().min(10).max(20),
  email: z.string().email().optional().or(z.literal('')),
  password: z.string().min(6).max(100),
  language: z.nativeEnum(LanguageCode).default('en'),
  plan_id: z.string().uuid().optional(),
  billing_cycle: z.enum(['monthly', 'yearly']).default('monthly'),
});

const updateProfileSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().min(10).max(20).optional(),
  email: z.string().email().nullable().optional().or(z.literal('')),
  language: z.nativeEnum(LanguageCode).optional(),
  current_password: z.string().min(1).optional(),
  new_password: z.string().min(6).max(100).optional(),
});

const passwordLoginSchema = z.object({
  phone: z.string().min(10).max(20),
  password: z.string().min(1),
});

const driverLoginSchema = z.object({
  phone: z.string().min(10).max(20),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
});

const updateLanguageSchema = z.object({
  language: z.nativeEnum(LanguageCode),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/super-admin/login', async (request, reply) => {
    const body = passwordLoginSchema.parse(request.body);
    const phone = normalizeIndianPhone(body.phone);

    const admin = await prisma.user.findUnique({ where: { phone } });
    if (!admin || admin.role !== UserRole.SUPER_ADMIN || !admin.passwordHash || !admin.isActive) {
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid Super Admin phone or password' },
      });
    }

    const valid = await bcrypt.compare(body.password, admin.passwordHash);
    if (!valid) {
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid Super Admin phone or password' },
      });
    }

    const token = app.jwt.sign({
      sub: admin.id,
      role: admin.role,
      ownerId: admin.id,
    });

    return {
      token,
      user: {
        id: admin.id,
        role: admin.role,
        name: admin.name,
        phone: admin.phone,
        email: admin.email,
      },
    };
  });

  app.post('/api/auth/owner/register', async (request, reply) => {
    const body = ownerRegisterSchema.parse(request.body);
    const phone = normalizeIndianPhone(body.phone);

    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      return reply.status(409).send({
        error: { code: 'PHONE_EXISTS', message: 'Phone number is already registered' },
      });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const slug = `${phone.slice(-6)}${Math.random().toString(36).slice(2, 5)}`;
    const inboundTollEmail = `owner_${slug}@${env.TOLL_EMAIL_DOMAIN}`;

    const selectedPlan = body.plan_id
      ? await prisma.subscriptionPlan.findFirst({
          where: { id: body.plan_id, isActive: true },
        })
      : await prisma.subscriptionPlan.findFirst({
          where: { isActive: true },
          orderBy: { priceMonthlyInr: 'asc' },
        });

    if (body.plan_id && !selectedPlan) {
      return reply.status(400).send({
        error: { code: 'INVALID_PLAN', message: 'Selected subscription plan is not available' },
      });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (body.billing_cycle === 'yearly' ? 365 : 30));

    const owner = await prisma.user.create({
      data: {
        role: UserRole.OWNER,
        name: body.name,
        phone,
        email: body.email || null,
        passwordHash,
        language: body.language,
        inboundTollEmail,
        ...(selectedPlan
          ? {
              subscription: {
                create: {
                  planId: selectedPlan.id,
                  status: SubscriptionStatus.ACTIVE,
                  expiresAt,
                  paymentNote: `Self-serve Auto-Activated (${body.billing_cycle}, no payment required)`,
                },
              },
            }
          : {}),
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
      select: {
        id: true,
        role: true,
        name: true,
        phone: true,
        email: true,
        language: true,
        inboundTollEmail: true,
      },
    });

    const token = app.jwt.sign({
      sub: owner.id,
      role: owner.role,
      ownerId: owner.id,
    });

    const subscription = await getOwnerSubscriptionSummary(owner.id);
    return reply.status(201).send({ token, user: { ...owner, subscription } });
  });

  app.post('/api/auth/owner/login', async (request, reply) => {
    const body = passwordLoginSchema.parse(request.body);
    const phone = normalizeIndianPhone(body.phone);

    const owner = await prisma.user.findUnique({ where: { phone } });
    if (!owner || owner.role !== UserRole.OWNER || !owner.passwordHash || !owner.isActive) {
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid phone number or password' },
      });
    }

    const valid = await bcrypt.compare(body.password, owner.passwordHash);
    if (!valid) {
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid phone number or password' },
      });
    }

    const token = app.jwt.sign({
      sub: owner.id,
      role: owner.role,
      ownerId: owner.id,
    });

    const subscription = await getOwnerSubscriptionSummary(owner.id);

    return {
      token,
      user: {
        id: owner.id,
        role: owner.role,
        name: owner.name,
        phone: owner.phone,
        email: owner.email,
        language: owner.language,
        inboundTollEmail: owner.inboundTollEmail,
        subscription,
      },
    };
  });

  app.post('/api/auth/driver/login', async (request, reply) => {
    const body = driverLoginSchema.parse(request.body);
    const phone = normalizeIndianPhone(body.phone);

    const driver = await prisma.user.findUnique({
      where: { phone },
      include: {
        permissions: true,
        assignedVehicle: true,
      },
    });

    if (!driver || driver.role !== UserRole.DRIVER || !driver.pinHash || !driver.ownerId || !driver.isActive) {
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid phone number or 4-digit PIN' },
      });
    }

    const valid = await bcrypt.compare(body.pin, driver.pinHash);
    if (!valid) {
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid phone number or 4-digit PIN' },
      });
    }

    const token = app.jwt.sign({
      sub: driver.id,
      role: driver.role,
      ownerId: driver.ownerId,
    });

    const subscription = await getOwnerSubscriptionSummary(driver.ownerId);

    return {
      token,
      user: {
        id: driver.id,
        role: driver.role,
        name: driver.name,
        phone: driver.phone,
        language: driver.language,
        ownerId: driver.ownerId,
        assignedVehicle: driver.assignedVehicle,
        permissions: driver.permissions,
        subscription,
      },
    };
  });

  app.get('/api/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      include: {
        permissions: true,
        assignedVehicle: true,
      },
    });
    if (!user) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const subscription =
      user.role !== UserRole.SUPER_ADMIN
        ? await getOwnerSubscriptionSummary(user.ownerId ?? user.id)
        : null;

    return {
      id: user.id,
      role: user.role,
      name: user.name,
      phone: user.phone,
      email: user.email,
      language: user.language,
      ownerId: user.ownerId ?? user.id,
      inboundTollEmail: user.inboundTollEmail,
      assignedVehicle: user.assignedVehicle,
      permissions: user.permissions,
      subscription,
    };
  });

  app.patch('/api/auth/language', { preHandler: [authenticate] }, async (request) => {
    const body = updateLanguageSchema.parse(request.body);
    const updated = await prisma.user.update({
      where: { id: request.user.sub },
      data: { language: body.language },
      select: { id: true, language: true },
    });
    return updated;
  });

  app.patch('/api/auth/profile', { preHandler: [authenticate] }, async (request, reply) => {
    const body = updateProfileSchema.parse(request.body);
    const currentUser = await prisma.user.findUnique({ where: { id: request.user.sub } });
    if (!currentUser) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const updateData: {
      name?: string;
      phone?: string;
      email?: string | null;
      language?: LanguageCode;
      passwordHash?: string;
    } = {};

    if (body.name !== undefined) {
      updateData.name = body.name.trim();
    }

    if (body.phone !== undefined) {
      const normalized = normalizeIndianPhone(body.phone);
      if (normalized !== currentUser.phone) {
        const existingPhone = await prisma.user.findUnique({ where: { phone: normalized } });
        if (existingPhone && existingPhone.id !== currentUser.id) {
          return reply.status(409).send({
            error: { code: 'PHONE_EXISTS', message: 'Phone number is already in use by another account' },
          });
        }
        updateData.phone = normalized;
      }
    }

    if (body.email !== undefined) {
      updateData.email = body.email ? body.email.trim() : null;
    }

    if (body.language !== undefined) {
      updateData.language = body.language;
    }

    if (body.new_password) {
      if (currentUser.passwordHash) {
        if (!body.current_password) {
          return reply.status(400).send({
            error: { code: 'CURRENT_PASSWORD_REQUIRED', message: 'Current password is required to set a new password' },
          });
        }
        const valid = await bcrypt.compare(body.current_password, currentUser.passwordHash);
        if (!valid) {
          return reply.status(401).send({
            error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' },
          });
        }
      }
      updateData.passwordHash = await bcrypt.hash(body.new_password, 10);
    }

    const updated = await prisma.user.update({
      where: { id: currentUser.id },
      data: updateData,
      include: {
        permissions: true,
        assignedVehicle: true,
      },
    });

    const subscription =
      updated.role !== UserRole.SUPER_ADMIN
        ? await getOwnerSubscriptionSummary(updated.ownerId ?? updated.id)
        : null;

    return {
      user: {
        id: updated.id,
        role: updated.role,
        name: updated.name,
        phone: updated.phone,
        email: updated.email,
        language: updated.language,
        ownerId: updated.ownerId ?? updated.id,
        inboundTollEmail: updated.inboundTollEmail,
        assignedVehicle: updated.assignedVehicle,
        permissions: updated.permissions,
        subscription,
      },
    };
  });
}
