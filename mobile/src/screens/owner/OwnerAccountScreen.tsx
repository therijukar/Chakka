import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { BigActionButton } from '../../components/BigActionButton';
import { PlanSelectorCards } from '../../components/PlanSelectorCards';
import { COLORS, SHADOWS } from '../../theme/tokens';
import type { SupportedLanguage } from '../../i18n';
import type { SubscriptionPlanOption } from '../../types/models';

const LANGUAGES: Array<{ code: SupportedLanguage; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'mr', label: 'मराठी' },
  { code: 'ta', label: 'தமிழ்' },
];

type AccountTab = 'PLAN' | 'PROFILE' | 'FASTAG';

export const OwnerAccountScreen: React.FC = () => {
  const { user, language, updateProfile, selectPlan, refreshProfile, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<AccountTab>('PLAN');

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [selectedLang, setSelectedLang] = useState<SupportedLanguage>(language);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [plans, setPlans] = useState<SubscriptionPlanOption[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    user?.subscription?.plan.id ?? null,
  );
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [activatingPlan, setActivatingPlan] = useState(false);

  const [smsText, setSmsText] = useState('');
  const [syncingSms, setSyncingSms] = useState(false);

  useEffect(() => {
    refreshProfile().catch(() => {});
    (async () => {
      try {
        const res = await apiRequest<{ plans: SubscriptionPlanOption[] }>('/api/plans');
        setPlans(res.plans);
        if (!selectedPlanId && res.plans.length > 0) {
          setSelectedPlanId(user?.subscription?.plan.id ?? res.plans[0].id);
        }
      } catch {
        // Offline
      } finally {
        setLoadingPlans(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone(user.phone);
      setEmail(user.email ?? '');
      if (user.subscription?.plan.id && !selectedPlanId) {
        setSelectedPlanId(user.subscription.plan.id);
      }
    }
  }, [user, selectedPlanId]);

  const handleSaveProfile = async () => {
    if (name.trim().length < 2) {
      Alert.alert('Invalid Name', 'Please enter at least 2 characters.');
      return;
    }
    if (newPassword && newPassword.length < 6) {
      Alert.alert('Invalid Password', 'New password must be at least 6 characters.');
      return;
    }
    setSavingProfile(true);
    try {
      await updateProfile({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        language: selectedLang,
        ...(newPassword
          ? { current_password: currentPassword, new_password: newPassword }
          : {}),
      });
      setCurrentPassword('');
      setNewPassword('');
      Alert.alert('Saved', 'Your personal information has been updated.');
    } catch (err) {
      Alert.alert('Update Failed', err instanceof Error ? err.message : 'Unable to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleActivatePlan = async () => {
    if (!selectedPlanId) return;
    setActivatingPlan(true);
    try {
      await selectPlan(selectedPlanId, billingCycle);
      Alert.alert('Plan Activated', 'Your subscription plan is now active!');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to switch plan');
    } finally {
      setActivatingPlan(false);
    }
  };

  const handleParseTollSms = async () => {
    if (smsText.trim().length < 10) {
      Alert.alert('Paste SMS', 'Paste a bank FASTag toll alert SMS to parse and log.');
      return;
    }
    setSyncingSms(true);
    try {
      const res = await apiRequest<{
        toll: { tollPlaza: string; amount: string; vehicleNumberRaw: string };
        matched_active_trip: boolean;
      }>('/api/tolls/sms', {
        method: 'POST',
        body: { sms_text: smsText.trim() },
      });
      setSmsText('');
      Alert.alert(
        'Toll Logged',
        `₹${res.toll.amount} at ${res.toll.tollPlaza} (${res.toll.vehicleNumberRaw}) ${
          res.matched_active_trip ? 'linked to active trip!' : 'saved to vehicle tolls.'
        }`,
      );
    } catch (err) {
      Alert.alert('Parse Failed', err instanceof Error ? err.message : 'Could not parse toll SMS');
    } finally {
      setSyncingSms(false);
    }
  };

  const sub = user?.subscription;
  const expiresLabel = sub?.expires_at
    ? new Date(sub.expires_at).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      {/* Profile & Plan Summary Banner */}
      <View style={[styles.heroCard, SHADOWS.hero]}>
        <View style={styles.heroTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.name ?? 'O').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{user?.name}</Text>
            <Text style={styles.heroPhone}>+91 {user?.phone}</Text>
          </View>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: sub?.is_active ? '#DCFCE7' : '#FEE2E2' },
            ]}
          >
            <Text
              style={[
                styles.statusPillText,
                { color: sub?.is_active ? '#15803D' : COLORS.red },
              ]}
            >
              {sub?.plan.name ?? 'No Plan'} • {sub?.status ?? 'INACTIVE'}
            </Text>
          </View>
        </View>

        {sub ? (
          <View style={styles.usageRow}>
            <View style={styles.usageBox}>
              <Text style={styles.usageVal}>
                {sub.usage.trucks_used} / {sub.usage.max_trucks}
              </Text>
              <Text style={styles.usageLbl}>Trucks</Text>
            </View>
            <View style={styles.usageBox}>
              <Text style={styles.usageVal}>
                {sub.usage.drivers_used} / {sub.usage.max_drivers}
              </Text>
              <Text style={styles.usageLbl}>Drivers</Text>
            </View>
            <View style={styles.usageBox}>
              <Text style={styles.usageVal}>{expiresLabel}</Text>
              <Text style={styles.usageLbl}>Valid Until</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Organized 3-Section Switcher */}
      <View style={styles.tabBar}>
        {(
          [
            { key: 'PLAN', label: 'Plan & Billing', icon: 'sparkles' },
            { key: 'PROFILE', label: 'Personal Info', icon: 'person' },
            { key: 'FASTAG', label: 'FASTag & SMS', icon: 'mail' },
          ] as const
        ).map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
            >
              <Ionicons
                name={tab.icon}
                size={16}
                color={active ? '#FFFFFF' : COLORS.textSecondary}
              />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeTab === 'PLAN' ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose or Upgrade Plan</Text>
          <Text style={styles.sectionSub}>
            Switch anytime — auto-activates immediately with ₹0 due now.
          </Text>

          {loadingPlans ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <>
              <PlanSelectorCards
                plans={plans}
                selectedPlanId={selectedPlanId}
                currentPlanId={sub?.plan.id ?? null}
                billingCycle={billingCycle}
                onChangeBillingCycle={setBillingCycle}
                onSelectPlan={setSelectedPlanId}
              />
              {selectedPlanId ? (
                <BigActionButton
                  label={
                    selectedPlanId === sub?.plan.id
                      ? 'Renew / Re-Activate Current Plan'
                      : 'Activate Selected Plan (Free)'
                  }
                  icon="sparkles"
                  color={COLORS.green}
                  onPress={handleActivatePlan}
                  loading={activatingPlan}
                  style={{ marginTop: 14 }}
                />
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {activeTab === 'PROFILE' ? (
        <View style={[styles.card, SHADOWS.card]}>
          <Text style={styles.sectionTitle}>Personal Information</Text>

          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your full name"
          />

          <Text style={styles.label}>Mobile Number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="10-digit mobile number"
          />

          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="owner@transport.in"
          />

          <Text style={styles.label}>App Language</Text>
          <View style={styles.langGrid}>
            {LANGUAGES.map((l) => {
              const active = selectedLang === l.code;
              return (
                <Pressable
                  key={l.code}
                  onPress={() => setSelectedLang(l.code)}
                  style={[styles.langChip, active && styles.langChipActive]}
                >
                  <Text style={[styles.langChipText, active && styles.langChipTextActive]}>
                    {l.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 18, fontSize: 15 }]}>
            Change Password (Optional)
          </Text>
          <Text style={styles.label}>Current Password</Text>
          <TextInput
            style={styles.input}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            placeholder="Enter current password"
          />

          <Text style={styles.label}>New Password</Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder="Minimum 6 characters"
          />

          <BigActionButton
            label="Save Personal Info"
            icon="save"
            color={COLORS.primary}
            onPress={handleSaveProfile}
            loading={savingProfile}
            style={{ marginTop: 16 }}
          />
        </View>
      ) : null}

      {activeTab === 'FASTAG' ? (
        <View style={{ gap: 14 }}>
          {user?.inboundTollEmail ? (
            <View style={[styles.card, SHADOWS.card]}>
              <Text style={styles.sectionTitle}>FASTag Email Auto-Sync</Text>
              <Text style={styles.sectionSub}>
                Forward your bank FASTag email alerts to this dedicated address to auto-log tolls:
              </Text>
              <View style={styles.emailBadge}>
                <Ionicons name="mail" size={16} color={COLORS.primary} />
                <Text style={styles.emailBadgeText}>{user.inboundTollEmail}</Text>
              </View>
            </View>
          ) : null}

          <View style={[styles.card, SHADOWS.card]}>
            <Text style={styles.sectionTitle}>Log Toll from Bank SMS</Text>
            <Text style={styles.sectionSub}>
              Paste any FASTag toll deduction SMS (e.g. ICICI/HDFC/SBI/Paytm) to auto-extract the truck number, plaza, and ₹ amount and link it to the active trip.
            </Text>
            <TextInput
              style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
              value={smsText}
              onChangeText={setSmsText}
              multiline
              placeholder="e.g. FASTag: Rs. 685.00 debited for MH12AB1234 at Khalapur Toll Plaza..."
            />
            <BigActionButton
              label="Parse & Log Toll SMS"
              icon="flash"
              color={COLORS.saffron}
              onPress={handleParseTollSms}
              loading={syncingSms}
              style={{ marginTop: 12 }}
            />
          </View>
        </View>
      ) : null}

      <Pressable onPress={logout} style={styles.logoutBtn}>
        <Ionicons name="log-out-outline" size={20} color={COLORS.red} />
        <Text style={styles.logoutText}>Sign Out of Account</Text>
      </Pressable>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: 16, paddingBottom: 40 },
  heroCard: {
    backgroundColor: COLORS.navy,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.plateYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '900', color: COLORS.navy },
  heroName: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  heroPhone: { fontSize: 12, color: '#94A3B8', fontWeight: '600', marginTop: 1 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statusPillText: { fontSize: 11, fontWeight: '900' },
  usageRow: { flexDirection: 'row', gap: 10 },
  usageBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 10,
  },
  usageVal: { fontSize: 14, fontWeight: '900', color: '#FFFFFF' },
  usageLbl: { fontSize: 11, color: '#CBD5E1', marginTop: 2, fontWeight: '600' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 4,
    gap: 4,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabBtnActive: { backgroundColor: COLORS.navy },
  tabText: { fontSize: 12, fontWeight: '800', color: COLORS.textSecondary },
  tabTextActive: { color: '#FFFFFF' },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: COLORS.navy },
  sectionSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3, marginBottom: 12 },
  loadingBox: { padding: 24, alignItems: 'center' },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginTop: 12,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    backgroundColor: '#F8FAFC',
  },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: '#F8FAFC',
  },
  langChipActive: { borderColor: COLORS.primary, backgroundColor: '#EFF6FF' },
  langChipText: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  langChipTextActive: { color: COLORS.primary, fontWeight: '900' },
  emailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 12,
    marginTop: 6,
  },
  emailBadgeText: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  logoutBtn: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.redBg,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutText: { fontSize: 15, fontWeight: '800', color: COLORS.red },
});
