import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../api/client';
import {
  enqueueSyncItem,
  getCachedCategories,
  saveLocalExpense,
} from '../../db/database';
import { compressImageToMax250KB } from '../../sync/imageCompressor';
import { syncEngine } from '../../sync/syncEngine';
import { generateClientId } from '../../utils/formatters';
import { BigActionButton } from '../../components/BigActionButton';
import { COLORS, LAYOUT } from '../../theme/tokens';
import type { DriverStackParamList } from '../../navigation/DriverNavigator';

interface Props {
  navigation: NativeStackNavigationProp<DriverStackParamList, 'FuelExpense'>;
  route: RouteProp<DriverStackParamList, 'FuelExpense'>;
}

export const FuelExpenseScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tripClientId, tripServerId } = route.params;

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [fuelCategoryId, setFuelCategoryId] = useState<string>('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(true);
  const [extracting, setExtracting] = useState(false);

  const [liters, setLiters] = useState('');
  const [ratePerLiter, setRatePerLiter] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [pumpName, setPumpName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCachedCategories().then((cats) => {
      const diesel = cats.find((c) => c.isFuel) ?? cats[0];
      if (diesel) setFuelCategoryId(diesel.id);
    });
  }, []);

  const recalcTotal = (nextLiters: string, nextRate: string) => {
    const l = Number(nextLiters);
    const r = Number(nextRate);
    if (l > 0 && r > 0) {
      setTotalAmount((l * r).toFixed(2));
    }
  };

  const captureBillPhoto = async () => {
    if (!cameraRef.current) return;
    const raw = await cameraRef.current.takePictureAsync({ quality: 0.7 });
    if (!raw?.uri) return;

    const compressed = await compressImageToMax250KB(raw.uri);
    setPhotoUri(compressed.uri);
    setShowCamera(false);

    setExtracting(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(compressed.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const ocr = await apiRequest<{
        liters: number;
        rate_per_liter: number;
        total_amount: number;
        pump_name?: string;
      }>('/api/ocr/fuel-bill', {
        method: 'POST',
        body: { image_base64: base64, mime_type: 'image/jpeg' },
      });
      setLiters(String(ocr.liters));
      setRatePerLiter(String(ocr.rate_per_liter));
      setTotalAmount(String(ocr.total_amount));
      if (ocr.pump_name) setPumpName(ocr.pump_name);
    } catch {
      // Offline — driver enters numbers manually
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    const l = Number(liters);
    const r = Number(ratePerLiter);
    const total = Number(totalAmount) || (l > 0 && r > 0 ? l * r : 0);

    if (total <= 0) {
      Alert.alert(t('driver.totalAmount'));
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
        category_id: fuelCategoryId,
        category_name: 'Diesel',
        is_fuel: 1,
        amount: total,
        liters: l > 0 ? l : null,
        rate_per_liter: r > 0 ? r : null,
        pump_name: pumpName.trim() || null,
        bill_photo_uri: photoUri,
        note: null,
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
          category_id: fuelCategoryId,
          amount: total,
          liters: l > 0 ? l : undefined,
          rate_per_liter: r > 0 ? r : undefined,
          pump_name: pumpName.trim() || undefined,
          expense_date: nowIso,
        },
        local_photo_uri: photoUri,
      });

      await syncEngine.refreshCounts();
      syncEngine.runSync().catch(() => {});
      Alert.alert(t('app.confirm'), t('driver.savedOffline'));
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  if (showCamera && permission?.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back" />
          <BigActionButton
            label={t('driver.takePhoto')}
            icon="camera"
            color={COLORS.fuel}
            onPress={captureBillPhoto}
          />
          <BigActionButton
            label={t('app.cancel')}
            color="#E5E7EB"
            textColor={COLORS.text}
            onPress={() => setShowCamera(false)}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.preview} />
        ) : (
          <BigActionButton
            label={t('driver.takePhoto')}
            icon="camera"
            color={COLORS.fuel}
            onPress={async () => {
              if (!permission?.granted) await requestPermission();
              setShowCamera(true);
            }}
          />
        )}

        {extracting ? <Text style={styles.ocrText}>{t('driver.extractingOcr')}</Text> : null}

        <Text style={styles.label}>{t('driver.liters')}</Text>
        <TextInput
          style={styles.bigInput}
          value={liters}
          onChangeText={(val) => {
            setLiters(val);
            recalcTotal(val, ratePerLiter);
          }}
          keyboardType="decimal-pad"
          placeholder="100"
        />

        <Text style={styles.label}>{t('driver.ratePerLiter')}</Text>
        <TextInput
          style={styles.bigInput}
          value={ratePerLiter}
          onChangeText={(val) => {
            setRatePerLiter(val);
            recalcTotal(liters, val);
          }}
          keyboardType="decimal-pad"
          placeholder="93.50"
        />

        <Text style={styles.label}>{t('driver.totalAmount')}</Text>
        <TextInput
          style={[styles.bigInput, styles.totalInput]}
          value={totalAmount}
          onChangeText={setTotalAmount}
          keyboardType="decimal-pad"
          placeholder="9350"
        />

        <Text style={styles.label}>{t('driver.pumpName')}</Text>
        <TextInput
          style={styles.input}
          value={pumpName}
          onChangeText={setPumpName}
          placeholder="HPCL / IndianOil"
        />

        <BigActionButton
          label={t('app.save')}
          icon="checkmark-circle"
          color={COLORS.green}
          onPress={handleSave}
          loading={saving}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: LAYOUT.PADDING, gap: 12 },
  camera: { width: '100%', height: 360, borderRadius: LAYOUT.RADIUS, overflow: 'hidden' },
  preview: { width: '100%', height: 180, borderRadius: LAYOUT.RADIUS },
  ocrText: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  label: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  bigInput: {
    minHeight: 58,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
  },
  totalInput: {
    borderColor: COLORS.green,
    borderWidth: 2,
    color: COLORS.green,
  },
  input: {
    minHeight: LAYOUT.MIN_TOUCH_TARGET,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    fontSize: 17,
    color: COLORS.text,
  },
});
