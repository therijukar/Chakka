import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { prisma } from '../lib/prisma.js';

describe('Backend API Integration (MySQL + Fastify)', () => {
  let app: FastifyInstance;
  let ownerToken = '';
  let driver1Token = '';
  let driver2Token = '';
  const createdTripClientIds: string[] = [];
  const createdExpenseClientIds: string[] = [];
  const createdRawEmailIds: string[] = [];

  beforeAll(async () => {
    app = buildServer();
    await app.ready();

    // Login seeded Owner
    const ownerRes = await app.inject({
      method: 'POST',
      url: '/api/auth/owner/login',
      payload: { phone: '9876543210', password: 'Owner@123' },
    });
    expect(ownerRes.statusCode).toBe(200);
    ownerToken = ownerRes.json().token;

    // Login seeded Driver 1 (Ramesh, PIN 1234)
    const d1Res = await app.inject({
      method: 'POST',
      url: '/api/auth/driver/login',
      payload: { phone: '9811112222', pin: '1234' },
    });
    expect(d1Res.statusCode).toBe(200);
    driver1Token = d1Res.json().token;

    // Login seeded Driver 2 (Suresh, PIN 5678, canAddOtherExpenses=false)
    const d2Res = await app.inject({
      method: 'POST',
      url: '/api/auth/driver/login',
      payload: { phone: '9822223333', pin: '5678' },
    });
    expect(d2Res.statusCode).toBe(200);
    driver2Token = d2Res.json().token;
  });

  afterAll(async () => {
    if (createdExpenseClientIds.length > 0) {
      await prisma.expense.deleteMany({ where: { clientId: { in: createdExpenseClientIds } } });
    }
    if (createdTripClientIds.length > 0) {
      await prisma.trip.deleteMany({ where: { clientId: { in: createdTripClientIds } } });
    }
    if (createdRawEmailIds.length > 0) {
      await prisma.toll.deleteMany({ where: { rawEmailId: { in: createdRawEmailIds } } });
    }
    await app.close();
  });

  it('enforces granular driver permission toggles', async () => {
    const vehiclesRes = await app.inject({
      method: 'GET',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const catsRes = await app.inject({
      method: 'GET',
      url: '/api/expense-categories',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const vehicleId = vehiclesRes.json().vehicles[0].id;
    const foodCat = catsRes.json().categories.find((c: { isFuel: boolean }) => !c.isFuel);

    // Driver 2 has can_add_other_expenses = false -> should get 403
    const deniedRes = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      headers: { authorization: `Bearer ${driver2Token}` },
      payload: {
        client_id: `test-denied-${crypto.randomUUID()}`,
        vehicle_id: vehicleId,
        category_id: foodCat.id,
        amount: 250,
      },
    });
    expect(deniedRes.statusCode).toBe(403);
    expect(deniedRes.json().error.code).toBe('PERMISSION_DENIED');
  });

  it('guarantees idempotent trip and fuel expense creation on client_id', async () => {
    const vehiclesRes = await app.inject({
      method: 'GET',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${driver1Token}` },
    });
    const catsRes = await app.inject({
      method: 'GET',
      url: '/api/expense-categories',
      headers: { authorization: `Bearer ${driver1Token}` },
    });
    const vehicleId = vehiclesRes.json().vehicles[0].id;
    const dieselCat = catsRes.json().categories.find((c: { isFuel: boolean }) => c.isFuel);

    const tripClientId = `test-trip-${crypto.randomUUID()}`;
    createdTripClientIds.push(tripClientId);

    const firstTrip = await app.inject({
      method: 'POST',
      url: '/api/trips',
      headers: { authorization: `Bearer ${driver1Token}` },
      payload: {
        client_id: tripClientId,
        vehicle_id: vehicleId,
        origin: 'Mumbai',
        destination: 'Surat',
        agreed_freight: 32000,
        start_odometer_km: 130000,
      },
    });
    expect(firstTrip.statusCode).toBe(201);
    expect(firstTrip.json().idempotent).toBe(false);

    // Replay same client_id -> 200 idempotent, same ID
    const replayTrip = await app.inject({
      method: 'POST',
      url: '/api/trips',
      headers: { authorization: `Bearer ${driver1Token}` },
      payload: {
        client_id: tripClientId,
        vehicle_id: vehicleId,
        origin: 'Mumbai',
        destination: 'Surat',
        agreed_freight: 32000,
        start_odometer_km: 130000,
      },
    });
    expect(replayTrip.statusCode).toBe(200);
    expect(replayTrip.json().idempotent).toBe(true);
    expect(replayTrip.json().trip.id).toBe(firstTrip.json().trip.id);

    // Fuel expense with auto-calculated amount = liters * rate_per_liter
    const expClientId = `test-exp-${crypto.randomUUID()}`;
    createdExpenseClientIds.push(expClientId);

    const firstExp = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      headers: { authorization: `Bearer ${driver1Token}` },
      payload: {
        client_id: expClientId,
        trip_id: firstTrip.json().trip.id,
        vehicle_id: vehicleId,
        category_id: dieselCat.id,
        liters: 50,
        rate_per_liter: 94.5,
      },
    });
    expect(firstExp.statusCode).toBe(201);
    expect(Number(firstExp.json().expense.amount)).toBe(4725);

    const replayExp = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      headers: { authorization: `Bearer ${driver1Token}` },
      payload: {
        client_id: expClientId,
        trip_id: firstTrip.json().trip.id,
        vehicle_id: vehicleId,
        category_id: dieselCat.id,
        liters: 50,
        rate_per_liter: 94.5,
      },
    });
    expect(replayExp.statusCode).toBe(200);
    expect(replayExp.json().idempotent).toBe(true);
    expect(replayExp.json().expense.id).toBe(firstExp.json().expense.id);
  });

  it('returns EMI summary with auto-calculated emis_remaining and compliance Red/Amber/Green counts', async () => {
    const emiRes = await app.inject({
      method: 'GET',
      url: '/api/emis',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(emiRes.statusCode).toBe(200);
    const emis = emiRes.json().emis;
    expect(emis.length).toBeGreaterThanOrEqual(2);
    expect(emis[0].emis_remaining).toBe(emis[0].total_tenure_months - emis[0].emis_paid);

    const compRes = await app.inject({
      method: 'GET',
      url: '/api/compliance/summary',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(compRes.statusCode).toBe(200);
    expect(compRes.json().counts.red).toBeGreaterThanOrEqual(1);
    expect(compRes.json().counts.amber).toBeGreaterThanOrEqual(1);
    expect(compRes.json().counts.green).toBeGreaterThanOrEqual(1);
  });

  it('processes FASTag inbound email webhook, matches active trip, and deduplicates replays', async () => {
    const rawEmailId = `msg-${crypto.randomUUID()}`;
    createdRawEmailIds.push(rawEmailId);

    const webhookRes = await app.inject({
      method: 'POST',
      url: '/api/webhooks/inbound-email',
      payload: {
        to: 'owner_rajesh@tolls.fleetapp.in',
        from: 'fastag@icicibank.com',
        subject: 'ICICI FASTag Alert',
        text: 'Rs. 540.00 debited for vehicle MH12AB1234 at Bharuch Toll Plaza on 19-11-2026 15:20:00.',
        message_id: rawEmailId,
      },
    });
    expect(webhookRes.statusCode).toBe(201);
    expect(webhookRes.json().matched_vehicle).toBe(true);
    expect(webhookRes.json().matched_active_trip).toBe(true);
    expect(Number(webhookRes.json().toll.amount)).toBe(540);

    // Replay same message_id
    const replayRes = await app.inject({
      method: 'POST',
      url: '/api/webhooks/inbound-email',
      payload: {
        to: 'owner_rajesh@tolls.fleetapp.in',
        from: 'fastag@icicibank.com',
        subject: 'ICICI FASTag Alert',
        text: 'Rs. 540.00 debited for vehicle MH12AB1234 at Bharuch Toll Plaza on 19-11-2026 15:20:00.',
        message_id: rawEmailId,
      },
    });
    expect(replayRes.statusCode).toBe(200);
    expect(replayRes.json().idempotent).toBe(true);
  });
});
