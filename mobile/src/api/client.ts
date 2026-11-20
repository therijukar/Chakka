import { Platform } from 'react-native';

const DEFAULT_HOST = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || DEFAULT_HOST;

let authToken: string | null = null;

export function setApiToken(token: string | null) {
  authToken = token;
}

export function getApiToken(): string | null {
  return authToken;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errObj = (data as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(
      response.status,
      errObj?.code ?? 'API_ERROR',
      errObj?.message ?? `Request failed with status ${response.status}`,
    );
  }
  return data as T;
}

export async function uploadPhotoFile(localUri: string, fieldName = 'file'): Promise<{ url: string }> {
  const formData = new FormData();
  const filename = localUri.split('/').pop() || `photo-${Date.now()}.jpg`;
  formData.append(fieldName, {
    uri: localUri,
    name: filename,
    type: 'image/jpeg',
  } as unknown as Blob);

  const response = await fetch(`${API_BASE_URL}/api/uploads/photo`, {
    method: 'POST',
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, 'UPLOAD_FAILED', 'Failed to upload compressed photo');
  }
  return data as { url: string };
}
