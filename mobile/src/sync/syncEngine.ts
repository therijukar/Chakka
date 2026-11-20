import NetInfo from '@react-native-community/netinfo';
import { apiRequest, getApiToken, uploadPhotoFile } from '../api/client';
import {
  getDb,
  getPendingSyncCounts,
  getPendingSyncItems,
  updateLocalExpenseSync,
  updateLocalTripSync,
  updateSyncQueueItem,
} from '../db/database';
import { syncOfflineDocVault } from './docVaultCache';

export interface SyncStateSnapshot {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
}

type Listener = (snapshot: SyncStateSnapshot) => void;

class SyncEngine {
  private listeners = new Set<Listener>();
  private state: SyncStateSnapshot = {
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
  };
  private unsubscribeNetInfo: (() => void) | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(partial: Partial<SyncStateSnapshot>) {
    this.state = { ...this.state, ...partial };
    for (const l of this.listeners) {
      l(this.state);
    }
  }

  async refreshCounts(): Promise<void> {
    const counts = await getPendingSyncCounts();
    this.emit({ pendingCount: counts.pending, failedCount: counts.failed });
  }

  start(): void {
    if (this.unsubscribeNetInfo) return;
    this.refreshCounts().catch(() => {});

    this.unsubscribeNetInfo = NetInfo.addEventListener((netState) => {
      const online = Boolean(netState.isConnected && netState.isInternetReachable !== false);
      const wasOffline = !this.state.isOnline;
      this.emit({ isOnline: online });

      if (online && (wasOffline || this.state.pendingCount > 0)) {
        this.runSync().catch(() => {});
      }
    });
  }

  stop(): void {
    this.unsubscribeNetInfo?.();
    this.unsubscribeNetInfo = null;
  }

  /**
   * Pushes lightweight JSON payloads first (idempotent via client_id),
   * then uploads compressed photos, and refreshes offline Document Vault.
   */
  async runSync(): Promise<void> {
    if (this.state.isSyncing || !getApiToken()) return;

    const net = await NetInfo.fetch();
    const online = Boolean(net.isConnected && net.isInternetReachable !== false);
    this.emit({ isOnline: online });
    if (!online) return;

    this.emit({ isSyncing: true });
    try {
      const items = await getPendingSyncItems();

      for (const item of items) {
        await updateSyncQueueItem(item.id, 'SYNCING');
        try {
          const payload = JSON.parse(item.payload_json) as Record<string, unknown>;

          if (item.entity_type === 'TRIP_CREATE') {
            // 1. Push JSON first (idempotent on client_id)
            const res = await apiRequest<{ trip: { id: string } }>('/api/trips', {
              method: 'POST',
              body: payload,
            });
            // 2. Upload compressed photo if present
            if (item.local_photo_uri) {
              const uploaded = await uploadPhotoFile(item.local_photo_uri);
              await apiRequest(`/api/trips/${res.trip.id}/start`, {
                method: 'POST',
                body: {
                  start_odometer_km: payload.start_odometer_km ?? 0,
                  start_odometer_photo_url: uploaded.url,
                },
              });
            }
            await updateLocalTripSync(item.client_id, res.trip.id, 'SYNCED');
            await updateSyncQueueItem(item.id, 'SYNCED');
          } else if (item.entity_type === 'TRIP_END') {
            const db = await getDb();
            const tripRow = await db.getFirstAsync<{ server_id: string | null }>(
              `SELECT server_id FROM local_trips WHERE client_id = ?`,
              [item.client_id],
            );
            const serverId = (payload.server_id as string | undefined) ?? tripRow?.server_id;
            if (!serverId) throw new Error('Trip not yet synced to server');

            let photoUrl: string | undefined;
            if (item.local_photo_uri) {
              const uploaded = await uploadPhotoFile(item.local_photo_uri);
              photoUrl = uploaded.url;
            }
            await apiRequest(`/api/trips/${serverId}/end`, {
              method: 'POST',
              body: {
                ...payload,
                ...(photoUrl ? { end_odometer_photo_url: photoUrl } : {}),
              },
            });
            await updateLocalTripSync(item.client_id, serverId, 'SYNCED');
            await updateSyncQueueItem(item.id, 'SYNCED');
          } else if (item.entity_type === 'EXPENSE_CREATE') {
            let photoUrl: string | undefined;
            if (item.local_photo_uri) {
              const uploaded = await uploadPhotoFile(item.local_photo_uri);
              photoUrl = uploaded.url;
            }
            const res = await apiRequest<{ expense: { id: string } }>('/api/expenses', {
              method: 'POST',
              body: {
                ...payload,
                ...(photoUrl ? { bill_photo_url: photoUrl } : {}),
              },
            });
            await updateLocalExpenseSync(item.client_id, res.expense.id, 'SYNCED');
            await updateSyncQueueItem(item.id, 'SYNCED');
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Sync failed';
          await updateSyncQueueItem(item.id, 'FAILED', message);
          if (item.entity_type === 'EXPENSE_CREATE') {
            await updateLocalExpenseSync(item.client_id, null, 'FAILED');
          } else {
            await updateLocalTripSync(item.client_id, null, 'FAILED');
          }
        }
      }

      // Refresh Offline Document Vault in background when online
      await syncOfflineDocVault().catch(() => {});
    } finally {
      await this.refreshCounts();
      this.emit({ isSyncing: false });
    }
  }
}

export const syncEngine = new SyncEngine();
