import type { FastifyInstance } from 'fastify';
import { requireFeature } from '../middleware/auth.js';
import { ocrService } from '../services/ocrService.js';

export async function ocrRoutes(app: FastifyInstance) {
  app.post('/api/ocr/odometer', { preHandler: [requireFeature('featureOcrVision')] }, async (request, reply) => {
    let buffer: Buffer;
    let mimeType = 'image/jpeg';

    if (request.isMultipart()) {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: { code: 'FILE_REQUIRED', message: 'Odometer photo is required' } });
      }
      buffer = await file.toBuffer();
      mimeType = file.mimetype || mimeType;
    } else {
      const body = request.body as { image_base64?: string; mime_type?: string } | undefined;
      if (!body?.image_base64) {
        return reply.status(400).send({
          error: { code: 'IMAGE_REQUIRED', message: 'Provide multipart file or image_base64' },
        });
      }
      buffer = Buffer.from(body.image_base64, 'base64');
      mimeType = body.mime_type || mimeType;
    }

    const result = await ocrService.extractOdometer(buffer, mimeType);
    return result;
  });

  app.post('/api/ocr/fuel-bill', { preHandler: [requireFeature('featureOcrVision')] }, async (request, reply) => {
    let buffer: Buffer;
    let mimeType = 'image/jpeg';

    if (request.isMultipart()) {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: { code: 'FILE_REQUIRED', message: 'Fuel bill photo is required' } });
      }
      buffer = await file.toBuffer();
      mimeType = file.mimetype || mimeType;
    } else {
      const body = request.body as { image_base64?: string; mime_type?: string } | undefined;
      if (!body?.image_base64) {
        return reply.status(400).send({
          error: { code: 'IMAGE_REQUIRED', message: 'Provide multipart file or image_base64' },
        });
      }
      buffer = Buffer.from(body.image_base64, 'base64');
      mimeType = body.mime_type || mimeType;
    }

    const result = await ocrService.extractFuelBill(buffer, mimeType);
    return result;
  });
}
