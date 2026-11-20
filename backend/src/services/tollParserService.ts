import { normalizeVehicleNumber, round2 } from '../utils/formatters.js';

export interface ParsedFastagToll {
  vehicle_number: string;
  toll_plaza: string;
  amount_inr: number;
  transaction_time: Date;
  bank_source: string;
}

const INDIAN_VEHICLE_REGEX = /\b([A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,3}[-\s]?\d{3,4})\b/i;

function detectBank(subject: string, body: string, from = ''): string {
  const combined = `${from} ${subject} ${body}`.toLowerCase();
  if (combined.includes('icici')) return 'ICICI';
  if (combined.includes('hdfc')) return 'HDFC';
  if (combined.includes('sbi') || combined.includes('state bank')) return 'SBI';
  if (combined.includes('idfc')) return 'IDFC';
  if (combined.includes('airtel')) return 'AIRTEL';
  return 'UNKNOWN';
}

function extractAmount(text: string): number | null {
  const patterns = [
    /(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.\d{1,2})?)/i,
    /debited\s+(?:with|by|for)\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
    /amount\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
  ];
  for (const regex of patterns) {
    const match = text.match(regex);
    if (match?.[1]) {
      const value = Number(match[1].replace(/,/g, ''));
      if (!Number.isNaN(value) && value > 0) {
        return round2(value);
      }
    }
  }
  return null;
}

function extractTollPlaza(text: string): string | null {
  const patterns = [
    /(?:at|plaza(?:\s*name)?\s*[:\-]?)\s*([A-Za-z0-9][A-Za-z0-9\s\-&()\/]{2,80}?(?:Toll\s*Plaza|Plaza|Expressway|Highway|Fee\s*Plaza))/i,
    /Toll\s*Plaza\s*[:\-]\s*([^\n.,;]{3,80})/i,
    /at\s+([A-Za-z0-9\s\-]{3,60}?)\s+on\s+\d{1,2}[-\/]/i,
  ];
  for (const regex of patterns) {
    const match = text.match(regex);
    if (match?.[1]) {
      return match[1].trim().replace(/\s+/g, ' ');
    }
  }
  return null;
}

function extractTimestamp(text: string): Date {
  // Matches formats like 19-11-2026 14:35:00, 19/11/2026 02:35 PM, 2026-11-19 14:35
  const dmyMatch = text.match(
    /(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})(?:[,\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i,
  );
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]) - 1;
    let year = Number(dmyMatch[3]);
    if (year < 100) year += 2000;
    let hour = dmyMatch[4] ? Number(dmyMatch[4]) : 0;
    const min = dmyMatch[5] ? Number(dmyMatch[5]) : 0;
    const sec = dmyMatch[6] ? Number(dmyMatch[6]) : 0;
    const meridiem = dmyMatch[7]?.toUpperCase();
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    const parsed = new Date(year, month, day, hour, min, sec);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const isoMatch = text.match(/(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?)/);
  if (isoMatch?.[1]) {
    const parsed = new Date(isoMatch[1]);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

/**
 * Parses FASTag toll alert emails from major Indian banks (ICICI, HDFC, SBI, IDFC, Airtel).
 */
export function parseFastagEmail(input: {
  subject: string;
  body: string;
  from?: string;
}): ParsedFastagToll | null {
  const combined = `${input.subject}\n${input.body}`;
  const bankSource = detectBank(input.subject, input.body, input.from);

  const vehicleMatch = combined.match(INDIAN_VEHICLE_REGEX);
  const amount = extractAmount(combined);
  const plaza = extractTollPlaza(combined);

  if (!vehicleMatch?.[1] || amount === null) {
    return null;
  }

  return {
    vehicle_number: normalizeVehicleNumber(vehicleMatch[1]),
    toll_plaza: plaza ?? 'Highway Toll Plaza',
    amount_inr: amount,
    transaction_time: extractTimestamp(combined),
    bank_source: bankSource,
  };
}
