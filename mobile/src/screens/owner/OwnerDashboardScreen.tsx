import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OwnerOverviewStackParamList } from '../../navigation/OwnerNavigator';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../api/client';
import { formatINR } from '../../utils/formatters';
import { COLORS, LAYOUT, SHADOWS } from '../../theme/tokens';

interface MonthlyAnalytics {
  trip_count: number;
  total_freight: number;
  total_fuel: number;
  total_other_expenses: number;
  total_tolls: number;
  total_monthly_emis: number;
  net_profit: number;
}

interface FleetReport {
  summary: {
    trip_count: number;
    active_trips: number;
    completed_trips: number;
    total_freight: number;
    total_collected: number;
    total_pending_due: number;
    total_fuel: number;
    total_other_expenses: number;
    total_tolls: number;
    total_monthly_emis: number;
    operating_profit: number;
    net_profit: number;
    total_km_run: number;
    avg_profit_per_trip: number;
  };
  by_truck: Array<{
    vehicle_id: string;
    vehicle_number: string;
    make_model?: string | null;
    trip_count: number;
    total_freight: number;
    total_expenses: number;
    total_tolls: number;
    net_profit: number;
    km_run: number;
  }>;
  by_driver: Array<{
    driver_id: string;
    driver_name: string;
    trip_count: number;
    total_freight: number;
    total_expenses: number;
    advance_given: number;
    advance_balance: number;
  }>;
}

interface PendingExpense {
  id: string;
  amount: string | number;
  note?: string | null;
  category: { name: string; isFuel: boolean };
  vehicle: { vehicleNumber: string };
  driver?: { name: string } | null;
  expenseDate: string;
}

interface ComplianceCounts {
  red: number;
  amber: number;
  green: number;
}

