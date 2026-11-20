import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, type NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getActiveLocalTrip } from '../../db/database';
import { BigActionButton } from '../../components/BigActionButton';
import { IndianNumberPlate } from '../../components/IndianNumberPlate';
import { COLORS, LAYOUT, SHADOWS } from '../../theme/tokens';
import type { LocalTripRecord } from '../../types/models';
import type { DriverStackParamList } from '../../navigation/DriverNavigator';

interface Props {
  navigation: NavigationProp<DriverStackParamList>;
}

const ActionTile: React.FC<{
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bgTint: string;
  onPress: () => void;
}> = ({ label, icon, color, bgTint, onPress }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const bounce = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 35 }).start();

  return (
    <Animated.View style={[styles.tileWrap, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => bounce(0.95)}
        onPressOut={() => bounce(1)}
        style={[styles.tile, SHADOWS.card]}
      >
        <View style={[styles.tileIconBox, { backgroundColor: bgTint }]}>
          <Ionicons name={icon} size={30} color={color} />
        </View>
        <Text style={styles.tileLabel} numberOfLines={2}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
};

export const DriverHomeScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { user, refreshProfile, logout } = useAuth();
  const [activeTrip, setActiveTrip] = useState<LocalTripRecord | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadState = useCallback(async () => {
    const localTrip = await getActiveLocalTrip();
    setActiveTrip(localTrip);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadState();
    }, [loadState]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshProfile().catch(() => {});
      await loadState();
    } finally {
      setRefreshing(false);
    }
  };

  const perms = user?.permissions;
  const truckNumber = user?.assignedVehicle?.vehicleNumber;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Hero Truck & Active Highway Route Card */}
      <View style={[styles.heroCard, SHADOWS.hero]}>
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.driverGreeting}>{user?.name}</Text>
            <Text style={styles.truckModel}>
              {user?.assignedVehicle?.makeModel ?? t('driver.assignedTruck')}
            </Text>
          </View>
          <Pressable onPress={logout} style={styles.logoutChip}>
            <Ionicons name="log-out-outline" size={18} color="#FCA5A5" />
          </Pressable>
        </View>

        {truckNumber ? (
          <IndianNumberPlate vehicleNumber={truckNumber} />
        ) : (
          <Text style={styles.noTruck}>{t('driver.noTruck')}</Text>
        )}

        {/* Active Highway Route Strip */}
        <View style={styles.routeCard}>
          {activeTrip ? (
            <>
              <View style={styles.liveRow}>
                <View style={styles.liveDot} />
                <Text style={styles.liveLabel}>{t('driver.activeTrip')}</Text>
              </View>
              <View style={styles.routeVisual}>
                <Text style={styles.cityText} numberOfLines={1}>
                  {activeTrip.origin}
                </Text>
                <View style={styles.roadLine}>
                  <View style={styles.roadDash} />
                  <Ionicons name="bus" size={20} color={COLORS.plateYellow} />
                  <View style={styles.roadDash} />
                </View>
                <Text style={styles.cityText} numberOfLines={1}>
                  {activeTrip.destination}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.idleRow}>
              <Ionicons name="checkmark-circle" size={22} color="#34D399" />
              <Text style={styles.idleText}>{t('driver.noActiveTrip')}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Primary Hero CTA: Start or End Trip */}
      {perms?.canStartEndTrip ? (
        activeTrip ? (
          <BigActionButton
            label={t('driver.endTrip')}
            subtitle={t('driver.liveCameraOnly')}
            icon="flag"
            color={COLORS.endTrip}
            onPress={() =>
              navigation.navigate('TripOdometer', {
                mode: 'END',
                tripClientId: activeTrip.client_id,
              })
            }
            style={styles.heroBtn}
          />
        ) : (
          <BigActionButton
            label={t('driver.startTrip')}
            subtitle={t('driver.liveCameraOnly')}
            icon="play-circle"
            color={COLORS.startTrip}
            onPress={() => navigation.navigate('TripOdometer', { mode: 'START' })}
            style={styles.heroBtn}
          />
        )
      ) : null}

      {/* Interactive 2-Column Tactile Action Grid */}
      <View style={styles.grid}>
        {perms?.canAddFuel ? (
          <ActionTile
            label={t('driver.addFuel')}
            icon="flame"
            color={COLORS.fuel}
            bgTint="#DBEAFE"
            onPress={() =>
              navigation.navigate('FuelExpense', {
                tripClientId: activeTrip?.client_id,
                tripServerId: activeTrip?.server_id ?? undefined,
              })
            }
          />
        ) : null}

        {perms?.canAddOtherExpenses ? (
          <ActionTile
            label={t('driver.addExpense')}
            icon="receipt"
            color={COLORS.expense}
            bgTint="#EDE9FE"
            onPress={() =>
              navigation.navigate('OtherExpense', {
                tripClientId: activeTrip?.client_id,
                tripServerId: activeTrip?.server_id ?? undefined,
              })
            }
          />
        ) : null}

        {perms?.canViewDocVault ? (
          <ActionTile
            label={t('driver.truckDocs')}
            icon="document-text"
            color={COLORS.docs}
            bgTint="#CCFBF1"
            onPress={() => navigation.navigate('DriverDocVault')}
          />
        ) : null}

        <ActionTile
          label={t('sync.queueTitle')}
          icon="cloud-upload"
          color={COLORS.saffron}
          bgTint="#FFEDD5"
          onPress={() => navigation.navigate('SyncQueue')}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: LAYOUT.PADDING, gap: 16, paddingBottom: 32 },
  heroCard: {
    backgroundColor: COLORS.navy,
    borderRadius: 22,
    padding: 18,
    gap: 14,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  driverGreeting: { fontSize: 22, fontWeight: '900', color: '#FFFFFF' },
  truckModel: { fontSize: 13, color: '#94A3B8', marginTop: 2 },
  logoutChip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noTruck: { fontSize: 15, color: '#CBD5E1', fontWeight: '600' },
  routeCard: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34D399' },
  liveLabel: { fontSize: 11, fontWeight: '800', color: '#34D399', textTransform: 'uppercase' },
  routeVisual: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cityText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', maxWidth: '34%' },
  roadLine: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  roadDash: { flex: 1, height: 2, backgroundColor: 'rgba(250,204,21,0.55)' },
  idleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  idleText: { fontSize: 15, fontWeight: '700', color: '#E2E8F0' },
  heroBtn: { minHeight: 72 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tileWrap: { width: '48%' },
  tile: {
    minHeight: 126,
    backgroundColor: COLORS.surface,
    borderRadius: LAYOUT.RADIUS,
    padding: 16,
    justifyContent: 'space-between',
    gap: 12,
  },
  tileIconBox: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { fontSize: 16, fontWeight: '800', color: COLORS.text, lineHeight: 21 },
});
