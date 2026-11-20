import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import i18n, { type SupportedLanguage } from '../i18n';
import { apiRequest, setApiToken } from '../api/client';
import { getDb, saveCachedCategories } from '../db/database';
import { syncEngine } from '../sync/syncEngine';
import { syncOfflineDocVault } from '../sync/docVaultCache';
import type { AuthUser, ExpenseCategory } from '../types/models';

const KEY_TOKEN = 'fleet_auth_token';
const KEY_USER = 'fleet_auth_user';
const KEY_LANG = 'fleet_app_language';

interface RegisterOwnerInput {
  name: string;
  phone: string;
  email?: string;
  password: string;
  plan_id?: string;
  billing_cycle?: 'monthly' | 'yearly';
}

interface UpdateProfileInput {
  name?: string;
  phone?: string;
  email?: string | null;
  language?: SupportedLanguage;
  current_password?: string;
  new_password?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  languageSelected: boolean;
  language: SupportedLanguage;
  loading: boolean;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  loginDriver: (phone: string, pin: string) => Promise<void>;
  loginOwner: (phone: string, password: string) => Promise<void>;
  registerOwner: (input: RegisterOwnerInput) => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
  selectPlan: (planId: string, billingCycle?: 'monthly' | 'yearly') => Promise<void>;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [language, setLangState] = useState<SupportedLanguage>('en');
  const [languageSelected, setLanguageSelected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        await getDb();
        const savedLang = (await SecureStore.getItemAsync(KEY_LANG)) as SupportedLanguage | null;
        if (savedLang) {
          await i18n.changeLanguage(savedLang);
          setLangState(savedLang);
          setLanguageSelected(true);
        }

        const savedToken = await SecureStore.getItemAsync(KEY_TOKEN);
        const savedUserRaw = await SecureStore.getItemAsync(KEY_USER);
        if (savedToken && savedUserRaw) {
          setApiToken(savedToken);
          setUser(JSON.parse(savedUserRaw) as AuthUser);
          syncEngine.start();
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      syncEngine.stop();
    };
  }, []);

  const bootstrapOfflineCaches = async (loggedInUser: AuthUser) => {
    try {
      const { categories } = await apiRequest<{ categories: ExpenseCategory[] }>('/api/expense-categories');
      await saveCachedCategories(categories);
    } catch {
      // Offline — keep existing local cache
    }
    if (loggedInUser.role === 'DRIVER' && loggedInUser.permissions?.canViewDocVault) {
      syncOfflineDocVault().catch(() => {});
    }
    syncEngine.start();
  };

  const setLanguage = async (lang: SupportedLanguage) => {
    await i18n.changeLanguage(lang);
    setLangState(lang);
    setLanguageSelected(true);
    await SecureStore.setItemAsync(KEY_LANG, lang);

    if (user) {
      apiRequest('/api/auth/language', { method: 'PATCH', body: { language: lang } }).catch(() => {});
    }
  };

  const persistSession = async (token: string, nextUser: AuthUser) => {
    setApiToken(token);
    setUser(nextUser);
    await SecureStore.setItemAsync(KEY_TOKEN, token);
    await SecureStore.setItemAsync(KEY_USER, JSON.stringify(nextUser));
    await bootstrapOfflineCaches(nextUser);
  };

  const loginDriver = async (phone: string, pin: string) => {
    const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/driver/login', {
      method: 'POST',
      body: { phone, pin },
    });
    await persistSession(res.token, res.user);
  };

  const loginOwner = async (phone: string, password: string) => {
    const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/owner/login', {
      method: 'POST',
      body: { phone, password },
    });
    await persistSession(res.token, res.user);
  };

  const registerOwner = async (input: RegisterOwnerInput) => {
    const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/owner/register', {
      method: 'POST',
      body: {
        ...input,
        language,
      },
    });
    await persistSession(res.token, res.user);
  };

  const updateProfile = async (input: UpdateProfileInput) => {
    const res = await apiRequest<{ user: AuthUser }>('/api/auth/profile', {
      method: 'PATCH',
      body: input,
    });
    setUser(res.user);
    await SecureStore.setItemAsync(KEY_USER, JSON.stringify(res.user));
    if (input.language && input.language !== language) {
      await i18n.changeLanguage(input.language);
      setLangState(input.language);
      await SecureStore.setItemAsync(KEY_LANG, input.language);
    }
  };

  const selectPlan = async (planId: string, billingCycle: 'monthly' | 'yearly' = 'monthly') => {
    await apiRequest('/api/subscription/select-plan', {
      method: 'POST',
      body: { plan_id: planId, billing_cycle: billingCycle },
    });
    await refreshProfile();
  };

  const refreshProfile = async () => {
    const fresh = await apiRequest<AuthUser>('/api/auth/me');
    setUser(fresh);
    await SecureStore.setItemAsync(KEY_USER, JSON.stringify(fresh));
  };

  const logout = async () => {
    syncEngine.stop();
    setApiToken(null);
    setUser(null);
    await SecureStore.deleteItemAsync(KEY_TOKEN);
    await SecureStore.deleteItemAsync(KEY_USER);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        languageSelected,
        language,
        loading,
        setLanguage,
        loginDriver,
        loginOwner,
        registerOwner,
        updateProfile,
        selectPlan,
        refreshProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
