import { describe, expect, it } from 'vitest';
import { createOcrService } from '../services/ocrService.js';

describe('ocrService (mock mode)', () => {
  const ocr = createOcrService('mock');

  it('extracts odometer reading with confidence', async () => {
    const res = await ocr.extractOdometer(Buffer.from('fake-odometer-image'));
    expect(res.odometer_km).toBeGreaterThan(100000);
    expect(res.confidence).toBeGreaterThan(0.8);
  });

  it('extracts fuel bill fields with consistent total = liters * rate', async () => {
    const res = await ocr.extractFuelBill(Buffer.from('fake-fuel-bill-image'));
    expect(res.liters).toBeGreaterThan(0);
    expect(res.rate_per_liter).toBeGreaterThan(0);
    expect(res.total_amount).toBeCloseTo(res.liters * res.rate_per_liter, 2);
    expect(res.pump_name).toBeTruthy();
  });
});
