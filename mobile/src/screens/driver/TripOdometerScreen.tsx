import React, { useRef, useState } from 'react';
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
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../api/client';
import {
  enqueueSyncItem,
  getActiveLocalTrip,
  saveLocalTrip,
} from '../../db/database';
import { compressImageToMax250KB } from '../../sync/imageCompressor';
import { syncEngine } from '../../sync/syncEngine';
import { generateClientId } from '../../utils/formatters';
import { BigActionButton } from '../../components/BigActionButton';
import { COLORS, LAYOUT } from '../../theme/tokens';
import type { DriverStackParamList } from '../../navigation/DriverNavigator';

interface Props {
  navigation: NativeStackNavigationProp<DriverStackParamList, 'TripOdometer'>;
  route: RouteProp<DriverStackParamList, 'TripOdometer'>;
}

export const TripOdometerScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { mode, tripClientId } = route.params;

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [odometerKm, setOdometerKm] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);

  const captureLiveOdometer = async () => {
    if (!cameraRef.current) return;
    const rawPhoto = await cameraRef.current.takePictureAsync({ quality: 0.7 });
    if (!rawPhoto?.uri) return;

    // Compress immediately to <= 250 KB
    const compressed = await compressImageToMax250KB(rawPhoto.uri);
    setPhotoUri(compressed.uri);

    // Capture GPS coordinates & reverse-geocode city automatically
    try {
      const locPerm = await Location.requestForegroundPermissionsAsync();
      if (locPerm.status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        if (mode === 'START') {
          const places = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          }).catch(() => []);
          const place = places[0];
          if (place) {
            const cityLabel = [place.city || place.subregion || place.district, place.region]
              .filter(Boolean)
              .join(', ');
            if (cityLabel) {
              setOrigin((prev) => prev || cityLabel);
            }
          }
        }
      }
    } catch {
      // Proceed even if GPS unavailable
    }

    // Attempt online Vision OCR extraction; fallback cleanly if offline
    setExtracting(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(compressed.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const ocr = await apiRequest<{ odometer_km: number; confidence: number }>('/api/ocr/odometer', {
        method: 'POST',
        body: { image_base64: base64, mime_type: 'image/jpeg' },
      });
      setOdometerKm(String(ocr.odometer_km));
    } catch {
      // Offline: driver confirms/types odometer reading manually
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    const km = Number(odometerKm);
    if (!km || Number.isNaN(km)) {
      Alert.alert(t('driver.odometerReading'));
      return;
    }

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      if (mode === 'START') {
        const clientId = generateClientId();
        const vehicleId = user?.assignedVehicle?.id ?? '';
        const tripOrigin = origin.trim() || 'Origin';
        const tripDest = destination.trim() || 'Destination';

        await saveLocalTrip({
          client_id: clientId,
          server_id: null,
          vehicle_id: vehicleId,
          origin: tripOrigin,
          destination: tripDest,
          start_odometer_km: km,
          end_odometer_km: null,
          start_photo_uri: photoUri,
          end_photo_uri: null,
          start_lat: coords?.lat ?? null,
          start_lng: coords?.lng ?? null,
          end_lat: null,
          end_lng: null,
          started_at: nowIso,
          ended_at: null,
          status: 'ACTIVE',
          sync_status: 'PENDING',
          created_at: nowIso,
        });

        await enqueueSyncItem({
          client_id: clientId,
          entity_type: 'TRIP_CREATE',
          payload: {
            client_id: clientId,
            vehicle_id: vehicleId,
            origin: tripOrigin,
            destination: tripDest,
            start_odometer_km: km,
            start_lat: coords?.lat,
            start_lng: coords?.lng,
            started_at: nowIso,
            status: 'ACTIVE',
          },
          local_photo_uri: photoUri,
        });
      } else {
        const active = await getActiveLocalTrip();
        const targetClientId = tripClientId ?? active?.client_id;
        if (active && targetClientId) {
          await saveLocalTrip({
            ...active,
            end_odometer_km: km,
            end_photo_uri: photoUri,
            end_lat: coords?.lat ?? null,
            end_lng: coords?.lng ?? null,
            ended_at: nowIso,
            status: 'COMPLETED',
            sync_status: 'PENDING',
          });

          await enqueueSyncItem({
            client_id: targetClientId,
            entity_type: 'TRIP_END',
            payload: {
              server_id: active.server_id ?? undefined,
              end_odometer_km: km,
              end_lat: coords?.lat,
              end_lng: coords?.lng,
              ended_at: nowIso,
            },
            local_photo_uri: photoUri,
          });
        }
      }

      await syncEngine.refreshCounts();
      syncEngine.runSync().catch(() => {});
      Alert.alert(t('app.confirm'), t('driver.savedOffline'));
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  if (!permission) {
    return <View style={styles.safe} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.infoText}>{t('driver.liveCameraOnly')}</Text>
        <BigActionButton label={t('driver.takePhoto')} icon="camera" onPress={requestPermission} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.notice}>{t('driver.liveCameraOnly')}</Text>

        {!photoUri ? (
          <View style={styles.cameraBox}>
            <CameraView ref={cameraRef} style={styles.camera} facing="back" />
            <BigActionButton
              label={t('driver.takePhoto')}
              icon="camera"
              color={COLORS.primary}
              onPress={captureLiveOdometer}
            />
          </View>
        ) : (
          <View style={styles.form}>
            <Image source={{ uri: photoUri }} style={styles.preview} />
            {coords ? <Text style={styles.gpsOk}>{t('driver.gpsCaptured')}</Text> : null}
            {extracting ? <Text style={styles.ocrStatus}>{t('driver.extractingOcr')}</Text> : null}

            <Text style={styles.label}>{t('driver.odometerReading')}</Text>
            <TextInput
              style={styles.bigInput}
              value={odometerKm}
              onChangeText={setOdometerKm}
              keyboardType="numeric"
              placeholder="125400"
            />

            {mode === 'START' ? (
              <>
                <Text style={styles.label}>{t('driver.origin')}</Text>
                <TextInput
                  style={styles.input}
                  value={origin}
                  onChangeText={setOrigin}
                  placeholder="Pune"
                />
                <Text style={styles.label}>{t('driver.destination')}</Text>
                <TextInput
                  style={styles.input}
                  value={destination}
                  onChangeText={setDestination}
                  placeholder="Ahmedabad"
                />
              </>
            ) : null}

            <BigActionButton
              label={mode === 'START' ? t('driver.startTrip') : t('driver.endTrip')}
              icon="checkmark-circle"
              color={mode === 'START' ? COLORS.startTrip : COLORS.endTrip}
              onPress={handleSave}
              loading={saving}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: COLORS.background },
  container: { padding: LAYOUT.PADDING, gap: 14 },
  notice: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.amber,
    backgroundColor: COLORS.amberBg,
    padding: 10,
    borderRadius: 10,
    textAlign: 'center',
  },
  infoText: { fontSize: 16, textAlign: 'center', color: COLORS.text },
  cameraBox: { gap: 14 },
  camera: { width: '100%', height: 340, borderRadius: LAYOUT.RADIUS, overflow: 'hidden' },
  preview: { width: '100%', height: 220, borderRadius: LAYOUT.RADIUS },
  gpsOk: { fontSize: 13, fontWeight: '700', color: COLORS.green },
  ocrStatus: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  form: { gap: 12 },
  label: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  bigInput: {
    minHeight: 62,
    borderWidth: 2,
    borderColor: COLORS.primary,
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
    fontSize: 17,
    color: COLORS.text,
  },
});
