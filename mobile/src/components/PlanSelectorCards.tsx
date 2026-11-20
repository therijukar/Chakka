import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../theme/tokens';
import type { SubscriptionPlanOption } from '../types/models';

interface PlanSelectorCardsProps {
  plans: SubscriptionPlanOption[];
  selectedPlanId: string | null;
  currentPlanId?: string | null;
  billingCycle: 'monthly' | 'yearly';
  onChangeBillingCycle: (cycle: 'monthly' | 'yearly') => void;
  onSelectPlan: (planId: string) => void;
}

const FEATURE_LABELS: Array<{
  key: keyof Pick<
    SubscriptionPlanOption,
    | 'feature_ocr_vision'
    | 'feature_fastag_auto_sync'
    | 'feature_emi_tracker'
    | 'feature_compliance_vault'
    | 'feature_driver_permissions'
    | 'feature_monthly_analytics'
  >;
  label: string;
}> = [
  { key: 'feature_compliance_vault', label: 'Offline Doc Vault' },
  { key: 'feature_driver_permissions', label: 'Driver Controls' },
  { key: 'feature_ocr_vision', label: 'AI Bill OCR' },
  { key: 'feature_fastag_auto_sync', label: 'FASTag Auto-Sync' },
  { key: 'feature_emi_tracker', label: 'EMI Tracker' },
  { key: 'feature_monthly_analytics', label: 'P&L Analytics' },
];

export const PlanSelectorCards: React.FC<PlanSelectorCardsProps> = ({
  plans,
  selectedPlanId,
  currentPlanId,
  billingCycle,
  onChangeBillingCycle,
  onSelectPlan,
}) => {
  return (
    <View style={styles.wrap}>
      <View style={styles.cycleToggle}>
        <Pressable
          onPress={() => onChangeBillingCycle('monthly')}
          style={[styles.cycleBtn, billingCycle === 'monthly' && styles.cycleBtnActive]}
        >
          <Text style={[styles.cycleText, billingCycle === 'monthly' && styles.cycleTextActive]}>
            Monthly (30 Days)
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onChangeBillingCycle('yearly')}
          style={[styles.cycleBtn, billingCycle === 'yearly' && styles.cycleBtnActive]}
        >
          <Text style={[styles.cycleText, billingCycle === 'yearly' && styles.cycleTextActive]}>
            Yearly (365 Days)
          </Text>
        </Pressable>
      </View>

      {plans.map((plan) => {
        const isSelected = plan.id === selectedPlanId;
        const isCurrent = plan.id === currentPlanId;
        const price =
          billingCycle === 'yearly' ? plan.price_yearly_inr : plan.price_monthly_inr;

        return (
          <Pressable
            key={plan.id}
            onPress={() => onSelectPlan(plan.id)}
            style={[
              styles.card,
              SHADOWS.card,
              isSelected && styles.cardSelected,
            ]}
          >
            <View style={styles.cardHead}>
              <View style={{ flex: 1 }}>
                <View style={styles.titleRow}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  {isCurrent ? (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>ACTIVE</Text>
                    </View>
                  ) : null}
                </View>
                {plan.description ? (
                  <Text style={styles.planDesc}>{plan.description}</Text>
                ) : null}
              </View>

              <View style={styles.priceCol}>
                <Text style={styles.priceText}>
                  ₹{Number(price).toLocaleString('en-IN')}
                </Text>
                <Text style={styles.periodText}>
                  /{billingCycle === 'yearly' ? 'yr' : 'mo'}
                </Text>
                <View style={styles.freeTag}>
                  <Text style={styles.freeTagText}>₹0 Now</Text>
                </View>
              </View>
            </View>

            <View style={styles.limitsRow}>
              <View style={styles.limitChip}>
                <Ionicons name="bus" size={14} color={COLORS.primary} />
                <Text style={styles.limitText}>Up to {plan.max_trucks} Trucks</Text>
              </View>
              <View style={styles.limitChip}>
                <Ionicons name="people" size={14} color={COLORS.primary} />
                <Text style={styles.limitText}>Up to {plan.max_drivers} Drivers</Text>
              </View>
            </View>

            <View style={styles.featuresGrid}>
              {FEATURE_LABELS.map((f) => {
                const enabled = Boolean(plan[f.key]);
                return (
                  <View key={f.key} style={styles.featureItem}>
                    <Ionicons
                      name={enabled ? 'checkmark-circle' : 'close-circle'}
                      size={15}
                      color={enabled ? COLORS.green : '#CBD5E1'}
                    />
                    <Text
                      style={[
                        styles.featureText,
                        !enabled && styles.featureTextDisabled,
                      ]}
                    >
                      {f.label}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.selectFooter}>
              <Ionicons
                name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={isSelected ? COLORS.primary : COLORS.textSecondary}
              />
              <Text style={[styles.selectLabel, isSelected && styles.selectLabelActive]}>
                {isSelected
                  ? isCurrent
                    ? 'Current Active Plan'
                    : 'Selected — Auto-Activates Immediately'
                  : 'Tap to Select Plan'}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  cycleToggle: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  cycleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
  },
  cycleBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  cycleText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  cycleTextActive: {
    color: COLORS.navy,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
    gap: 12,
  },
  cardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#F8FAFF',
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planName: { fontSize: 17, fontWeight: '900', color: COLORS.text },
  currentBadge: {
    backgroundColor: COLORS.greenBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  currentBadgeText: { fontSize: 10, fontWeight: '900', color: COLORS.green },
  planDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4, lineHeight: 17 },
  priceCol: { alignItems: 'flex-end' },
  priceText: { fontSize: 20, fontWeight: '900', color: COLORS.navy },
  periodText: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  freeTag: {
    marginTop: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  freeTagText: { fontSize: 10, fontWeight: '800', color: '#15803D' },
  limitsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  limitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  limitText: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: '47%',
  },
  featureText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  featureTextDisabled: { color: '#94A3B8', textDecorationLine: 'line-through' },
  selectFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  selectLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  selectLabelActive: { color: COLORS.primary, fontWeight: '800' },
});
