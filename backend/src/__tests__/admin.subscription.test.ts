import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { prisma } from '../lib/prisma.js';

describe('Super Admin & Subscription Feature/Quota Enforcement', () => {
  let app: FastifyInstance;
  let adminToken = '';
  let testPlanId = '';
  let testOwnerId = '';
  let testOwnerToken = '';
  const testPhone = `97${Math.floor(10000000 + Math.random() * 89999999)}`;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/super-admin/login',
      payload: { phone: '9999999999', password: 'SuperAdmin@123' },
    });
    expect(loginRes.statusCode).toBe(200);
    adminToken = loginRes.json().token;
  });

  afterAll(async () => {
    if (testOwnerId) {
      await prisma.user.delete({ where: { id: testOwnerId } }).catch(() => {});
    }
    if (testPlanId) {
      await prisma.subscriptionPlan.delete({ where: { id: testPlanId } }).catch(() => {});
    }
    await app.close();
  });

  it('serves the Super Admin web dashboard at GET /admin', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Fleet &amp; Trip Super Admin');
  });

  it('enforces feature flags and truck quotas dynamically controlled by Super Admin', async () => {
    // 1. Super Admin creates a restricted plan (1 truck max, EMI tracker disabled)
    const planRes = await app.inject({
      method: 'POST',
      url: '/api/admin/plans',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: `Test Mini ${Date.now()}`,
        price_monthly_inr: 299,
        price_yearly_inr: 2999,
        max_trucks: 1,
        max_drivers: 2,
        feature_emi_tracker: false,
        feature_ocr_vision: false,
      },
    });
    expect(planRes.statusCode).toBe(201);
    testPlanId = planRes.json().plan.id;

    // 2. Super Admin creates a new Fleet Owner on that plan
    const ownerRes = await app.inject({
      method: 'POST',
      url: '/api/admin/owners',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Test Fleet Owner',
        phone: testPhone,
        password: 'TestUser@123',
        plan_id: testPlanId,
        duration_days: 30,
      },
    });
    expect(ownerRes.statusCode).toBe(201);
    testOwnerId = ownerRes.json().owner.id;

    // 3. New Owner logs in
    const ownerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/owner/login',
      payload: { phone: testPhone, password: 'TestUser@123' },
    });
    expect(ownerLogin.statusCode).toBe(200);
    testOwnerToken = ownerLogin.json().token;
    expect(ownerLogin.json().user.subscription.plan.features.feature_emi_tracker).toBe(false);

    // 4. EMI endpoint is blocked with 403 FEATURE_LOCKED
    const lockedEmi = await app.inject({
      method: 'GET',
      url: '/api/emis',
      headers: { authorization: `Bearer ${testOwnerToken}` },
    });
    expect(lockedEmi.statusCode).toBe(403);
    expect(lockedEmi.json().error.code).toBe('FEATURE_LOCKED');

    // 5. Truck quota allows 1st truck, blocks 2nd truck with 403 QUOTA_EXCEEDED
    const truck1 = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${testOwnerToken}` },
      payload: { vehicle_number: 'DL01AA1111', baseline_mileage_kmpl: 4.0 },
    });
    expect(truck1.statusCode).toBe(201);

    const truck2 = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${testOwnerToken}` },
      payload: { vehicle_number: 'DL01AA2222', baseline_mileage_kmpl: 4.0 },
    });
    expect(truck2.statusCode).toBe(403);
    expect(truck2.json().error.code).toBe('QUOTA_EXCEEDED');

    // 6. Super Admin toggles feature_emi_tracker ON live -> Owner immediately unlocked!
    const toggleRes = await app.inject({
      method: 'PATCH',
      url: `/api/admin/plans/${testPlanId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { feature_emi_tracker: true },
    });
    expect(toggleRes.statusCode).toBe(200);

    const unlockedEmi = await app.inject({
      method: 'GET',
      url: '/api/emis',
      headers: { authorization: `Bearer ${testOwnerToken}` },
    });
    expect(unlockedEmi.statusCode).toBe(200);
  });
});
