import type { Prisma } from '@prisma/client';

export type ComplianceStatus = 'RED' | 'AMBER' | 'GREEN' | 'NO_EXPIRY';

export function toNumber(val: Prisma.Decimal | number | string | null | undefined): number {
  if (val === null || val === undefined) return 0;
  return Number(val);
}

export function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Normalize Indian vehicle registration numbers:
 * "MH-12 AB 1234" -> "MH12AB1234"
 */
export function normalizeVehicleNumber(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Normalize Indian phone numbers to 10 digits when prefixed with +91 / 91 / 0
 */
export function normalizeIndianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/**
 * Format a number in Indian numbering system: 125000 -> "₹1,25,000"
 */
export function formatINR(amount: number, decimals = 0): string {
  const negative = amount < 0;
  const formatted = Math.abs(amount).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${negative ? '-' : ''}₹${formatted}`;
}

/**
 * Compliance Expiry Badge:
 * - RED: expired (< 0 days) or expiring within 7 days (<= 7)
 * - AMBER: expiring within 8–30 days
 * - GREEN: valid (> 30 days)
 */
export function computeComplianceStatus(
  expiryDate: Date | null | undefined,
  now: Date = new Date(),
): { status: ComplianceStatus; daysRemaining: number | null } {
  if (!expiryDate) {
    return { status: 'NO_EXPIRY', daysRemaining: null };
  }
  const msPerDay = 1000 * 60 * 60 * 24;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfExpiry = new Date(
    expiryDate.getFullYear(),
    expiryDate.getMonth(),
    expiryDate.getDate(),
  ).getTime();
  const daysRemaining = Math.round((startOfExpiry - startOfToday) / msPerDay);

  if (daysRemaining <= 7) {
    return { status: 'RED', daysRemaining };
  }
  if (daysRemaining <= 30) {
    return { status: 'AMBER', daysRemaining };
  }
  return { status: 'GREEN', daysRemaining };
}

export interface TripAnalyticsInput {
  agreedFreight: number;
  fuelTotal: number;
  tollsTotal: number;
  approvedOtherExpenses: number;
  startOdometerKm: number | null;
  endOdometerKm: number | null;
  totalFuelLiters: number;
  baselineMileageKmpl: number;
}

export interface TripAnalyticsResult {
  agreed_freight: number;
  fuel_total: number;
  tolls_total: number;
  approved_other_expenses: number;
  total_cost: number;
  net_profit: number;
  distance_km: number | null;
  total_fuel_liters: number;
  true_mileage_kmpl: number | null;
  baseline_mileage_kmpl: number;
  mileage_drop_percent: number | null;
  mileage_red_flag: boolean;
}

/**
 * Computes Trip Net Profit, True Mileage, and >15% Red Flag Alert.
 */
export function computeTripAnalytics(input: TripAnalyticsInput): TripAnalyticsResult {
  const totalCost = round2(input.fuelTotal + input.tollsTotal + input.approvedOtherExpenses);
  const netProfit = round2(input.agreedFreight - totalCost);

  let distanceKm: number | null = null;
  let trueMileage: number | null = null;
  let mileageDropPercent: number | null = null;
  let mileageRedFlag = false;

  if (
    input.startOdometerKm !== null &&
    input.endOdometerKm !== null &&
    input.endOdometerKm > input.startOdometerKm
  ) {
    distanceKm = round2(input.endOdometerKm - input.startOdometerKm);
    if (input.totalFuelLiters > 0) {
      trueMileage = round2(distanceKm / input.totalFuelLiters);
      if (input.baselineMileageKmpl > 0) {
        mileageDropPercent = round2(
          ((input.baselineMileageKmpl - trueMileage) / input.baselineMileageKmpl) * 100,
        );
        mileageRedFlag = mileageDropPercent > 15;
      }
    }
  }

  return {
    agreed_freight: round2(input.agreedFreight),
    fuel_total: round2(input.fuelTotal),
    tolls_total: round2(input.tollsTotal),
    approved_other_expenses: round2(input.approvedOtherExpenses),
    total_cost: totalCost,
    net_profit: netProfit,
    distance_km: distanceKm,
    total_fuel_liters: round2(input.totalFuelLiters),
    true_mileage_kmpl: trueMileage,
    baseline_mileage_kmpl: round2(input.baselineMileageKmpl),
    mileage_drop_percent: mileageDropPercent,
    mileage_red_flag: mileageRedFlag,
  };
}
