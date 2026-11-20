import React, { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../api/client';
import { formatINR } from '../../utils/formatters';
import { BigActionButton } from '../../components/BigActionButton';
import { COLORS, LAYOUT } from '../../theme/tokens';
import type { OwnerTripsStackParamList } from '../../navigation/OwnerNavigator';

interface TripPaymentItem {
  id: string;
  amount: string | number;
  paymentMode: string;
  note?: string | null;
  receivedAt: string;
}

interface PnlResponse {
  trip: {
    id: string;
    origin: string;
    destination: string;
    status: string;
    partyName?: string | null;
    vehicle: { vehicleNumber: string };
    driver: { name: string };
    payments?: TripPaymentItem[];
  };
  pnl: {
    agreed_freight: number;
    advance_received: number;
    balance_pending: number;
    driver_advance: number;
    driver_bata: number;
    fuel_total: number;
    tolls_total: number;
    approved_other_expenses: number;
    total_cost: number;
    net_profit: number;
    distance_km: number | null;
    total_fuel_liters: number;
    true_mileage_kmpl: number | null;
    baseline_mileage_kmpl: number;
    mileage_drop_percent: number | null;
    mileage_red_flag: boolean;
  };
}

interface Props {
  route: RouteProp<OwnerTripsStackParamList, 'TripDetail'>;
}

export const TripDetailScreen: React.FC<Props> = ({ route }) => {
  const { t } = useTranslation();
  const [data, setData] = useState<PnlResponse | null>(null);
  const [closing, setClosing] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<'CASH' | 'UPI' | 'BANK' | 'CHEQUE'>('UPI');
  const [payNote, setPayNote] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  const loadPnl = useCallback(async () => {
    try {
      const res = await apiRequest<PnlResponse>(`/api/trips/${route.params.tripId}/pnl`);
      setData(res);
    } catch {
      // Offline
    }
  }, [route.params.tripId]);

  useFocusEffect(
    useCallback(() => {
      loadPnl();
    }, [loadPnl]),
  );

  const handleCloseTrip = async () => {
    setClosing(true);
    try {
      await apiRequest(`/api/trips/${route.params.tripId}/close`, { method: 'POST', body: {} });
      await loadPnl();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to close trip');
    } finally {
      setClosing(false);
    }
  };

  const handleAddPayment = async () => {
    const amt = Number(payAmount);
    if (!amt || amt <= 0) {
      Alert.alert('Invalid Amount', 'Enter a valid payment amount received.');
      return;
    }
    setSavingPayment(true);
    try {
      await apiRequest(`/api/trips/${route.params.tripId}/payments`, {
        method: 'POST',
        body: {
          amount: amt,
          payment_mode: payMode,
          note: payNote.trim() || undefined,
        },
      });
      setPayModalOpen(false);
      setPayAmount('');
      setPayNote('');
      await loadPnl();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to add payment');
    } finally {
      setSavingPayment(false);
    }
  };

  if (!data) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.loading}>{t('app.loading')}</Text>
      </SafeAreaView>
    );
  }

  const { trip, pnl } = data;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.route}>
            {trip.origin} → {trip.destination}
          </Text>
          <Text style={styles.meta}>
            {trip.vehicle.vehicleNumber} • {trip.driver.name} • {trip.status}
          </Text>
        </View>

        {/* Mileage Red Flag Alert */}
        {pnl.mileage_red_flag ? (
          <View style={styles.redFlagBox}>
            <Ionicons name="warning" size={24} color={COLORS.red} />
            <View style={{ flex: 1 }}>
              <Text style={styles.redFlagTitle}>{t('owner.mileageAlert')}</Text>
              <Text style={styles.redFlagSub}>
                {t('owner.trueMileage')}: {pnl.true_mileage_kmpl} km/L vs {t('owner.baselineMileage')}:{' '}
                {pnl.baseline_mileage_kmpl} km/L (-{pnl.mileage_drop_percent}%)
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.rowLabel}>{t('owner.trueMileage')}</Text>
            <Text style={styles.mileageVal}>
              {pnl.true_mileage_kmpl !== null ? `${pnl.true_mileage_kmpl} km/L` : '—'} ({t('owner.baselineMileage')}:{' '}
              {pnl.baseline_mileage_kmpl} km/L)
            </Text>
          </View>
        )}

        {/* P&L Breakdown */}
        <View style={styles.card}>
          <View style={styles.pnlRow}>
            <Text style={styles.rowLabel}>{t('owner.agreedFreight')}</Text>
            <Text style={styles.rowVal}>{formatINR(pnl.agreed_freight)}</Text>
          </View>
          <View style={styles.pnlRow}>
            <Text style={styles.rowLabel}>{t('owner.fuel')}</Text>
            <Text style={styles.negVal}>-{formatINR(pnl.fuel_total)}</Text>
          </View>
          <View style={styles.pnlRow}>
            <Text style={styles.rowLabel}>{t('owner.tolls')}</Text>
            <Text style={styles.negVal}>-{formatINR(pnl.tolls_total)}</Text>
          </View>
          <View style={styles.pnlRow}>
            <Text style={styles.rowLabel}>{t('owner.otherExpenses')}</Text>
            <Text style={styles.negVal}>-{formatINR(pnl.approved_other_expenses)}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.pnlRow}>
            <Text style={styles.netLabel}>{t('owner.tripNetProfit')}</Text>
            <Text
              style={[
                styles.netVal,
                { color: pnl.net_profit >= 0 ? COLORS.green : COLORS.red },
              ]}
            >
              {formatINR(pnl.net_profit)}
            </Text>
          </View>
        </View>

        {/* Freight Collection & Pending Due */}
        <View style={styles.card}>
          <View style={styles.payHead}>
            <Text style={styles.sectionTitle}>Freight Payment Tracker</Text>
            <Pressable onPress={() => setPayModalOpen(true)} style={styles.addPayBtn}>
              <Ionicons name="add-circle" size={16} color="#FFFFFF" />
              <Text style={styles.addPayText}>Add Payment</Text>
            </Pressable>
          </View>
          <View style={styles.pnlRow}>
            <Text style={styles.rowLabel}>{t('owner.agreedFreight')}</Text>
            <Text style={styles.rowVal}>{formatINR(pnl.agreed_freight)}</Text>
          </View>
          <View style={styles.pnlRow}>
            <Text style={styles.rowLabel}>Received So Far</Text>
            <Text style={[styles.rowVal, { color: COLORS.green }]}>
              {formatINR(pnl.advance_received ?? 0)}
            </Text>
          </View>
          <View style={styles.pnlRow}>
            <Text style={styles.rowLabel}>Pending / Due Freight</Text>
            <Text style={[styles.rowVal, { color: (pnl.balance_pending ?? 0) > 0 ? COLORS.saffron : COLORS.green }]}>
              {formatINR(pnl.balance_pending ?? 0)}
            </Text>
          </View>
          <View style={styles.pnlRow}>
            <Text style={styles.rowLabel}>Driver Advance (Expenses)</Text>
            <Text style={styles.rowVal}>{formatINR(pnl.driver_advance ?? 0)}</Text>
          </View>

          {trip.payments && trip.payments.length > 0 ? (
            <View style={styles.payHistory}>
              <Text style={styles.payHistoryTitle}>Payment History</Text>
              {trip.payments.map((p) => (
                <View key={p.id} style={styles.payHistoryRow}>
                  <Text style={styles.payHistoryMeta}>
                    {p.paymentMode} • {p.receivedAt.slice(0, 10)}
                    {p.note ? ` (${p.note})` : ''}
                  </Text>
                  <Text style={styles.payHistoryAmt}>+{formatINR(p.amount)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {trip.status !== 'CLOSED' ? (
          <BigActionButton
            label={t('owner.closeTrip')}
            icon="lock-closed"
            color={COLORS.primary}
            onPress={handleCloseTrip}
            loading={closing}
          />
        ) : null}
      </ScrollView>

      <Modal visible={payModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Incoming Freight Payment</Text>
            <TextInput
              style={styles.input}
              placeholder="Amount Received (₹)"
              keyboardType="numeric"
              value={payAmount}
              onChangeText={setPayAmount}
            />
            <View style={styles.modeRow}>
              {(['UPI', 'CASH', 'BANK', 'CHEQUE'] as const).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setPayMode(m)}
                  style={[styles.modeChip, payMode === m && styles.modeChipActive]}
                >
                  <Text style={[styles.modeText, payMode === m && styles.modeTextActive]}>{m}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder="Note (optional, e.g. Part payment)"
              value={payNote}
              onChangeText={setPayNote}
            />
            <View style={styles.modalActions}>
              <BigActionButton
                label={t('app.cancel')}
                color="#E2E8F0"
                textColor={COLORS.text}
                onPress={() => setPayModalOpen(false)}
                style={{ flex: 1 }}
              />
              <BigActionButton
                label="Save Payment"
                color={COLORS.green}
                onPress={handleAddPayment}
                loading={savingPayment}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  loading: { textAlign: 'center', marginTop: 40, color: COLORS.textSecondary },
  container: { padding: LAYOUT.PADDING, gap: 14 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: LAYOUT.RADIUS,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  route: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  meta: { fontSize: 14, color: COLORS.textSecondary },
  redFlagBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.redBg,
    borderWidth: 1.5,
    borderColor: COLORS.red,
    borderRadius: LAYOUT.RADIUS,
    padding: 14,
  },
  redFlagTitle: { fontSize: 15, fontWeight: '800', color: COLORS.red },
  redFlagSub: { fontSize: 13, color: COLORS.red, marginTop: 2 },
  mileageVal: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  pnlRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '600' },
  rowVal: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  negVal: { fontSize: 16, fontWeight: '700', color: COLORS.red },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  netLabel: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  netVal: { fontSize: 22, fontWeight: '900' },
  payHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: COLORS.navy },
  addPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.green,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
  },
  addPayText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  payHistory: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10, marginTop: 4, gap: 6 },
  payHistoryTitle: { fontSize: 12, fontWeight: '800', color: COLORS.textSecondary },
  payHistoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payHistoryMeta: { fontSize: 12, color: COLORS.textSecondary, flex: 1 },
  payHistoryAmt: { fontSize: 13, fontWeight: '800', color: COLORS.green },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  modalTitle: { fontSize: 19, fontWeight: '900', color: COLORS.text },
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
  modeRow: { flexDirection: 'row', gap: 8 },
  modeChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  modeChipActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  modeText: { fontSize: 12, fontWeight: '800', color: COLORS.textSecondary },
  modeTextActive: { color: COLORS.plateYellow },
  modalActions: { flexDirection: 'row', gap: 10 },
});
