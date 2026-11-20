import type { SupportedLanguage } from '../i18n';

export type UserRole = 'OWNER' | 'DRIVER';
export type SyncStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
export type ComplianceBadge = 'RED' | 'AMBER' | 'GREEN' | 'NO_EXPIRY';

export interface DriverPermissions {
  canStartEndTrip: boolean;
  canAddFuel: boolean;
  canAddOtherExpenses: boolean;
  canViewOwnBataAndAdvance: boolean;
  canViewTollHistory: boolean;
  canViewDocVault: boolean;
}

export interface Vehicle {
  id: string;
  vehicleNumber: string;
  makeModel?: string | null;
  baselineMileageKmpl: string | number;
  isActive?: boolean;
}

export interface SubscriptionFeatures {
  feature_ocr_vision: boolean;
  feature_fastag_auto_sync: boolean;
  feature_emi_tracker: boolean;
  feature_compliance_vault: boolean;
  feature_driver_permissions: boolean;
  feature_monthly_analytics: boolean;
}

export interface SubscriptionPlanOption {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  price_monthly_inr: number;
  price_yearly_inr: number;
  max_trucks: number;
  max_drivers: number;
  feature_ocr_vision: boolean;
  feature_fastag_auto_sync: boolean;
  feature_emi_tracker: boolean;
  feature_compliance_vault: boolean;
  feature_driver_permissions: boolean;
  feature_monthly_analytics: boolean;
}

export interface OwnerSubscriptionInfo {
  id: string;
  status: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
  is_active: boolean;
  expires_at: string;
  plan: {
    id: string;
    name: string;
    slug: string;
    price_monthly_inr: number;
    max_trucks: number;
    max_drivers: number;
    features: SubscriptionFeatures;
  };
  usage: {
    trucks_used: number;
    max_trucks: number;
    drivers_used: number;
    max_drivers: number;
  };
}

export interface AuthUser {
  id: string;
  role: UserRole;
  name: string;
  phone: string;
  email?: string | null;
  language: SupportedLanguage;
  ownerId: string;
  inboundTollEmail?: string | null;
  assignedVehicle?: Vehicle | null;
  permissions?: DriverPermissions | null;
  subscription?: OwnerSubscriptionInfo | null;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  icon: string;
  isFuel: boolean;
  isArchived?: boolean;
}

export interface LocalTripRecord {
  client_id: string;
  server_id: string | null;
  vehicle_id: string;
  origin: string;
  destination: string;
  start_odometer_km: number | null;
  end_odometer_km: number | null;
  start_photo_uri: string | null;
  end_photo_uri: string | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  started_at: string | null;
  ended_at: string | null;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CLOSED';
  sync_status: SyncStatus;
  created_at: string;
}

export interface LocalExpenseRecord {
  client_id: string;
  server_id: string | null;
  trip_client_id: string | null;
  trip_server_id: string | null;
  vehicle_id: string;
  category_id: string;
  category_name: string;
  is_fuel: number; // 0 or 1 in SQLite
  amount: number;
  liters: number | null;
  rate_per_liter: number | null;
  pump_name: string | null;
  bill_photo_uri: string | null;
  note: string | null;
  sync_status: SyncStatus;
  created_at: string;
}

export interface SyncQueueItem {
  id: number;
  client_id: string;
  entity_type: 'TRIP_CREATE' | 'TRIP_END' | 'EXPENSE_CREATE';
  payload_json: string;
  local_photo_uri: string | null;
  status: SyncStatus;
  retry_count: number;
  last_error: string | null;
  created_at: string;
}

export interface CachedDocument {
  id: string;
  doc_type: string;
  title: string;
  document_number: string | null;
  expiry_date: string | null;
  remote_url: string;
  local_uri: string | null;
  mime_type: string;
  updated_at: string;
}
