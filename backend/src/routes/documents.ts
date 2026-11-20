import type { FastifyInstance } from 'fastify';
import { DocumentType, UserRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireDriverPermission, requireFeature, requireOwner } from '../middleware/auth.js';
import { getStorageService } from '../services/storageService.js';
import { computeComplianceStatus } from '../utils/formatters.js';

const docMetadataSchema = z.object({
  vehicle_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  doc_type: z.nativeEnum(DocumentType),
  title: z.string().min(2).max(150),
  document_number: z.string().max(80).optional(),
  issue_date: z.string().datetime().optional(),
  expiry_date: z.string().datetime().optional(),
});

export async function documentRoutes(app: FastifyInstance) {
  const storage = getStorageService();

  // List documents (Owners see all; Drivers with can_view_doc_vault see only their assigned truck & own docs)
  app.get(
    '/api/documents',
    { preHandler: [requireFeature('featureComplianceVault'), requireDriverPermission('canViewDocVault')] },
    async (request) => {
      const query = request.query as { vehicle_id?: string; driver_id?: string; doc_type?: DocumentType };

      let where: Record<string, unknown> = {
        ownerId: request.user.ownerId,
        isActive: true,
        ...(query.doc_type ? { docType: query.doc_type } : {}),
      };

      if (request.user.role === UserRole.DRIVER) {
        const driver = await prisma.user.findUnique({
          where: { id: request.user.sub },
          select: { assignedVehicleId: true },
        });
        where = {
          ...where,
          OR: [
            ...(driver?.assignedVehicleId ? [{ vehicleId: driver.assignedVehicleId }] : []),
            { driverId: request.user.sub },
          ],
        };
      } else {
        if (query.vehicle_id) where.vehicleId = query.vehicle_id;
        if (query.driver_id) where.driverId = query.driver_id;
      }

      const docs = await prisma.vehicleDocument.findMany({
        where,
        include: {
          vehicle: { select: { id: true, vehicleNumber: true } },
          driver: { select: { id: true, name: true } },
        },
        orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }],
      });

      const now = new Date();
      return {
        documents: docs.map((d) => ({
          ...d,
          compliance: computeComplianceStatus(d.expiryDate, now),
        })),
      };
    },
  );

  // Upload document (multipart form-data or JSON with pre-uploaded file_url)
  app.post('/api/documents', { preHandler: [requireOwner, requireFeature('featureComplianceVault')] }, async (request, reply) => {
    if (request.isMultipart()) {
      const fields: Record<string, string> = {};
      let fileBuffer: Buffer | null = null;
      let fileName = 'document.pdf';
      let mimeType = 'application/pdf';

      for await (const part of request.parts()) {
        if (part.type === 'file') {
          fileBuffer = await part.toBuffer();
          fileName = part.filename || fileName;
          mimeType = part.mimetype || mimeType;
        } else {
          fields[part.fieldname] = String(part.value);
        }
      }

      if (!fileBuffer) {
        return reply.status(400).send({
          error: { code: 'FILE_REQUIRED', message: 'Document file is required' },
        });
      }

      const meta = docMetadataSchema.parse(fields);
      const uploaded = await storage.upload(fileBuffer, fileName, mimeType, 'documents');

      const doc = await prisma.vehicleDocument.create({
        data: {
          ownerId: request.user.ownerId,
          vehicleId: meta.vehicle_id ?? null,
          driverId: meta.driver_id ?? null,
          docType: meta.doc_type,
          title: meta.title,
          documentNumber: meta.document_number,
          issueDate: meta.issue_date ? new Date(meta.issue_date) : null,
          expiryDate: meta.expiry_date ? new Date(meta.expiry_date) : null,
          fileUrl: uploaded.url,
          fileMimeType: uploaded.mimeType,
          fileSizeBytes: uploaded.sizeBytes,
        },
      });
      return reply.status(201).send({ document: doc });
    }

    // JSON fallback when file_url is already provided
    const body = docMetadataSchema
      .extend({
        file_url: z.string().min(1).max(512),
        file_mime_type: z.string().default('application/pdf'),
        file_size_bytes: z.coerce.number().int().positive().optional(),
      })
      .parse(request.body);

    const doc = await prisma.vehicleDocument.create({
      data: {
        ownerId: request.user.ownerId,
        vehicleId: body.vehicle_id ?? null,
        driverId: body.driver_id ?? null,
        docType: body.doc_type,
        title: body.title,
        documentNumber: body.document_number,
        issueDate: body.issue_date ? new Date(body.issue_date) : null,
        expiryDate: body.expiry_date ? new Date(body.expiry_date) : null,
        fileUrl: body.file_url,
        fileMimeType: body.file_mime_type,
        fileSizeBytes: body.file_size_bytes,
      },
    });
    return reply.status(201).send({ document: doc });
  });

  // Download document (also used by Driver app for Offline Document Vault caching)
  app.get(
    '/api/documents/:id/download',
    { preHandler: [requireDriverPermission('canViewDocVault')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const doc = await prisma.vehicleDocument.findFirst({
        where: { id, ownerId: request.user.ownerId, isActive: true },
      });
      if (!doc) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
      }

      if (request.user.role === UserRole.DRIVER) {
        const driver = await prisma.user.findUnique({
          where: { id: request.user.sub },
          select: { assignedVehicleId: true },
        });
        const isAllowed =
          doc.driverId === request.user.sub ||
          (driver?.assignedVehicleId && doc.vehicleId === driver.assignedVehicleId);
        if (!isAllowed) {
          return reply.status(403).send({
            error: { code: 'FORBIDDEN', message: 'Document does not belong to your assigned truck' },
          });
        }
      }

      try {
        const buffer = await storage.getBuffer(doc.fileUrl);
        return reply
          .header('Content-Type', doc.fileMimeType)
          .header('Content-Disposition', `inline; filename="${doc.title.replace(/[^a-zA-Z0-9._-]/g, '_')}"`)
          .send(buffer);
      } catch {
        return reply.status(404).send({
          error: { code: 'FILE_NOT_FOUND', message: 'Stored file could not be retrieved' },
        });
      }
    },
  );

  app.delete('/api/documents/:id', { preHandler: [requireOwner] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const doc = await prisma.vehicleDocument.findFirst({
      where: { id, ownerId: request.user.ownerId },
    });
    if (!doc) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }
    await prisma.vehicleDocument.update({ where: { id }, data: { isActive: false } });
    return { deleted: true };
  });

  // Generic photo upload for offline sync queue (odometer / fuel bills / expense bills)
  app.post('/api/uploads/photo', { preHandler: [authenticate] }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: { code: 'FILE_REQUIRED', message: 'Image file is required' } });
    }
    const buffer = await file.toBuffer();
    const uploaded = await storage.upload(buffer, file.filename, file.mimetype, 'photos');
    return reply.status(201).send(uploaded);
  });
}