export const OwnerDashboardScreen: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<OwnerOverviewStackParamList>>();

  const [includeEmis, setIncludeEmis] = useState(false);
  const [analytics, setAnalytics] = useState<MonthlyAnalytics | null>(null);
  const [report, setReport] = useState<FleetReport | null>(null);
  const [reportTab, setReportTab] = useState<'TRUCKS' | 'DRIVERS'>('TRUCKS');
  const [pendingExpenses, setPendingExpenses] = useState<PendingExpense[]>([]);
  const [compliance, setCompliance] = useState<ComplianceCounts>({ red: 0, amber: 0, green: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(
    async (withEmis = includeEmis) => {
      try {
        const [aRes, rRes, eRes, cRes] = await Promise.all([
          apiRequest<MonthlyAnalytics>(`/api/analytics/monthly?include_emis=${withEmis}`).catch(
            () => null,
          ),
          apiRequest<FleetReport>(`/api/analytics/report?include_emis=${withEmis}`).catch(
            () => null,
          ),
          apiRequest<{ expenses: PendingExpense[] }>('/api/expenses?approval_status=PENDING').catch(
            () => ({ expenses: [] }),
          ),
          apiRequest<{ counts: ComplianceCounts }>('/api/compliance/summary').catch(() => ({
            counts: { red: 0, amber: 0, green: 0 },
          })),
        ]);
        if (aRes) setAnalytics(aRes);
        if (rRes) {
          setReport(rRes);
          if (!aRes) setAnalytics(rRes.summary);
        }
        setPendingExpenses(eRes.expenses);
        setCompliance(cRes.counts);
      } catch {
        // Offline
      }
    },
    [includeEmis],
  );

  useFocusEffect(
    useCallback(() => {
      loadDashboard(includeEmis);
    }, [loadDashboard, includeEmis]),
  );

  const onToggleEmis = (next: boolean) => {
    setIncludeEmis(next);
    loadDashboard(next);
  };

  const handleDecision = async (id: string, action: 'approve' | 'reject') => {
    try {
      await apiRequest(`/api/expenses/${id}/${action}`, { method: 'PATCH', body: {} });
      setPendingExpenses((prev) => prev.filter((e) => e.id !== id));
      loadDashboard(includeEmis);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Action failed');
    }
  };

  const sub = user?.subscription;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await loadDashboard(includeEmis);
            setRefreshing(false);
          }}
        />
      }
    >
      {/* Greeting & Plan Pill */}
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{user?.name}</Text>
          <Pressable
            onPress={() => navigation.navigate('OwnerAccount')}
            style={styles.planPill}
          >
            <Ionicons name="sparkles" size={13} color={COLORS.saffron} />
            <Text style={styles.planPillText}>
              {sub
                ? `${sub.plan.name} • ${sub.usage.trucks_used}/${sub.usage.max_trucks} Trucks`
                : 'Choose Subscription Plan'}
            </Text>
            <Ionicons name="chevron-forward" size={13} color={COLORS.primary} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => navigation.navigate('OwnerAccount')}
            style={styles.accountPillBtn}
          >
            <Ionicons name="person-circle" size={18} color={COLORS.primary} />
            <Text style={styles.accountPillText}>My Account</Text>
          </Pressable>
          <Pressable onPress={logout} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={20} color={COLORS.red} />
          </Pressable>
        </View>
      </View>

      {/* Navy Hero Net Profit Card */}
      <View style={[styles.profitCard, SHADOWS.hero]}>
        <View style={styles.profitHead}>
          <View>
            <Text style={styles.profitLabel}>{t('owner.netProfit')}</Text>
            <Text style={styles.profitValue}>{formatINR(analytics?.net_profit ?? 0)}</Text>
          </View>
          <View style={styles.trophyBox}>
            <Ionicons name="trending-up" size={26} color={COLORS.plateYellow} />
          </View>
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{t('owner.includeEmis')}</Text>
          <Switch
            value={includeEmis}
            onValueChange={onToggleEmis}
            trackColor={{ false: '#334155', true: COLORS.saffron }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricBox}>
            <Ionicons name="cash-outline" size={16} color="#34D399" />
            <Text style={styles.metricLabel}>{t('owner.agreedFreight')}</Text>
            <Text style={styles.metricVal}>{formatINR(analytics?.total_freight ?? 0)}</Text>
          </View>
          <View style={styles.metricBox}>
            <Ionicons name="flame-outline" size={16} color="#60A5FA" />
            <Text style={styles.metricLabel}>{t('owner.fuel')}</Text>
            <Text style={styles.metricVal}>{formatINR(analytics?.total_fuel ?? 0)}</Text>
          </View>
          <View style={styles.metricBox}>
            <Ionicons name="car-outline" size={16} color="#FBBF24" />
            <Text style={styles.metricLabel}>{t('owner.tolls')}</Text>
            <Text style={styles.metricVal}>{formatINR(analytics?.total_tolls ?? 0)}</Text>
          </View>
          <View style={styles.metricBox}>
            <Ionicons name="receipt-outline" size={16} color="#C084FC" />
            <Text style={styles.metricLabel}>{t('owner.otherExpenses')}</Text>
            <Text style={styles.metricVal}>{formatINR(analytics?.total_other_expenses ?? 0)}</Text>
          </View>
        </View>
      </View>

      {/* Compliance Traffic-Light Cards */}
      <View style={styles.complianceRow}>
        <View style={[styles.badgeBox, SHADOWS.card, { borderTopColor: COLORS.red }]}>
          <Ionicons name="alert-circle" size={22} color={COLORS.red} />
          <Text style={[styles.badgeCount, { color: COLORS.red }]}>{compliance.red}</Text>
          <Text style={styles.badgeLabel} numberOfLines={2}>
            {t('owner.expiredOrUrgent')}
          </Text>
        </View>
        <View style={[styles.badgeBox, SHADOWS.card, { borderTopColor: COLORS.amber }]}>
          <Ionicons name="time" size={22} color={COLORS.amber} />
          <Text style={[styles.badgeCount, { color: COLORS.amber }]}>{compliance.amber}</Text>
          <Text style={styles.badgeLabel} numberOfLines={2}>
            {t('owner.expiringSoon')}
          </Text>
        </View>
        <View style={[styles.badgeBox, SHADOWS.card, { borderTopColor: COLORS.green }]}>
          <Ionicons name="shield-checkmark" size={22} color={COLORS.green} />
          <Text style={[styles.badgeCount, { color: COLORS.green }]}>{compliance.green}</Text>
          <Text style={styles.badgeLabel} numberOfLines={2}>
            {t('owner.valid')}
          </Text>
        </View>
      </View>

      {/* In-Depth Report Section */}
      {report ? (
        <View style={[styles.reportCard, SHADOWS.card]}>
          <View style={styles.reportHeader}>
            <View>
              <Text style={styles.sectionTitle}>In-Depth Monthly Report</Text>
              <Text style={styles.reportSub}>
                {report.summary.trip_count} Trips ({report.summary.active_trips} Active) •{' '}
                {report.summary.total_km_run.toLocaleString('en-IN')} km
              </Text>
            </View>
            <View style={styles.avgPill}>
              <Text style={styles.avgPillText}>
                Avg {formatINR(report.summary.avg_profit_per_trip)}/trip
              </Text>
            </View>
          </View>

          <View style={styles.collectionRow}>
            <View style={[styles.collectionBox, { backgroundColor: '#ECFDF5' }]}>
              <Text style={styles.collectionLbl}>Collected</Text>
              <Text style={[styles.collectionVal, { color: COLORS.green }]}>
                {formatINR(report.summary.total_collected)}
              </Text>
            </View>
            <View style={[styles.collectionBox, { backgroundColor: '#FEF2F2' }]}>
              <Text style={styles.collectionLbl}>Pending / Due</Text>
              <Text style={[styles.collectionVal, { color: COLORS.red }]}>
                {formatINR(report.summary.total_pending_due)}
              </Text>
            </View>
          </View>

          <View style={styles.reportTabs}>
            <Pressable
              onPress={() => setReportTab('TRUCKS')}
              style={[styles.reportTabBtn, reportTab === 'TRUCKS' && styles.reportTabBtnActive]}
            >
              <Text
                style={[
                  styles.reportTabText,
                  reportTab === 'TRUCKS' && styles.reportTabTextActive,
                ]}
              >
                Truck-Wise ({report.by_truck.length})
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setReportTab('DRIVERS')}
              style={[styles.reportTabBtn, reportTab === 'DRIVERS' && styles.reportTabBtnActive]}
            >
              <Text
                style={[
                  styles.reportTabText,
                  reportTab === 'DRIVERS' && styles.reportTabTextActive,
                ]}
              >
                Driver-Wise ({report.by_driver.length})
              </Text>
            </Pressable>
          </View>

          {reportTab === 'TRUCKS' ? (
            report.by_truck.length === 0 ? (
              <Text style={styles.emptyReport}>No trucks added yet.</Text>
            ) : (
              report.by_truck.map((tr) => (
                <View key={tr.vehicle_id} style={styles.reportRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reportRowTitle}>{tr.vehicle_number}</Text>
                    <Text style={styles.reportRowSub}>
                      {tr.trip_count} trips • {tr.km_run} km • Exp {formatINR(tr.total_expenses + tr.total_tolls)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={[
                        styles.reportRowVal,
                        { color: tr.net_profit >= 0 ? COLORS.green : COLORS.red },
                      ]}
                    >
                      {formatINR(tr.net_profit)}
                    </Text>
                    <Text style={styles.reportRowSub}>Freight {formatINR(tr.total_freight)}</Text>
                  </View>
                </View>
              ))
            )
          ) : report.by_driver.length === 0 ? (
            <Text style={styles.emptyReport}>No drivers added yet.</Text>
          ) : (
            report.by_driver.map((dr) => (
              <View key={dr.driver_id} style={styles.reportRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reportRowTitle}>{dr.driver_name}</Text>
                  <Text style={styles.reportRowSub}>
                    {dr.trip_count} trips • Adv Given {formatINR(dr.advance_given)} • Spent{' '}
                    {formatINR(dr.total_expenses)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={[
                      styles.reportRowVal,
                      { color: dr.advance_balance >= 0 ? COLORS.primary : COLORS.red },
                    ]}
                  >
                    {formatINR(dr.advance_balance)}
                  </Text>
                  <Text style={styles.reportRowSub}>Adv Balance</Text>
                </View>
              </View>
            ))
          )}
        </View>
      ) : null}

      {/* 1-Tap Expense Approval Queue */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('owner.pendingApprovals')}</Text>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{pendingExpenses.length}</Text>
        </View>
      </View>

      {pendingExpenses.map((exp) => (
        <View key={exp.id} style={[styles.approvalCard, SHADOWS.card]}>
          <View style={styles.approvalHeader}>
            <View style={[styles.catIcon, { backgroundColor: exp.category.isFuel ? '#DBEAFE' : '#EDE9FE' }]}>
              <Ionicons
                name={exp.category.isFuel ? 'flame' : 'receipt'}
                size={22}
                color={exp.category.isFuel ? COLORS.fuel : COLORS.expense}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.approvalTitle}>{exp.category.name}</Text>
              <Text style={styles.approvalSub}>
                {exp.vehicle.vehicleNumber} • {exp.driver?.name ?? 'Driver'}
              </Text>
              <Text style={styles.approvalSub}>{exp.expenseDate.slice(0, 10)}</Text>
            </View>
            <Text style={styles.approvalAmount}>{formatINR(exp.amount)}</Text>
          </View>

          <View style={styles.approvalActions}>
            <Pressable
              onPress={() => handleDecision(exp.id, 'approve')}
              style={[styles.decisionBtn, { backgroundColor: COLORS.green }]}
            >
              <Ionicons name="checkmark-circle" size={19} color="#FFF" />
              <Text style={styles.decisionText}>{t('owner.approve')}</Text>
            </Pressable>
            <Pressable
              onPress={() => handleDecision(exp.id, 'reject')}
              style={[styles.decisionBtn, { backgroundColor: COLORS.red }]}
            >
              <Ionicons name="close-circle" size={19} color="#FFF" />
              <Text style={styles.decisionText}>{t('owner.reject')}</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: LAYOUT.PADDING, gap: 16, paddingBottom: 32 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  greeting: { fontSize: 22, fontWeight: '900', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textSecondary },
  planPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: COLORS.saffronBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 4,
  },
  planPillText: { fontSize: 12, fontWeight: '800', color: COLORS.saffron },
  accountPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  accountPillText: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  reportCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  reportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reportSub: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600', marginTop: 2 },
  avgPill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  avgPillText: { fontSize: 11, fontWeight: '800', color: COLORS.primary },
  collectionRow: { flexDirection: 'row', gap: 10 },
  collectionBox: { flex: 1, borderRadius: 12, padding: 12 },
  collectionLbl: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  collectionVal: { fontSize: 17, fontWeight: '900', marginTop: 2 },
  reportTabs: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  reportTabBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  reportTabBtnActive: { backgroundColor: '#FFFFFF' },
  reportTabText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  reportTabTextActive: { color: COLORS.navy, fontWeight: '900' },
  reportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  reportRowTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  reportRowSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  reportRowVal: { fontSize: 15, fontWeight: '900' },
  emptyReport: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 10 },
  logoutBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.redBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profitCard: {
    backgroundColor: COLORS.navy,
    borderRadius: 22,
    padding: 18,
    gap: 12,
  },
  profitHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  profitLabel: { fontSize: 13, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },
  profitValue: { fontSize: 34, fontWeight: '900', color: '#FFFFFF', marginTop: 2 },
  trophyBox: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toggleLabel: { fontSize: 14, fontWeight: '700', color: '#E2E8F0' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricBox: {
    width: '48.5%',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14,
    padding: 12,
    gap: 3,
  },
  metricLabel: { fontSize: 12, color: '#CBD5E1', fontWeight: '600' },
  metricVal: { fontSize: 17, fontWeight: '900', color: '#FFFFFF' },
  complianceRow: { flexDirection: 'row', gap: 10 },
  badgeBox: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderTopWidth: 4,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  badgeCount: { fontSize: 22, fontWeight: '900' },
  badgeLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  countPill: {
    backgroundColor: COLORS.saffron,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  countPillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  approvalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: LAYOUT.RADIUS,
    padding: 14,
    gap: 12,
  },
  approvalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  catIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvalTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  approvalSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  approvalAmount: { fontSize: 19, fontWeight: '900', color: COLORS.navy },
  approvalActions: { flexDirection: 'row', gap: 10 },
  decisionBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  decisionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
