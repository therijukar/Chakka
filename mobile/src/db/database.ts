import * as SQLite from 'expo-sqlite';
import type {
  CachedDocument,
  ExpenseCategory,
  LocalExpenseRecord,
  LocalTripRecord,
  SyncQueueItem,
  SyncStatus,
} from '../types/models';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('fleet_india_offline.db');
    await initSchema(dbInstance);
  }
  return dbInstance;
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS local_trips (
      client_id TEXT PRIMARY KEY NOT NULL,
      server_id TEXT,
      vehicle_id TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      start_odometer_km REAL,
      end_odometer_km REAL,
      start_photo_uri TEXT,
      end_photo_uri TEXT,
      start_lat REAL,
      start_lng REAL,
      end_lat REAL,
      end_lng REAL,
      started_at TEXT,
      ended_at TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      sync_status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_expenses (
      client_id TEXT PRIMARY KEY NOT NULL,
      server_id TEXT,
      trip_client_id TEXT,
      trip_server_id TEXT,
      vehicle_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      category_name TEXT NOT NULL,
      is_fuel INTEGER NOT NULL DEFAULT 0,
      amount REAL NOT NULL,
      liters REAL,
      rate_per_liter REAL,
      pump_name TEXT,
      bill_photo_uri TEXT,
      note TEXT,
      sync_status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      local_photo_uri TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cached_documents (
      id TEXT PRIMARY KEY NOT NULL,
      doc_type TEXT NOT NULL,
      title TEXT NOT NULL,
      document_number TEXT,
      expiry_date TEXT,
      remote_url TEXT NOT NULL,
      local_uri TEXT,
      mime_type TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cached_categories (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      is_fuel INTEGER NOT NULL DEFAULT 0
    );
  `);
}

// ---- Local Trips ----
export async function saveLocalTrip(trip: LocalTripRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO local_trips
     (client_id, server_id, vehicle_id, origin, destination, start_odometer_km, end_odometer_km,
      start_photo_uri, end_photo_uri, start_lat, start_lng, end_lat, end_lng,
      started_at, ended_at, status, sync_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trip.client_id,
      trip.server_id,
      trip.vehicle_id,
      trip.origin,
      trip.destination,
      trip.start_odometer_km,
      trip.end_odometer_km,
      trip.start_photo_uri,
      trip.end_photo_uri,
      trip.start_lat,
      trip.start_lng,
      trip.end_lat,
      trip.end_lng,
      trip.started_at,
      trip.ended_at,
      trip.status,
      trip.sync_status,
      trip.created_at,
    ],
  );
}

export async function getActiveLocalTrip(): Promise<LocalTripRecord | null> {
  const db = await getDb();
  return db.getFirstAsync<LocalTripRecord>(
    `SELECT * FROM local_trips WHERE status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`,
  );
}

export async function updateLocalTripSync(
  clientId: string,
  serverId: string | null,
  syncStatus: SyncStatus,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE local_trips SET server_id = COALESCE(?, server_id), sync_status = ? WHERE client_id = ?`,
    [serverId, syncStatus, clientId],
  );
}

// ---- Local Expenses ----
export async function saveLocalExpense(exp: LocalExpenseRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO local_expenses
     (client_id, server_id, trip_client_id, trip_server_id, vehicle_id, category_id, category_name,
      is_fuel, amount, liters, rate_per_liter, pump_name, bill_photo_uri, note, sync_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      exp.client_id,
      exp.server_id,
      exp.trip_client_id,
      exp.trip_server_id,
      exp.vehicle_id,
      exp.category_id,
      exp.category_name,
      exp.is_fuel,
      exp.amount,
      exp.liters,
      exp.rate_per_liter,
      exp.pump_name,
      exp.bill_photo_uri,
      exp.note,
      exp.sync_status,
      exp.created_at,
    ],
  );
}

export async function listLocalExpenses(): Promise<LocalExpenseRecord[]> {
  const db = await getDb();
  return db.getAllAsync<LocalExpenseRecord>(
    `SELECT * FROM local_expenses ORDER BY created_at DESC LIMIT 100`,
  );
}

export async function updateLocalExpenseSync(
  clientId: string,
  serverId: string | null,
  syncStatus: SyncStatus,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE local_expenses SET server_id = COALESCE(?, server_id), sync_status = ? WHERE client_id = ?`,
    [serverId, syncStatus, clientId],
  );
}

// ---- Sync Queue ----
export async function enqueueSyncItem(item: {
  client_id: string;
  entity_type: SyncQueueItem['entity_type'];
  payload: unknown;
  local_photo_uri?: string | null;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_queue (client_id, entity_type, payload_json, local_photo_uri, status, retry_count, created_at)
     VALUES (?, ?, ?, ?, 'PENDING', 0, ?)`,
    [
      item.client_id,
      item.entity_type,
      JSON.stringify(item.payload),
      item.local_photo_uri ?? null,
      new Date().toISOString(),
    ],
  );
}

export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  const db = await getDb();
  return db.getAllAsync<SyncQueueItem>(
    `SELECT * FROM sync_queue WHERE status IN ('PENDING', 'FAILED') ORDER BY id ASC`,
  );
}

export async function getAllSyncItems(): Promise<SyncQueueItem[]> {
  const db = await getDb();
  return db.getAllAsync<SyncQueueItem>(`SELECT * FROM sync_queue ORDER BY id DESC LIMIT 100`);
}

export async function updateSyncQueueItem(
  id: number,
  status: SyncStatus,
  lastError: string | null = null,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sync_queue
     SET status = ?, last_error = ?, retry_count = CASE WHEN ? = 'FAILED' THEN retry_count + 1 ELSE retry_count END
     WHERE id = ?`,
    [status, lastError, status, id],
  );
}

export async function getPendingSyncCounts(): Promise<{ pending: number; failed: number }> {
  const db = await getDb();
  const pendingRow = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM sync_queue WHERE status IN ('PENDING', 'SYNCING')`,
  );
  const failedRow = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM sync_queue WHERE status = 'FAILED'`,
  );
  return { pending: pendingRow?.cnt ?? 0, failed: failedRow?.cnt ?? 0 };
}

// ---- Cached Categories ----
export async function saveCachedCategories(categories: ExpenseCategory[]): Promise<void> {
  const db = await getDb();
  for (const c of categories) {
    await db.runAsync(
      `INSERT OR REPLACE INTO cached_categories (id, name, icon, is_fuel) VALUES (?, ?, ?, ?)`,
      [c.id, c.name, c.icon, c.isFuel ? 1 : 0],
    );
  }
}

export async function getCachedCategories(): Promise<ExpenseCategory[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; name: string; icon: string; is_fuel: number }>(
    `SELECT * FROM cached_categories ORDER BY is_fuel DESC, name ASC`,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, icon: r.icon, isFuel: r.is_fuel === 1 }));
}

// ---- Cached Offline Document Vault ----
export async function upsertCachedDocument(doc: CachedDocument): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO cached_documents
     (id, doc_type, title, document_number, expiry_date, remote_url, local_uri, mime_type, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      doc.id,
      doc.doc_type,
      doc.title,
      doc.document_number,
      doc.expiry_date,
      doc.remote_url,
      doc.local_uri,
      doc.mime_type,
      doc.updated_at,
    ],
  );
}

export async function getCachedDocuments(): Promise<CachedDocument[]> {
  const db = await getDb();
  return db.getAllAsync<CachedDocument>(`SELECT * FROM cached_documents ORDER BY title ASC`);
}
