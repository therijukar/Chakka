import { describe, expect, it } from 'vitest';
import {
  computeComplianceStatus,
  computeTripAnalytics,
  formatINR,
  normalizeIndianPhone,
  normalizeVehicleNumber,
} from '../utils/formatters.js';

describe('formatters & Indian domain utilities', () => {
  it('formats INR using Indian numbering system', () => {
    expect(formatINR(125000)).toBe('₹1,25,000');
    expect(formatINR(3200000)).toBe('₹32,00,000');
    expect(formatINR(-15500)).toBe('-₹15,500');
  });

  it('normalizes Indian vehicle registration numbers', () => {
    expect(normalizeVehicleNumber('MH-12 AB 1234')).toBe('MH12AB1234');
    expect(normalizeVehicleNumber(' wb 23 cd 5678 ')).toBe('WB23CD5678');
  });

  it('normalizes Indian phone numbers', () => {
    expect(normalizeIndianPhone('+91 98765-43210')).toBe('9876543210');
    expect(normalizeIndianPhone('09811112222')).toBe('9811112222');
  });

  it('classifies compliance expiry dates into RED, AMBER, GREEN', () => {
    const now = new Date('2026-11-19T12:00:00Z');
    expect(computeComplianceStatus(new Date('2026-11-15T00:00:00Z'), now).status).toBe('RED');
    expect(computeComplianceStatus(new Date('2026-11-26T00:00:00Z'), now).status).toBe('RED');
    expect(computeComplianceStatus(new Date('2026-12-05T00:00:00Z'), now).status).toBe('AMBER');
    expect(computeComplianceStatus(new Date('2027-03-01T00:00:00Z'), now).status).toBe('GREEN');
    expect(computeComplianceStatus(null, now).status).toBe('NO_EXPIRY');
  });

  it('computes Trip Net Profit, True Mileage, and >15% Red Flag Alert', () => {
    // Baseline 4.20 km/L, actual = 600 / 200 = 3.00 km/L -> ~28.57% drop -> RED FLAG
    const flagged = computeTripAnalytics({
      agreedFreight: 65000,
      fuelTotal: 18600,
      tollsTotal: 2400,
      approvedOtherExpenses: 4000,
      startOdometerKm: 124500,
      endOdometerKm: 125100,
      totalFuelLiters: 200,
      baselineMileageKmpl: 4.2,
    });
    expect(flagged.total_cost).toBe(25000);
    expect(flagged.net_profit).toBe(40000);
    expect(flagged.distance_km).toBe(600);
    expect(flagged.true_mileage_kmpl).toBe(3);
    expect(flagged.mileage_red_flag).toBe(true);

    // Baseline 4.20 km/L, actual = 600 / 150 = 4.00 km/L -> ~4.76% drop -> NO RED FLAG
    const healthy = computeTripAnalytics({
      agreedFreight: 65000,
      fuelTotal: 13950,
      tollsTotal: 2400,
      approvedOtherExpenses: 3650,
      startOdometerKm: 124500,
      endOdometerKm: 125100,
      totalFuelLiters: 150,
      baselineMileageKmpl: 4.2,
    });
    expect(healthy.true_mileage_kmpl).toBe(4);
    expect(healthy.mileage_red_flag).toBe(false);
  });
});
