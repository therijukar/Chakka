import { describe, expect, it } from 'vitest';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';
import bn from '../i18n/locales/bn.json';
import mr from '../i18n/locales/mr.json';
import ta from '../i18n/locales/ta.json';
import { formatINR, generateClientId } from '../utils/formatters';

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v as Record<string, unknown>, full));
    } else {
      keys.push(full);
    }
  }
  return keys.sort();
}

describe('Mobile i18n & utilities', () => {
  const enKeys = flattenKeys(en);

  it.each([
    ['hi (Hindi)', hi],
    ['bn (Bengali)', bn],
    ['mr (Marathi)', mr],
    ['ta (Tamil)', ta],
  ])('has 100% key parity with en.json for %s', (_label, localeObj) => {
    expect(flattenKeys(localeObj)).toEqual(enKeys);
  });

  it('formats Indian Rupee amounts accurately', () => {
    expect(formatINR(125000)).toBe('₹1,25,000');
    expect(formatINR(78500)).toBe('₹78,500');
    expect(formatINR(0)).toBe('₹0');
  });

  it('generates unique UUID v4 client IDs', () => {
    const a = generateClientId();
    const b = generateClientId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});
