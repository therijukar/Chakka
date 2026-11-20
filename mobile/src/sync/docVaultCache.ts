import * as FileSystem from 'expo-file-system';
import { API_BASE_URL, apiRequest, getApiToken } from '../api/client';
import { upsertCachedDocument } from '../db/database';

const VAULT_DIR = `${FileSystem.documentDirectory ?? ''}doc_vault/`;

interface RemoteDoc {
  id: string;
  docType: string;
  title: string;
  documentNumber?: string | null;
  expiryDate?: string | null;
  fileUrl: string;
  fileMimeType: string;
  updatedAt: string;
}

/**
 * Automatically downloads and caches the driver's assigned truck documents
 * into expo-file-system so they open instantly without internet at RTO/police checks.
 */
export async function syncOfflineDocVault(): Promise<number> {
  const token = getApiToken();
  if (!token) return 0;

  const { documents } = await apiRequest<{ documents: RemoteDoc[] }>('/api/documents');
  await FileSystem.makeDirectoryAsync(VAULT_DIR, { intermediates: true });

  let cachedCount = 0;
  for (const doc of documents) {
    const ext = doc.fileMimeType.includes('pdf') ? 'pdf' : 'jpg';
    const localUri = `${VAULT_DIR}${doc.id}.${ext}`;

    try {
      const downloadUrl = `${API_BASE_URL}/api/documents/${doc.id}/download`;
      const res = await FileSystem.downloadAsync(downloadUrl, localUri, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const finalLocalUri = res.status >= 200 && res.status < 300 ? res.uri : null;

      await upsertCachedDocument({
        id: doc.id,
        doc_type: doc.docType,
        title: doc.title,
        document_number: doc.documentNumber ?? null,
        expiry_date: doc.expiryDate ?? null,
        remote_url: doc.fileUrl,
        local_uri: finalLocalUri,
        mime_type: doc.fileMimeType,
        updated_at: doc.updatedAt,
      });
      cachedCount++;
    } catch {
      // Save metadata even if sample file isn't on disk yet
      await upsertCachedDocument({
        id: doc.id,
        doc_type: doc.docType,
        title: doc.title,
        document_number: doc.documentNumber ?? null,
        expiry_date: doc.expiryDate ?? null,
        remote_url: doc.fileUrl,
        local_uri: null,
        mime_type: doc.fileMimeType,
        updated_at: doc.updatedAt,
      });
    }
  }
  return cachedCount;
}
