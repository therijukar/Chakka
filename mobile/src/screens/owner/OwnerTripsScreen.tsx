import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
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
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../api/client';
import { compressImageToMax250KB } from '../../sync/imageCompressor';
import { recognizeSpeech } from '../../utils/voiceInput';
import { formatINR, generateClientId } from '../../utils/formatters';
import { BigActionButton } from '../../components/BigActionButton';
import { IndianNumberPlate } from '../../components/IndianNumberPlate';
import { COLORS, LAYOUT, SHADOWS } from '../../theme/tokens';
import type { OwnerTripsStackParamList } from '../../navigation/OwnerNavigator';

interface TripItem {
  id: string;
  origin: string;
  destination: string;
  partyName?: string | null;
  agreedFreight: string | number;
  advanceReceived: string | number;
  balancePending: string | number;
  status: string;
  vehicle: { id: string; vehicleNumber: string };
  driver: { id: string; name: string };
}

interface Props {
  navigation: NativeStackNavigationProp<OwnerTripsStackParamList, 'OwnerTripsList'>;
}

export const OwnerTripsScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [vehicles, setVehicles] = useState<Array<{ id: string; vehicleNumber: string }>>([]);
  const [drivers, setDrivers] = useState<Array<{ id: string; name: string }>>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [partyName, setPartyName] = useState('');
  const [freight, setFreight] = useState('');
  const [advance, setAdvance] = useState('');
  const [driverAdvance, setDriverAdvance] = useState('');
  const [driverBata, setDriverBata] = useState('');
  const [startOdometerKm, setStartOdometerKm] = useState('');
  const [odoPhotoUri, setOdoPhotoUri] = useState<string | null>(null);
  const [startCoords, setStartCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [extractingOdo, setExtractingOdo] = useState(false);
  const [creating, setCreating] = useState(false);
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const loadTrips = useCallback(async () => {
    try {
      const [tRes, vRes, dRes] = await Promise.all([
        apiRequest<{ trips: TripItem[] }>('/api/trips'),
        apiRequest<{ vehicles: Array<{ id: string; vehicleNumber: string }> }>('/api/vehicles'),
        apiRequest<{ drivers: Array<{ id: string; name: string }> }>('/api/drivers'),
      ]);
      setTrips(tRes.trips);
      setVehicles(vRes.vehicles);
      setDrivers(dRes.drivers);
      if (!selectedVehicleId && vRes.vehicles[0]) setSelectedVehicleId(vRes.vehicles[0].id);
      if (!selectedDriverId && dRes.drivers[0]) setSelectedDriverId(dRes.drivers[0].id);
    } catch {
      // Offline
    }
  }, [selectedVehicleId, selectedDriverId]);

  useFocusEffect(
    useCallback(() => {
      loadTrips();
    }, [loadTrips]),
  );

  const handleOpenOdometerCamera = async () => {
    if (!camPerm?.granted) {
      const res = await requestCamPerm();
      if (!res.granted) {
        Alert.alert('Camera Permission', 'Camera access is needed to capture the odometer photo.');
        return;
      }
    }
    setCameraOpen(true);
  };

  const handleCaptureOdometer = async () => {
    if (!cameraRef.current) return;
    const raw = await cameraRef.current.takePictureAsync({ quality: 0.7 });
    if (!raw?.uri) return;
    setCameraOpen(false);

    const compressed = await compressImageToMax250KB(raw.uri);
    setOdoPhotoUri(compressed.uri);

    // Auto-capture GPS & reverse-geocode From City
    try {
      const locPerm = await Location.requestForegroundPermissionsAsync();
      if (locPerm.status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setStartCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
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
    } catch {
      // Ignore GPS failure
    }

    // Auto-extract Odometer Reading via OCR
    setExtractingOdo(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(compressed.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const ocr = await apiRequest<{ odometer_km: number }>('/api/ocr/odometer', {
        method: 'POST',
        body: { image_base64: base64, mime_type: 'image/jpeg' },
      });
      if (ocr.odometer_km) {
        setStartOdometerKm(String(ocr.odometer_km));
      }
    } catch {
      // Owner can enter manually if OCR fails
    } finally {
      setExtractingOdo(false);
    }
  };

  const handleVoiceParty = async () => {
    try {
      const spoken = await recognizeSpeech('Speak Consignor / Party Name');
      if (spoken) {
        setPartyName(spoken);
      }
    } catch (err) {
      Alert.alert('Voice Input', err instanceof Error ? err.message : 'Unable to start voice input');
    }
  };

  const handleCreateTrip = async () => {
    const vehicleId = selectedVehicleId || vehicles[0]?.id;
    const driverId = selectedDriverId || drivers[0]?.id;
    if (!origin.trim() || !destination.trim() || !vehicleId) {
      Alert.alert(t('owner.createTrip'), 'Select a truck and enter origin & destination.');
      return;
    }
    setCreating(true);
    try {
      const odoNum = startOdometerKm ? Number(startOdometerKm) : undefined;
      await apiRequest('/api/trips', {
        method: 'POST',
        body: {
          client_id: generateClientId(),
          vehicle_id: vehicleId,
          driver_id: driverId,
          origin: origin.trim(),
          destination: destination.trim(),
          party_name: partyName.trim() || undefined,
          agreed_freight: Number(freight) || 0,
          advance_received: Number(advance) || 0,
          driver_advance: Number(driverAdvance) || 0,
          driver_bata: Number(driverBata) || 0,
          ...(odoNum !== undefined && !Number.isNaN(odoNum)
            ? {
                start_odometer_km: odoNum,
                status: 'ACTIVE',
                started_at: new Date().toISOString(),
              }
            : {}),
          ...(startCoords ? { start_lat: startCoords.lat, start_lng: startCoords.lng } : {}),
        },
      });
      setModalOpen(false);
      setOrigin('');
      setDestination('');
      setPartyName('');
      setFreight('');
      setAdvance('');
      setDriverAdvance('');
      setDriverBata('');
      setStartOdometerKm('');
      setOdoPhotoUri(null);
      setStartCoords(null);
      loadTrips();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create trip');
    } finally {
      setCreating(false);
    }
  };

  const pendingFreightCalc = Math.max(0, (Number(freight) || 0) - (Number(advance) || 0));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <BigActionButton
          label={t('owner.createTrip')}
          icon="add-circle"
          color={COLORS.saffron}
          onPress={() => setModalOpen(true)}
        />
      </View>

      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isActive = item.status === 'ACTIVE';
          return (
            <Pressable
              onPress={() => navigation.navigate('TripDetail', { tripId: item.id })}
              style={[styles.card, SHADOWS.card]}
            >
              <View style={styles.row}>
                <IndianNumberPlate vehicleNumber={item.vehicle.vehicleNumber} compact />
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: isActive ? COLORS.greenBg : '#E2E8F0' },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: isActive ? COLORS.green : COLORS.textSecondary },
                    ]}
                  >
                    {item.status}
                  </Text>
                </View>
              </View>

              <View style={styles.routeRow}>
                <Text style={styles.city} numberOfLines={1}>
                  {item.origin}
                </Text>
                <Ionicons name="arrow-forward" size={18} color={COLORS.saffron} />
                <Text style={styles.city} numberOfLines={1}>
                  {item.destination}
                </Text>
              </View>

              <Text style={styles.meta}>
                {item.driver.name}
                {item.partyName ? ` • ${item.partyName}` : ''}
              </Text>

              <View style={styles.moneyStrip}>
                <View>
                  <Text style={styles.moneyLabel}>{t('owner.agreedFreight')}</Text>
                  <Text style={styles.moneyText}>{formatINR(item.agreedFreight)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.moneyLabel}>{t('owner.balance')}</Text>
                  <Text style={styles.balanceText}>{formatINR(item.balancePending)}</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />

      <Modal visible={modalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('owner.createTrip')}</Text>

            <Text style={styles.pickerLabel}>Select Truck:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {vehicles.map((v) => (
                <Pressable
                  key={v.id}
                  onPress={() => setSelectedVehicleId(v.id)}
                  style={[styles.selectChip, selectedVehicleId === v.id && styles.selectChipActive]}
                >
                  <Text style={[styles.selectChipText, selectedVehicleId === v.id && styles.selectChipTextActive]}>
                    {v.vehicleNumber}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.pickerLabel}>Select Driver:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {drivers.map((d) => (
                <Pressable
                  key={d.id}
                  onPress={() => setSelectedDriverId(d.id)}
                  style={[styles.selectChip, selectedDriverId === d.id && styles.selectChipActive]}
                >
                  <Text style={[styles.selectChipText, selectedDriverId === d.id && styles.selectChipTextActive]}>
                    {d.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Odometer Photo + Auto-Location */}
            <Pressable onPress={handleOpenOdometerCamera} style={styles.odoBtn}>
              <Ionicons name="camera" size={20} color={COLORS.primary} />
              <Text style={styles.odoBtnText}>
                {odoPhotoUri
                  ? 'Retake Start Odometer Photo'
                  : 'Take Odometer Photo (Auto-City & Reading)'}
              </Text>
            </Pressable>
            {odoPhotoUri ? (
              <View style={styles.odoPreviewRow}>
                <Image source={{ uri: odoPhotoUri }} style={styles.odoThumb} />
                <View style={{ flex: 1, gap: 4 }}>
                  {extractingOdo ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <ActivityIndicator size="small" color={COLORS.primary} />
                      <Text style={styles.gpsOk}>Reading odometer...</Text>
                    </View>
                  ) : null}
                  {startCoords ? (
                    <Text style={styles.gpsOk}>
                      GPS Captured ({startCoords.lat.toFixed(4)}, {startCoords.lng.toFixed(4)})
                    </Text>
                  ) : null}
                  <TextInput
                    style={styles.input}
                    placeholder="Start Odometer (km)"
                    keyboardType="numeric"
                    value={startOdometerKm}
                    onChangeText={setStartOdometerKm}
                  />
                </View>
              </View>
            ) : null}

            <TextInput style={styles.input} placeholder={t('driver.origin')} value={origin} onChangeText={setOrigin} />
            <TextInput style={styles.input} placeholder={t('driver.destination')} value={destination} onChangeText={setDestination} />

            {/* Party / Consignor Name with Voice-to-Text */}
            <View style={styles.voiceRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Party / Consignor Name"
                value={partyName}
                onChangeText={setPartyName}
              />
              <Pressable onPress={handleVoiceParty} style={styles.micBtn}>
                <Ionicons name="mic" size={22} color="#FFFFFF" />
              </Pressable>
            </View>

            <View style={styles.twoCol}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={`${t('owner.agreedFreight')} (₹)`}
                keyboardType="numeric"
                value={freight}
                onChangeText={setFreight}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={`${t('owner.advance')} (₹)`}
                keyboardType="numeric"
                value={advance}
                onChangeText={setAdvance}
              />
            </View>

            <View style={styles.pendingStrip}>
              <Text style={styles.pendingLabel}>Auto-Calculated Pending / Due Freight</Text>
              <Text style={styles.pendingVal}>{formatINR(pendingFreightCalc)}</Text>
            </View>

            <View style={styles.twoCol}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Driver Advance (Expenses ₹)"
                keyboardType="numeric"
                value={driverAdvance}
                onChangeText={setDriverAdvance}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Driver Bata (₹)"
                keyboardType="numeric"
                value={driverBata}
                onChangeText={setDriverBata}
              />
            </View>

            <View style={styles.modalActions}>
              <BigActionButton
                label={t('app.cancel')}
                color="#E2E8F0"
                textColor={COLORS.text}
                onPress={() => setModalOpen(false)}
                style={{ flex: 1 }}
              />
              <BigActionButton
                label={t('app.save')}
                color={COLORS.green}
                onPress={handleCreateTrip}
                loading={creating}
                style={{ flex: 1 }}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
      {/* Live Odometer Camera Modal */}
      <Modal visible={cameraOpen} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
          <View style={styles.camFooter}>
            <BigActionButton
              label={t('app.cancel')}
              color="#334155"
              onPress={() => setCameraOpen(false)}
              style={{ flex: 1 }}
            />
            <BigActionButton
              label="Capture Odometer"
              icon="camera"
              color={COLORS.saffron}
              onPress={handleCaptureOdometer}
              style={{ flex: 1 }}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: LAYOUT.PADDING },
  list: { paddingHorizontal: LAYOUT.PADDING, paddingBottom: 24, gap: 14 },
  card: { backgroundColor: COLORS.surface, borderRadius: LAYOUT.RADIUS, padding: 16, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '900' },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  city: { fontSize: 18, fontWeight: '900', color: COLORS.text, flexShrink: 1 },
  meta: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  moneyStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 12,
    padding: 10,
  },
  moneyLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  moneyText: { fontSize: 16, fontWeight: '900', color: COLORS.navy },
  balanceText: { fontSize: 16, fontWeight: '900', color: COLORS.saffron },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalScroll: { maxHeight: '88%' },
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
  odoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
  },
  odoBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  odoPreviewRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  odoThumb: { width: 72, height: 72, borderRadius: 10 },
  gpsOk: { fontSize: 11, fontWeight: '700', color: COLORS.green },
  voiceRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  micBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.saffron,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  pendingLabel: { fontSize: 12, fontWeight: '800', color: '#92400E' },
  pendingVal: { fontSize: 16, fontWeight: '900', color: '#B45309' },
  camFooter: { flexDirection: 'row', gap: 12, padding: 16, backgroundColor: '#000' },
});
