import React, { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../api/client';
import { formatINR } from '../../utils/formatters';
import { BigActionButton } from '../../components/BigActionButton';
import { IndianNumberPlate } from '../../components/IndianNumberPlate';
import { COLORS, LAYOUT, SHADOWS } from '../../theme/tokens';
import type { Vehicle } from '../../types/models';

interface EmiItem {
  id: string;
  financer_name: string;
  total_loan_amount: number;
  monthly_emi_amount: number;
  total_tenure_months: number;
  emis_paid: number;
  emis_remaining: number;
  due_day_of_month: number;
  next_due_date: string;
  is_due_soon: boolean;
  remaining_principal: number;
  vehicle?: { vehicleNumber: string; makeModel?: string | null };
}

export const OwnerEmisScreen: React.FC = () => {
  const { t } = useTranslation();
  const [emis, setEmis] = useState<EmiItem[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [monthlyOutflow, setMonthlyOutflow] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  // Add EMI Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState('');
  const [financer, setFinancer] = useState('');
  const [totalLoan, setTotalLoan] = useState('');
  const [monthlyEmi, setMonthlyEmi] = useState('');
  const [tenure, setTenure] = useState('48');
  const [emisPaid, setEmisPaid] = useState('0');
  const [dueDay, setDueDay] = useState('5');
  const [remainingPrincipal, setRemainingPrincipal] = useState('');
  const [saving, setSaving] = useState(false);

  const loadEmis = useCallback(async () => {
    try {
      const [emiRes, vehRes] = await Promise.all([
        apiRequest<{
          emis: EmiItem[];
          summary: { total_monthly_emi_outflow: number };
        }>('/api/emis'),
        apiRequest<{ vehicles: Vehicle[] }>('/api/vehicles'),
      ]);
      setEmis(emiRes.emis);
      setMonthlyOutflow(emiRes.summary.total_monthly_emi_outflow);
      setVehicles(vehRes.vehicles);
      if (!vehicleId && vehRes.vehicles[0]) setVehicleId(vehRes.vehicles[0].id);
    } catch {
      // Offline or locked
    }
  }, [vehicleId]);

  useFocusEffect(
    useCallback(() => {
      loadEmis();
    }, [loadEmis]),
  );

  const handleMarkPaid = async (emi: EmiItem) => {
    setPayingId(emi.id);
    try {
      await apiRequest(`/api/emis/${emi.id}/mark-paid`, {
        method: 'POST',
        body: { amount_paid: emi.monthly_emi_amount },
      });
      await loadEmis();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to log EMI payment');
    } finally {
      setPayingId(null);
    }
  };

  const handleAddEmi = async () => {
    const targetVeh = vehicleId || vehicles[0]?.id;
    if (!targetVeh || !financer.trim() || !Number(totalLoan) || !Number(monthlyEmi)) {
      return Alert.alert('Missing fields', 'Select a truck and enter financer, loan amount, and monthly EMI.');
    }
    setSaving(true);
    try {
      await apiRequest('/api/emis', {
        method: 'POST',
        body: {
          vehicle_id: targetVeh,
          financer_name: financer.trim(),
          total_loan_amount: Number(totalLoan),
          monthly_emi_amount: Number(monthlyEmi),
          total_tenure_months: Number(tenure) || 48,
          emis_paid: Number(emisPaid) || 0,
          due_day_of_month: Math.min(31, Math.max(1, Number(dueDay) || 5)),
          remaining_principal: Number(remainingPrincipal) || Number(totalLoan),
        },
      });
      setModalOpen(false);
      setFinancer('');
      setTotalLoan('');
      setMonthlyEmi('');
      setRemainingPrincipal('');
      await loadEmis();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create EMI');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await loadEmis();
            setRefreshing(false);
          }}
        />
      }
    >
      <View style={[styles.summaryCard, SHADOWS.hero]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryLabel}>{t('owner.emiTracker')}</Text>
          <Text style={styles.summaryAmount}>{formatINR(monthlyOutflow)} / mo</Text>
        </View>
        <View style={styles.bankIcon}>
          <Ionicons name="card" size={28} color={COLORS.plateYellow} />
        </View>
      </View>

      <BigActionButton
        label="+ Add Truck Loan / EMI"
        icon="add-circle"
        color={COLORS.primary}
        onPress={() => setModalOpen(true)}
      />

      {emis.map((emi) => {
        const progressPct = Math.min(
          100,
          Math.round((emi.emis_paid / Math.max(1, emi.total_tenure_months)) * 100),
        );
        return (
          <View key={emi.id} style={[styles.card, SHADOWS.card]}>
            <View style={styles.row}>
              <IndianNumberPlate vehicleNumber={emi.vehicle?.vehicleNumber ?? 'TRUCK'} compact />
              <Text
                style={[
                  styles.remainingPill,
                  emi.is_due_soon && { backgroundColor: COLORS.redBg, color: COLORS.red },
                ]}
              >
                {t('owner.emisRemaining', { count: emi.emis_remaining })}
              </Text>
            </View>

            <Text style={styles.financer}>{emi.financer_name}</Text>
            <Text style={styles.emiAmount}>{formatINR(emi.monthly_emi_amount)} / mo</Text>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>
                {emi.emis_paid} / {emi.total_tenure_months} ({progressPct}%)
              </Text>
              <Text style={styles.meta}>{t('owner.dueDay', { day: emi.due_day_of_month })}</Text>
            </View>

            <Text style={styles.balanceText}>
              {t('owner.balance')}: {formatINR(emi.remaining_principal)}
            </Text>

            <BigActionButton
              label={t('owner.markEmiPaid')}
              icon="checkmark-done-circle"
              color={COLORS.green}
              onPress={() => handleMarkPaid(emi)}
              loading={payingId === emi.id}
            />
          </View>
        );
      })}

      {/* ADD EMI MODAL */}
      <Modal visible={modalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Truck Loan / EMI</Text>
            <Text style={styles.pickerLabel}>Select Truck:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {vehicles.map((v) => (
                <Pressable
                  key={v.id}
                  onPress={() => setVehicleId(v.id)}
                  style={[styles.selectChip, vehicleId === v.id && styles.selectChipActive]}
                >
                  <Text style={[styles.selectChipText, vehicleId === v.id && styles.selectChipTextActive]}>
                    {v.vehicleNumber}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <TextInput style={styles.input} placeholder="Bank / Financer (e.g. HDFC Bank)" value={financer} onChangeText={setFinancer} />
            <View style={styles.twoCol}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Total Loan (₹)" keyboardType="numeric" value={totalLoan} onChangeText={setTotalLoan} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Monthly EMI (₹)" keyboardType="numeric" value={monthlyEmi} onChangeText={setMonthlyEmi} />
            </View>
            <View style={styles.twoCol}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Tenure (Months)" keyboardType="numeric" value={tenure} onChangeText={setTenure} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="EMIs Paid" keyboardType="numeric" value={emisPaid} onChangeText={setEmisPaid} />
            </View>
            <View style={styles.twoCol}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Due Day (1-31)" keyboardType="numeric" value={dueDay} onChangeText={setDueDay} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Remaining Bal (₹)" keyboardType="numeric" value={remainingPrincipal} onChangeText={setRemainingPrincipal} />
            </View>

            <View style={styles.modalActions}>
              <BigActionButton label={t('app.cancel')} color="#E2E8F0" textColor={COLORS.text} onPress={() => setModalOpen(false)} style={{ flex: 1 }} />
              <BigActionButton label={t('app.save')} color={COLORS.green} onPress={handleAddEmi} loading={saving} style={{ flex: 1 }} />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: LAYOUT.PADDING, gap: 16, paddingBottom: 32 },
  summaryCard: {
    backgroundColor: COLORS.navy,
    borderRadius: 22,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryLabel: { fontSize: 13, color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase' },
  summaryAmount: { fontSize: 28, color: '#FFFFFF', fontWeight: '900', marginTop: 2 },
  bankIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { backgroundColor: COLORS.surface, borderRadius: LAYOUT.RADIUS, padding: 16, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  remainingPill: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.amber,
    backgroundColor: COLORS.amberBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  financer: { fontSize: 15, fontWeight: '700', color: COLORS.textSecondary },
  emiAmount: { fontSize: 24, fontWeight: '900', color: COLORS.text },
  progressTrack: { height: 10, backgroundColor: COLORS.border, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.green, borderRadius: 999 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  meta: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  balanceText: { fontSize: 14, fontWeight: '800', color: COLORS.navy },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalScroll: { maxHeight: '85%' },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 10 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  pickerLabel: { fontSize: 13, fontWeight: '800', color: COLORS.textSecondary },
  chipRow: { gap: 8, paddingVertical: 2 },
  selectChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  selectChipActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  selectChipText: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  selectChipTextActive: { color: COLORS.plateYellow },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.surfaceMuted,
  },
  twoCol: { flexDirection: 'row', gap: 10 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
