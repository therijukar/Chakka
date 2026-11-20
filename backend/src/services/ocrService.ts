import { z } from 'zod';
import { env } from '../config/env.js';
import { round2 } from '../utils/formatters.js';

export const odometerResultSchema = z.object({
  odometer_km: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
});

export const fuelBillResultSchema = z.object({
  liters: z.number().positive(),
  rate_per_liter: z.number().positive(),
  total_amount: z.number().positive(),
  pump_name: z.string().optional(),
  bill_date: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export type OdometerOcrResult = z.infer<typeof odometerResultSchema>;
export type FuelBillOcrResult = z.infer<typeof fuelBillResultSchema>;

export interface OcrProvider {
  extractOdometer(imageBuffer: Buffer, mimeType?: string): Promise<OdometerOcrResult>;
  extractFuelBill(imageBuffer: Buffer, mimeType?: string): Promise<FuelBillOcrResult>;
}

class MockOcrProvider implements OcrProvider {
  async extractOdometer(imageBuffer: Buffer): Promise<OdometerOcrResult> {
    // Deterministic mock reading derived lightly from buffer length so tests are predictable
    const offset = imageBuffer.length % 500;
    return {
      odometer_km: 125400 + offset,
      confidence: 0.96,
    };
  }

  async extractFuelBill(imageBuffer: Buffer): Promise<FuelBillOcrResult> {
    const liters = round2(100 + (imageBuffer.length % 40));
    const rate = 93.25;
    return {
      liters,
      rate_per_liter: rate,
      total_amount: round2(liters * rate),
      pump_name: 'IndianOil Highway Fuel Station',
      bill_date: new Date().toISOString().slice(0, 10),
      confidence: 0.94,
    };
  }
}

class GeminiFlashOcrProvider implements OcrProvider {
  private readonly apiKey: string;
  private readonly endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async callGeminiJson(prompt: string, imageBuffer: Buffer, mimeType: string): Promise<unknown> {
    const base64Data = imageBuffer.toString('base64');
    const res = await fetch(`${this.endpoint}?key=${encodeURIComponent(this.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
    });

    if (!res.ok) {
      const bodyText = await res.text();
      throw new Error(`Gemini OCR request failed (${res.status}): ${bodyText}`);
    }

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error('Gemini OCR returned empty content');
    }
    return JSON.parse(rawText);
  }

  async extractOdometer(imageBuffer: Buffer, mimeType = 'image/jpeg'): Promise<OdometerOcrResult> {
    const prompt =
      'Extract the truck dashboard odometer reading in kilometers from this photo. ' +
      'Return strict JSON only: {"odometer_km": number, "confidence": number between 0 and 1}.';
    const parsed = await this.callGeminiJson(prompt, imageBuffer, mimeType);
    return odometerResultSchema.parse(parsed);
  }

  async extractFuelBill(imageBuffer: Buffer, mimeType = 'image/jpeg'): Promise<FuelBillOcrResult> {
    const prompt =
      'Extract Indian petrol/diesel pump bill details from this receipt photo. ' +
      'Return strict JSON only: {"liters": number, "rate_per_liter": number, "total_amount": number, "pump_name": string, "bill_date": "YYYY-MM-DD", "confidence": number between 0 and 1}.';
    const parsed = await this.callGeminiJson(prompt, imageBuffer, mimeType);
    const validated = fuelBillResultSchema.parse(parsed);
    return {
      ...validated,
      total_amount: round2(validated.total_amount || validated.liters * validated.rate_per_liter),
    };
  }
}

export function createOcrService(mode: 'mock' | 'gemini' = env.OCR_MODE, apiKey = env.GEMINI_API_KEY): OcrProvider {
  if (mode === 'gemini' && apiKey) {
    return new GeminiFlashOcrProvider(apiKey);
  }
  return new MockOcrProvider();
}

export const ocrService = createOcrService();
