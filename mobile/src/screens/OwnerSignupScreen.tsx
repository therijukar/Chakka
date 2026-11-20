import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { BigActionButton } from '../components/BigActionButton';
import { PlanSelectorCards } from '../components/PlanSelectorCards';
import { COLORS, SHADOWS } from '../theme/tokens';
import type { SubscriptionPlanOption } from '../types/models';

interface OwnerSignupScreenProps {
  onBackToLogin: () => void;
}

export const OwnerSignupScreen: React.FC<OwnerSignupScreenProps> = ({ onBackToLogin }) => {
  const { registerOwner } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [plans, setPlans] = useState<SubscriptionPlanOption[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest<{ plans: SubscriptionPlanOption[] }>('/api/plans');
        setPlans(res.plans);
        const preferred =
          res.plans.find((p) => p.slug === 'growth') ?? res.plans[0] ?? null;
        if (preferred) setSelectedPlanId(preferred.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load plans');
      } finally {
        setLoadingPlans(false);
      }
    })();
  }, []);

  const handleSignup = async () => {
    setError(null);
    if (name.trim().length < 2) {
      setError('Please enter your full name');
      return;
    }
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (!selectedPlanId && plans.length > 0) {
      setError('Please select a subscription plan');
      return;
    }

    setSubmitting(true);
    try {
      await registerOwner({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        password,
        plan_id: selectedPlanId ?? undefined,
        billing_cycle: billingCycle,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <SafeAreaView>
          <View style={styles.heroRow}>
            <Pressable onPress={onBackToLogin} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
              <Text style={styles.backText}>Login</Text>
            </Pressable>
            <View style={styles.badge}>
              <Ionicons name="sparkles" size={14} color={COLORS.navy} />
              <Text style={styles.badgeText}>Instant Activation</Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>Create Fleet Owner Account</Text>
          <Text style={styles.heroSub}>
            Sign up & pick any plan — auto-activates immediately with ₹0 due now.
          </Text>
        </SafeAreaView>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, SHADOWS.card]}>
            <Text style={styles.sectionTitle}>1. Personal Information</Text>

            <Text style={styles.label}>Full Name *</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={18} color={COLORS.textSecondary} />
              <TextInput
                style={styles.inputInner}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Vikram Singh"
                placeholderTextColor="#94A3B8"
              />
            </View>

            <Text style={styles.label}>Mobile Number *</Text>
            <View style={styles.inputWrap}>
              <Text style={styles.prefix}>+91</Text>
              <TextInput
                style={styles.inputInner}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={13}
                placeholder="10-digit mobile number"
                placeholderTextColor="#94A3B8"
              />
            </View>

            <Text style={styles.label}>Email (Optional)</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={18} color={COLORS.textSecondary} />
              <TextInput
                style={styles.inputInner}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="owner@transport.in"
                placeholderTextColor="#94A3B8"
              />
            </View>

            <Text style={styles.label}>Password *</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={COLORS.textSecondary} />
              <TextInput
                style={styles.inputInner}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Minimum 6 characters"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          <View style={{ marginTop: 18 }}>
            <Text style={styles.sectionTitleOutside}>
              2. Choose Subscription Plan (No Payment Needed)
            </Text>
            {loadingPlans ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading plans...</Text>
              </View>
            ) : (
              <PlanSelectorCards
                plans={plans}
                selectedPlanId={selectedPlanId}
                billingCycle={billingCycle}
                onChangeBillingCycle={setBillingCycle}
                onSelectPlan={setSelectedPlanId}
              />
            )}
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={COLORS.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <BigActionButton
            label="Create Account & Activate Plan"
            icon="checkmark-circle"
            color={COLORS.green}
            onPress={handleSignup}
            loading={submitting}
            style={{ marginTop: 18 }}
          />

          <Pressable onPress={onBackToLogin} style={styles.loginLink}>
            <Text style={styles.loginLinkText}>
              Already have an account? <Text style={styles.loginLinkBold}>Sign In</Text>
            </Text>
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
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    ...SHADOWS.hero,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 14,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  backText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.plateYellow,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: { color: COLORS.navy, fontWeight: '900', fontSize: 11 },
  heroTitle: { fontSize: 22, fontWeight: '900', color: '#FFFFFF' },
  heroSub: { fontSize: 13, color: '#CBD5E1', marginTop: 4 },
  body: { padding: 18, paddingBottom: 40 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: COLORS.navy, marginBottom: 4 },
  sectionTitleOutside: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.navy,
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 12,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 50,
    backgroundColor: '#F8FAFC',
    gap: 8,
  },
  prefix: { fontSize: 15, fontWeight: '800', color: COLORS.navy },
  inputInner: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
  loadingBox: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
  },
  loadingText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    backgroundColor: COLORS.redBg,
    padding: 12,
    borderRadius: 12,
  },
  errorText: { color: COLORS.red, fontWeight: '700', flex: 1, fontSize: 13 },
  loginLink: { marginTop: 18, alignItems: 'center', paddingVertical: 8 },
  loginLinkText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },
  loginLinkBold: { color: COLORS.primary, fontWeight: '900' },
});
