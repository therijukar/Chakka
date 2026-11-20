import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';
import { BigActionButton } from '../components/BigActionButton';
import { COLORS, LAYOUT, SHADOWS } from '../theme/tokens';

interface LoginScreenProps {
  onOpenLanguagePicker: () => void;
  onOpenSignup: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onOpenLanguagePicker,
  onOpenSignup,
}) => {
  const { t } = useTranslation();
  const { loginDriver, loginOwner } = useAuth();
  const pinInputRef = useRef<TextInput | null>(null);

  const [mode, setMode] = useState<'DRIVER' | 'OWNER'>('DRIVER');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'DRIVER') {
        await loginDriver(phone.trim(), pin.trim());
      } else {
        await loginOwner(phone.trim(), password);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(t('auth.invalidCredentials'));
      } else {
        setError(err instanceof Error ? err.message : t('app.offlineNotice'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      {/* Curved Navy Highway Header */}
      <View style={styles.hero}>
        <SafeAreaView>
          <View style={styles.heroTop}>
            <View style={styles.brandRow}>
              <View style={styles.logoBadge}>
                <Ionicons name="bus" size={24} color={COLORS.navy} />
              </View>
              <Text style={styles.brand}>{t('app.name')}</Text>
            </View>
            <Pressable onPress={onOpenLanguagePicker} style={styles.langPill}>
              <Ionicons name="language" size={17} color="#FFFFFF" />
              <Text style={styles.langPillText}>{t('app.changeLanguage')}</Text>
            </Pressable>
          </View>

          <View style={styles.roleSwitcher}>
            <Pressable
              onPress={() => {
                setMode('DRIVER');
                setError(null);
              }}
              style={[styles.rolePill, mode === 'DRIVER' && styles.rolePillActive]}
            >
              <Ionicons
                name="speedometer"
                size={20}
                color={mode === 'DRIVER' ? COLORS.navy : '#CBD5E1'}
              />
              <Text style={[styles.roleText, mode === 'DRIVER' && styles.roleTextActive]}>
                {t('auth.driverTab')}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setMode('OWNER');
                setError(null);
              }}
              style={[styles.rolePill, mode === 'OWNER' && styles.rolePillActive]}
            >
              <Ionicons
                name="briefcase"
                size={20}
                color={mode === 'OWNER' ? COLORS.navy : '#CBD5E1'}
              />
              <Text style={[styles.roleText, mode === 'OWNER' && styles.roleTextActive]}>
                {t('auth.ownerTab')}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, SHADOWS.card]}>
            <Text style={styles.label}>{t('auth.phoneLabel')}</Text>
            <View style={styles.inputWrap}>
              <Text style={styles.prefix}>+91</Text>
              <TextInput
                style={styles.inputInner}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={13}
                placeholder={t('auth.phonePlaceholder')}
                placeholderTextColor="#94A3B8"
              />
            </View>

            {mode === 'DRIVER' ? (
              <>
                <Text style={styles.label}>{t('auth.pinLabel')}</Text>
                {/* Interactive 4-Digit Glowing PIN Boxes */}
                <Pressable onPress={() => pinInputRef.current?.focus()} style={styles.pinBoxRow}>
                  {[0, 1, 2, 3].map((idx) => {
                    const filled = idx < pin.length;
                    const focused = idx === pin.length;
                    return (
                      <View
                        key={idx}
                        style={[
                          styles.pinBox,
                          filled && styles.pinBoxFilled,
                          focused && styles.pinBoxActive,
                        ]}
                      >
                        <Text style={styles.pinDot}>{filled ? '●' : ''}</Text>
                      </View>
                    );
                  })}
                </Pressable>
                <TextInput
                  ref={pinInputRef}
                  value={pin}
                  onChangeText={(val) => setPin(val.replace(/\D/g, '').slice(0, 4))}
                  keyboardType="number-pad"
                  maxLength={4}
                  style={styles.hiddenPinInput}
                />
              </>
            ) : (
              <>
                <Text style={styles.label}>{t('auth.passwordLabel')}</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={20} color={COLORS.textSecondary} />
                  <TextInput
                    style={styles.inputInner}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholder={t('auth.passwordPlaceholder')}
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </>
            )}

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={COLORS.red} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <BigActionButton
              label={t('auth.loginButton')}
              icon="arrow-forward-circle"
              color={mode === 'DRIVER' ? COLORS.saffron : COLORS.primary}
              onPress={handleSubmit}
              loading={submitting}
              style={{ marginTop: 10 }}
            />
          </View>

          <Pressable onPress={onOpenSignup} style={[styles.signupBanner, SHADOWS.card]}>
            <View style={styles.signupIconBox}>
              <Ionicons name="person-add" size={20} color={COLORS.navy} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.signupTitle}>New Fleet Owner? Sign Up</Text>
              <Text style={styles.signupSub}>
                Create account & choose your plan (auto-activates free)
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  hero: {
    backgroundColor: COLORS.navy,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 24,
    ...SHADOWS.hero,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 22,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBadge: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: COLORS.plateYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontSize: 19, fontWeight: '900', color: '#FFFFFF' },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
  },
  langPillText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  roleSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 5,
    gap: 6,
  },
  rolePill: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  rolePillActive: {
    backgroundColor: COLORS.plateYellow,
  },
  roleText: { fontSize: 16, fontWeight: '800', color: '#CBD5E1' },
  roleTextActive: { color: COLORS.navy },
  body: { padding: 20, paddingTop: 22 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: LAYOUT.RADIUS,
    padding: 20,
    gap: 12,
  },
  label: { fontSize: 14, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputWrap: {
    minHeight: LAYOUT.MIN_TOUCH_TARGET,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: COLORS.surfaceMuted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  prefix: { fontSize: 17, fontWeight: '800', color: COLORS.navy },
  inputInner: { flex: 1, fontSize: 18, fontWeight: '700', color: COLORS.text },
  pinBoxRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 4 },
  pinBox: {
    flex: 1,
    height: 64,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBoxActive: {
    borderColor: COLORS.saffron,
    backgroundColor: COLORS.saffronBg,
  },
  pinBoxFilled: {
    borderColor: COLORS.navy,
    backgroundColor: '#EFF6FF',
  },
  pinDot: { fontSize: 26, color: COLORS.navy, fontWeight: '900' },
  hiddenPinInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.redBg,
    padding: 12,
    borderRadius: 12,
  },
  errorText: { color: COLORS.red, fontSize: 13, fontWeight: '700', flex: 1 },
  signupBanner: {
    marginTop: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  signupIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.plateYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signupTitle: { fontSize: 15, fontWeight: '900', color: COLORS.navy },
  signupSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2, fontWeight: '600' },
});
