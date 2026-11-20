import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import {
  enqueueSyncItem,
  getCachedCategories,
  saveLocalExpense,
} from '../../db/database';
import { syncEngine } from '../../sync/syncEngine';
import { generateClientId } from '../../utils/formatters';
import { BigActionButton } from '../../components/BigActionButton';
import { COLORS, LAYOUT } from '../../theme/tokens';
import type { ExpenseCategory } from '../../types/models';
import type { DriverStackParamList } from '../../navigation/DriverNavigator';

interface Props {
  navigation: NativeStackNavigationProp<DriverStackParamList, 'OtherExpense'>;
  route: RouteProp<DriverStackParamList, 'OtherExpense'>;
}

export const OtherExpenseScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tripClientId, tripServerId } = route.params;

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [selectedCat, setSelectedCat] = useState<ExpenseCategory | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCachedCategories().then((cats) => {
      const nonFuel = cats.filter((c) => !c.isFuel);
      setCategories(nonFuel);
      if (nonFuel.length > 0) setSelectedCat(nonFuel[0]);
    });
  }, []);

  const handleSave = async () => {
    const amt = Number(amount);
    if (!selectedCat || !amt || amt <= 0) {
      Alert.alert(t('driver.amountInr'));
      return;
    }

    setSaving(true);
    try {
      const clientId = generateClientId();
      const nowIso = new Date().toISOString();
      const vehicleId = user?.assignedVehicle?.id ?? '';

      await saveLocalExpense({
        client_id: clientId,
        server_id: null,
        trip_client_id: tripClientId ?? null,
        trip_server_id: tripServerId ?? null,
        vehicle_id: vehicleId,
        category_id: selectedCat.id,
        category_name: selectedCat.name,
        is_fuel: 0,
        amount: amt,
        liters: null,
        rate_per_liter: null,
        pump_name: null,
        bill_photo_uri: null,
        note: note.trim() || null,
        sync_status: 'PENDING',
        created_at: nowIso,
      });

      await enqueueSyncItem({
        client_id: clientId,
        entity_type: 'EXPENSE_CREATE',
        payload: {
          client_id: clientId,
          trip_id: tripServerId,
          vehicle_id: vehicleId,
          category_id: selectedCat.id,
          amount: amt,
          note: note.trim() || undefined,
          expense_date: nowIso,
        },
      });

      await syncEngine.refreshCounts();
      syncEngine.runSync().catch(() => {});
      Alert.alert(t('app.confirm'), t('driver.savedOffline'));
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.label}>{t('driver.selectCategory')}</Text>
        <View style={styles.grid}>
          {categories.map((cat) => {
            const active = selectedCat?.id === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setSelectedCat(cat)}
                style={[styles.catCard, active && styles.catCardActive]}
              >
                <Ionicons
                  name="receipt-outline"
                  size={24}
                  color={active ? '#FFFFFF' : COLORS.primary}
                />
                <Text style={[styles.catName, active && styles.catNameActive]} numberOfLines={2}>
                  {cat.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>{t('driver.amountInr')}</Text>
        <TextInput
          style={styles.amountInput}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="500"
        />

        <Text style={styles.label}>{t('driver.noteOptional')}</Text>
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          placeholder="..."
        />

        <BigActionButton
          label={t('app.save')}
          icon="checkmark-circle"
          color={COLORS.expense}
          onPress={handleSave}
          loading={saving}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: LAYOUT.PADDING, gap: 14 },
  label: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  catCard: {
    width: '48%',
    minHeight: 72,
    backgroundColor: COLORS.surface,
    borderRadius: LAYOUT.RADIUS,
    borderWidth: 2,
    borderColor: COLORS.border,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  catCardActive: {
    backgroundColor: COLORS.expense,
    borderColor: COLORS.expense,
  },
  catName: { fontSize: 15, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  catNameActive: { color: '#FFFFFF' },
  amountInput: {
    minHeight: 62,
    borderWidth: 2,
    borderColor: COLORS.expense,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.text,
    textAlign: 'center',
  },
  input: {
    minHeight: LAYOUT.MIN_TOUCH_TARGET,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    color: COLORS.text,
  },
});
