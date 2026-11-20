import { describe, expect, it } from 'vitest';
import { parseFastagEmail } from '../services/tollParserService.js';

describe('FASTag Inbound Email Parser (Indian Banks)', () => {
  it('parses ICICI Bank FASTag email', () => {
    const parsed = parseFastagEmail({
      from: 'fastag@icicibank.com',
      subject: 'ICICI Bank FASTag Transaction Alert',
      body: 'Dear Customer, Rs. 685.00 has been debited from your FASTag wallet for vehicle MH-12 AB 1234 at Khalapur Toll Plaza on 19-11-2026 14:35:00.',
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.bank_source).toBe('ICICI');
    expect(parsed?.vehicle_number).toBe('MH12AB1234');
    expect(parsed?.amount_inr).toBe(685);
    expect(parsed?.toll_plaza).toContain('Khalapur Toll Plaza');
  });

  it('parses HDFC Bank FASTag email', () => {
    const parsed = parseFastagEmail({
      from: 'alerts@hdfcbank.net',
      subject: 'HDFC Bank FASTag Debit Alert',
      body: 'INR 1,245.50 debited for Vehicle No WB23CD5678 at Dankuni Fee Plaza on 19/11/2026 09:15 AM.',
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.bank_source).toBe('HDFC');
    expect(parsed?.vehicle_number).toBe('WB23CD5678');
    expect(parsed?.amount_inr).toBe(1245.5);
    expect(parsed?.toll_plaza).toContain('Dankuni Fee Plaza');
  });

  it('parses SBI FASTag email', () => {
    const parsed = parseFastagEmail({
      from: 'fastag@sbi.co.in',
      subject: 'SBI FASTag Toll Deduction',
      body: 'Your SBI FASTag linked to GJ01XY9988 is debited by ₹420 at Bharuch Toll Plaza on 18-11-2026 22:10.',
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.bank_source).toBe('SBI');
    expect(parsed?.vehicle_number).toBe('GJ01XY9988');
    expect(parsed?.amount_inr).toBe(420);
  });

  it('parses IDFC FIRST Bank FASTag email', () => {
    const parsed = parseFastagEmail({
      from: 'fastag@idfcfirstbank.com',
      subject: 'IDFC FIRST FASTag Alert',
      body: 'Vehicle TN09KL4455 crossed Krishnagiri Toll Plaza. Amount: Rs 515.00 on 19-11-2026 11:00.',
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.bank_source).toBe('IDFC');
    expect(parsed?.vehicle_number).toBe('TN09KL4455');
    expect(parsed?.amount_inr).toBe(515);
  });

  it('parses Airtel Payments Bank FASTag email', () => {
    const parsed = parseFastagEmail({
      from: 'alerts@airtelbank.com',
      subject: 'Airtel FASTag Transaction',
      body: 'Rs. 310 debited for MH12AB1234 at Talegaon Toll Plaza on 19-11-2026 16:40.',
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.bank_source).toBe('AIRTEL');
    expect(parsed?.vehicle_number).toBe('MH12AB1234');
    expect(parsed?.amount_inr).toBe(310);
  });
});
