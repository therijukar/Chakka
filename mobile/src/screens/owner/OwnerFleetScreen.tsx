import React, { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../api/client';
import { BigActionButton } from '../../components/BigActionButton';
import { IndianNumberPlate } from '../../components/IndianNumberPlate';
import { formatINR } from '../../utils/formatters';
import { COLORS, LAYOUT, SHADOWS } from '../../theme/tokens';
import type { DriverPermissions, ExpenseCategory, Vehicle } from '../../types/models';

interface DriverRow {
  id: string;
  name: string;
  phone: string;
  assignedVehicleId?: string | null;
  assignedVehicle?: Vehicle | null;
  permissions: DriverPermissions;
  advance_summary?: {
    total_given: number;
    total_returned: number;
    total_expenses: number;
    remaining_balance: number;
  };
}

const PERM_KEYS: Array<{
  uiKey: keyof DriverPermissions;
  apiKey: string;
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}> = [
  { uiKey: 'canStartEndTrip', apiKey: 'can_start_end_trip', labelKey: 'owner.permStartEndTrip', icon: 'play-circle', color: COLORS.green },
  { uiKey: 'canAddFuel', apiKey: 'can_add_fuel', labelKey: 'owner.permAddFuel', icon: 'flame', color: COLORS.fuel },
  { uiKey: 'canAddOtherExpenses', apiKey: 'can_add_other_expenses', labelKey: 'owner.permAddExpenses', icon: 'receipt', color: COLORS.expense },
  { uiKey: 'canViewOwnBataAndAdvance', apiKey: 'can_view_own_bata_and_advance', labelKey: 'owner.permBataAdvance', icon: 'wallet', color: COLORS.saffron },
  { uiKey: 'canViewTollHistory', apiKey: 'can_view_toll_history', labelKey: 'owner.permTolls', icon: 'car', color: COLORS.primary },
  { uiKey: 'canViewDocVault', apiKey: 'can_view_doc_vault', labelKey: 'owner.permDocVault', icon: 'document-text', color: COLORS.docs },
];

export const OwnerFleetScreen: React.FC = () => {
  const { t } = useTranslation();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Truck Add/Edit Modal
  const [truckModal, setTruckModal] = useState(false);
  const [editingTruckId, setEditingTruckId] = useState<string | null>(null);
  const [vNumber, setVNumber] = useState('');
  const [vModel, setVModel] = useState('');
  const [vMileage, setVMileage] = useState('4.2');
  const [savingTruck, setSavingTruck] = useState(false);

  // Driver Add/Edit Modal
  const [driverModal, setDriverModal] = useState(false);
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const [dName, setDName] = useState('');
  const [dPhone, setDPhone] = useState('');
  const [dPin, setDPin] = useState('');
  const [dVehicleId, setDVehicleId] = useState<string | null>(null);
  const [savingDriver, setSavingDriver] = useState(false);

  // Category Modal
  const [catModal, setCatModal] = useState(false);
  const [catName, setCatName] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  // Driver Advance Modal
  const [advModalDriver, setAdvModalDriver] = useState<DriverRow | null>(null);
  const [advAmount, setAdvAmount] = useState('');
  const [advType, setAdvType] = useState<'GIVEN' | 'RETURNED'>('GIVEN');
  const [advNote, setAdvNote] = useState('');
  const [savingAdv, setSavingAdv] = useState(false);

  const handleSaveAdvance = async () => {
    if (!advModalDriver) return;
    const amt = Number(advAmount);
    if (!amt || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid advance amount.');
      return;
    }
    setSavingAdv(true);
    try {
      await apiRequest(`/api/drivers/${advModalDriver.id}/advance`, {
        method: 'POST',
        body: {
          amount: amt,
          type: advType,
          note: advNote.trim() || undefined,
        },
      });
      setAdvModalDriver(null);
      setAdvAmount('');
      setAdvNote('');
      loadFleet();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update driver advance');
    } finally {
      setSavingAdv(false);
    }
  };

  const loadFleet = useCallback(async () => {
    try {
      const [vRes, dRes, cRes] = await Promise.all([
        apiRequest<{ vehicles: Vehicle[] }>('/api/vehicles'),
        apiRequest<{ drivers: DriverRow[] }>('/api/drivers'),
        apiRequest<{ categories: ExpenseCategory[] }>('/api/expense-categories'),
      ]);
      setVehicles(vRes.vehicles);
      setDrivers(dRes.drivers);
      setCategories(cRes.categories);
    } catch {
      // Offline
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFleet();
    }, [loadFleet]),
  );

  // ---- Truck CRUD ----
  const openAddTruck = () => {
    setEditingTruckId(null);
    setVNumber('');
    setVModel('');
    setVMileage('4.2');
    setTruckModal(true);
  };

  const openEditTruck = (v: Vehicle) => {
    setEditingTruckId(v.id);
    setVNumber(v.vehicleNumber);
    setVModel(v.makeModel ?? '');
    setVMileage(String(v.baselineMileageKmpl));
    setTruckModal(true);
  };

  const saveTruck = async () => {
    if (!vNumber.trim()) return Alert.alert('Vehicle Number required');
    setSavingTruck(true);
    try {
      const payload = {
        vehicle_number: vNumber.trim(),
        make_model: vModel.trim() || undefined,
        baseline_mileage_kmpl: Number(vMileage) || 4.0,
      };
      if (editingTruckId) {
        await apiRequest(`/api/vehicles/${editingTruckId}`, { method: 'PATCH', body: payload });
      } else {
        await apiRequest('/api/vehicles', { method: 'POST', body: payload });
      }
      setTruckModal(false);
      await loadFleet();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save truck');
    } finally {
      setSavingTruck(false);
    }
  };

  // ---- Driver CRUD ----
  const openAddDriver = () => {
    setEditingDriverId(null);
    setDName('');
    setDPhone('');
    setDPin('');
    setDVehicleId(vehicles[0]?.id ?? null);
    setDriverModal(true);
  };

  const openEditDriver = (d: DriverRow) => {
    setEditingDriverId(d.id);
    setDName(d.name);
    setDPhone(d.phone);
    setDPin('');
    setDVehicleId(d.assignedVehicle?.id ?? d.assignedVehicleId ?? null);
    setDriverModal(true);
  };

  const saveDriver = async () => {
    if (!dName.trim()) return Alert.alert('Driver name required');
    if (!editingDriverId && (!dPhone.trim() || dPin.length !== 4)) {
      return Alert.alert('Enter 10-digit phone and 4-digit PIN');
    }
    setSavingDriver(true);
    try {
      if (editingDriverId) {
        await apiRequest(`/api/drivers/${editingDriverId}`, {
          method: 'PATCH',
          body: {
            name: dName.trim(),
            ...(dPin.length === 4 ? { pin: dPin } : {}),
            assigned_vehicle_id: dVehicleId,
          },
        });
      } else {
        await apiRequest('/api/drivers', {
          method: 'POST',
          body: {
            name: dName.trim(),
            phone: dPhone.trim(),
            pin: dPin,
            assigned_vehicle_id: dVehicleId,
          },
        });
      }
      setDriverModal(false);
      await loadFleet();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save driver');
    } finally {
      setSavingDriver(false);
    }
  };

  const togglePermission = async (
    driverId: string,
    uiKey: keyof DriverPermissions,
    apiKey: string,
    nextVal: boolean,
  ) => {
    setDrivers((prev) =>
      prev.map((d) =>
        d.id === driverId ? { ...d, permissions: { ...d.permissions, [uiKey]: nextVal } } : d,
      ),
    );
    try {
      await apiRequest(`/api/drivers/${driverId}/permissions`, {
        method: 'PATCH',
        body: { [apiKey]: nextVal },
      });
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update permission');
      loadFleet();
    }
  };

  // ---- Categories ----
  const saveCategory = async () => {
    if (!catName.trim()) return;
    setSavingCat(true);
    try {
      await apiRequest('/api/expense-categories', {
        method: 'POST',
        body: { name: catName.trim(), icon: 'receipt', is_fuel: false },
      });
      setCatName('');
      setCatModal(false);
      await loadFleet();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to add category');
    } finally {
      setSavingCat(false);
    }
  };

  const archiveCategory = async (cat: ExpenseCategory) => {
    Alert.alert('Archive Category', `Hide "${cat.name}"?`, [
      { text: t('app.cancel'), style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          await apiRequest(`/api/expense-categories/${cat.id}`, {
            method: 'PATCH',
            body: { is_archived: true },
          });
          loadFleet();
        },
      },
    ]);
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
            await loadFleet();
            setRefreshing(false);
          }}
        />
      }
    >
      {/* TRUCKS SECTION */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {t('owner.trucks')} ({vehicles.length})
        </Text>
        <Pressable onPress={openAddTruck} style={styles.addBtn}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add Truck</Text>
        </Pressable>
      </View>

      {vehicles.map((v) => (
        <View key={v.id} style={[styles.card, SHADOWS.card]}>
          <View style={styles.truckRow}>
            <IndianNumberPlate vehicleNumber={v.vehicleNumber} />
            <Pressable onPress={() => openEditTruck(v)} style={styles.editChip}>
              <Ionicons name="create-outline" size={16} color={COLORS.primary} />
              <Text style={styles.editChipText}>Edit</Text>
            </Pressable>
          </View>
          <View style={styles.truckRow}>
            <Text style={styles.meta}>{v.makeModel ?? 'Commercial Truck'}</Text>
            <View style={styles.mileagePill}>
              <Ionicons name="speedometer-outline" size={14} color={COLORS.green} />
              <Text style={styles.mileageText}>{v.baselineMileageKmpl} km/L</Text>
            </View>
          </View>
        </View>
      ))}

      {/* DRIVERS SECTION */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {t('owner.drivers')} ({drivers.length})
        </Text>
        <Pressable onPress={openAddDriver} style={[styles.addBtn, { backgroundColor: COLORS.saffron }]}>
          <Ionicons name="person-add" size={16} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add Driver</Text>
        </Pressable>
      </View>

      {drivers.map((d) => (
        <View key={d.id} style={[styles.card, SHADOWS.card]}>
          <View style={styles.driverHead}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{d.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.driverName}>{d.name}</Text>
              <Text style={styles.meta}>{d.phone}</Text>
            </View>
            <Pressable onPress={() => openEditDriver(d)} style={styles.editChip}>
              <Ionicons name="create-outline" size={16} color={COLORS.primary} />
              <Text style={styles.editChipText}>Edit</Text>
            </Pressable>
          </View>

          {d.assignedVehicle ? (
            <IndianNumberPlate vehicleNumber={d.assignedVehicle.vehicleNumber} compact />
          ) : (
            <Text style={styles.meta}>{t('driver.noTruck')}</Text>
          )}

          {/* Separate Driver Advance Ledger */}
          <View style={styles.advBox}>
            <View style={styles.advHead}>
              <Text style={styles.advTitle}>Driver Expense Advance Ledger</Text>
              <Pressable
                onPress={() => {
                  setAdvType('GIVEN');
                  setAdvAmount('');
                  setAdvNote('');
                  setAdvModalDriver(d);
                }}
                style={styles.advBtn}
              >
                <Ionicons name="wallet" size={14} color="#FFFFFF" />
                <Text style={styles.advBtnText}>+ Give / Settle</Text>
              </Pressable>
            </View>
            <View style={styles.advGrid}>
              <View style={styles.advCol}>
                <Text style={styles.advLbl}>Given</Text>
                <Text style={styles.advVal}>{formatINR(d.advance_summary?.total_given ?? 0)}</Text>
              </View>
              <View style={styles.advCol}>
                <Text style={styles.advLbl}>Spent</Text>
                <Text style={[styles.advVal, { color: COLORS.red }]}>
                  {formatINR(d.advance_summary?.total_expenses ?? 0)}
                </Text>
              </View>
              <View style={styles.advCol}>
                <Text style={styles.advLbl}>Balance</Text>
                <Text
                  style={[
                    styles.advVal,
                    {
                      color:
                        (d.advance_summary?.remaining_balance ?? 0) >= 0
                          ? COLORS.green
                          : COLORS.red,
                    },
                  ]}
                >
                  {formatINR(d.advance_summary?.remaining_balance ?? 0)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {PERM_KEYS.map((p) => (
            <View key={p.apiKey} style={styles.permRow}>
              <View style={[styles.permIcon, { backgroundColor: `${p.color}18` }]}>
                <Ionicons name={p.icon} size={18} color={p.color} />
              </View>
              <Text style={styles.permLabel}>{t(p.labelKey)}</Text>
              <Switch
                value={Boolean(d.permissions?.[p.uiKey])}
                onValueChange={(val) => togglePermission(d.id, p.uiKey, p.apiKey, val)}
                trackColor={{ false: '#CBD5E1', true: p.color }}
                thumbColor="#FFFFFF"
              />
            </View>
          ))}
        </View>
      ))}

      {/* EXPENSE CATEGORIES SECTION */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Expense Categories ({categories.length})</Text>
        <Pressable onPress={() => setCatModal(true)} style={[styles.addBtn, { backgroundColor: COLORS.expense }]}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>
      <View style={styles.catWrap}>
        {categories.map((c) => (
          <Pressable
            key={c.id}
            onLongPress={() => !c.isFuel && archiveCategory(c)}
            style={[styles.catChip, c.isFuel && { backgroundColor: '#DBEAFE' }]}
          >
            <Text style={styles.catChipText}>{c.name}</Text>
            {!c.isFuel ? (
              <Ionicons
                name="close-circle"
                size={16}
                color={COLORS.textSecondary}
                onPress={() => archiveCategory(c)}
              />
            ) : null}
          </Pressable>
        ))}
      </View>

      {/* ADD / EDIT TRUCK MODAL */}
      <Modal visible={truckModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingTruckId ? 'Edit Truck' : 'Add New Truck'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Vehicle No (e.g. MH12AB1234)"
              autoCapitalize="characters"
              value={vNumber}
              onChangeText={setVNumber}
            />
            <TextInput
              style={styles.input}
              placeholder="Make / Model (e.g. Tata Prima 5530)"
              value={vModel}
              onChangeText={setVModel}
            />
            <TextInput
              style={styles.input}
              placeholder="Baseline Mileage (km/L)"
              keyboardType="decimal-pad"
              value={vMileage}
              onChangeText={setVMileage}
            />
            <View style={styles.modalActions}>
              <BigActionButton label={t('app.cancel')} color="#E2E8F0" textColor={COLORS.text} onPress={() => setTruckModal(false)} style={{ flex: 1 }} />
              <BigActionButton label={t('app.save')} color={COLORS.green} onPress={saveTruck} loading={savingTruck} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* ADD / EDIT DRIVER MODAL */}
      <Modal visible={driverModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingDriverId ? 'Edit Driver' : 'Add New Driver'}</Text>
            <TextInput style={styles.input} placeholder="Driver Full Name" value={dName} onChangeText={setDName} />
            {!editingDriverId ? (
              <TextInput
                style={styles.input}
                placeholder="10-Digit Mobile Number"
                keyboardType="phone-pad"
                maxLength={13}
                value={dPhone}
                onChangeText={setDPhone}
              />
            ) : null}
            <TextInput
              style={styles.input}
              placeholder={editingDriverId ? 'Reset 4-Digit PIN (optional)' : '4-Digit Login PIN'}
              keyboardType="number-pad"
              maxLength={4}
              value={dPin}
              onChangeText={(v) => setDPin(v.replace(/\D/g, '').slice(0, 4))}
            />
            <Text style={styles.pickerLabel}>Assign Truck:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <Pressable
                onPress={() => setDVehicleId(null)}
                style={[styles.selectChip, dVehicleId === null && styles.selectChipActive]}
              >
                <Text style={[styles.selectChipText, dVehicleId === null && styles.selectChipTextActive]}>
                  None
                </Text>
              </Pressable>
              {vehicles.map((v) => (
                <Pressable
                  key={v.id}
                  onPress={() => setDVehicleId(v.id)}
                  style={[styles.selectChip, dVehicleId === v.id && styles.selectChipActive]}
                >
                  <Text style={[styles.selectChipText, dVehicleId === v.id && styles.selectChipTextActive]}>
                    {v.vehicleNumber}
                  </Text>
                </Pressable>
              ))}
              {/* DRIVER ADVANCE MODAL */}
      <Modal visible={Boolean(advModalDriver)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Advance Ledger: {advModalDriver?.name}
            </Text>
            <View style={styles.typeToggleRow}>
              <Pressable
                onPress={() => setAdvType('GIVEN')}
                style={[styles.typeChip, advType === 'GIVEN' && styles.typeChipActive]}
              >
                <Text style={[styles.typeChipText, advType === 'GIVEN' && styles.typeChipTextActive]}>
                  Give Cash Advance
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setAdvType('RETURNED')}
                style={[styles.typeChip, advType === 'RETURNED' && styles.typeChipActive]}
              >
                <Text style={[styles.typeChipText, advType === 'RETURNED' && styles.typeChipTextActive]}>
                  Cash Returned
                </Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Amount (₹)"
              keyboardType="numeric"
              value={advAmount}
              onChangeText={setAdvAmount}
            />
            <TextInput
              style={styles.input}
              placeholder="Note (e.g. Fuel & food advance)"
              value={advNote}
              onChangeText={setAdvNote}
            />
            <View style={styles.modalActions}>
              <BigActionButton
                label={t('app.cancel')}
                color="#E2E8F0"
                textColor={COLORS.text}
                onPress={() => setAdvModalDriver(null)}
                style={{ flex: 1 }}
              />
              <BigActionButton
                label={t('app.save')}
                color={COLORS.green}
                onPress={handleSaveAdvance}
                loading={savingAdv}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
            <View style={styles.modalActions}>
              <BigActionButton label={t('app.cancel')} color="#E2E8F0" textColor={COLORS.text} onPress={() => setDriverModal(false)} style={{ flex: 1 }} />
              <BigActionButton label={t('app.save')} color={COLORS.green} onPress={saveDriver} loading={savingDriver} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* ADD CATEGORY MODAL */}
      <Modal visible={catModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Expense Category</Text>
            <TextInput style={styles.input} placeholder="e.g. Tyre Puncture, Weighing" value={catName} onChangeText={setCatName} />
            <View style={styles.modalActions}>
              <BigActionButton label={t('app.cancel')} color="#E2E8F0" textColor={COLORS.text} onPress={() => setCatModal(false)} style={{ flex: 1 }} />
              <BigActionButton label={t('app.save')} color={COLORS.expense} onPress={saveCategory} loading={savingCat} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
      {/* DRIVER ADVANCE MODAL */}
      <Modal visible={Boolean(advModalDriver)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Advance Ledger: {advModalDriver?.name}
            </Text>
            <View style={styles.typeToggleRow}>
              <Pressable
                onPress={() => setAdvType('GIVEN')}
                style={[styles.typeChip, advType === 'GIVEN' && styles.typeChipActive]}
              >
                <Text style={[styles.typeChipText, advType === 'GIVEN' && styles.typeChipTextActive]}>
                  Give Cash Advance
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setAdvType('RETURNED')}
                style={[styles.typeChip, advType === 'RETURNED' && styles.typeChipActive]}
              >
                <Text style={[styles.typeChipText, advType === 'RETURNED' && styles.typeChipTextActive]}>
                  Cash Returned
                </Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Amount (₹)"
              keyboardType="numeric"
              value={advAmount}
              onChangeText={setAdvAmount}
            />
            <TextInput
              style={styles.input}
              placeholder="Note (e.g. Fuel & food advance)"
              value={advNote}
              onChangeText={setAdvNote}
            />
            <View style={styles.modalActions}>
              <BigActionButton
                label={t('app.cancel')}
                color="#E2E8F0"
                textColor={COLORS.text}
                onPress={() => setAdvModalDriver(null)}
                style={{ flex: 1 }}
              />
              <BigActionButton
                label={t('app.save')}
                color={COLORS.green}
                onPress={handleSaveAdvance}
                loading={savingAdv}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: LAYOUT.PADDING, gap: 14, paddingBottom: 40 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  card: { backgroundColor: COLORS.surface, borderRadius: LAYOUT.RADIUS, padding: 16, gap: 10 },
  truckRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  editChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  editChipText: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  mileagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.greenBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  mileageText: { fontSize: 12, fontWeight: '800', color: COLORS.green },
  driverHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: COLORS.plateYellow, fontSize: 19, fontWeight: '900' },
  driverName: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  meta: { fontSize: 13, color: COLORS.textSecondary },
  advBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  advHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  advTitle: { fontSize: 12, fontWeight: '800', color: COLORS.navy },
  advBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.saffron,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  advBtnText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  advGrid: { flexDirection: 'row', gap: 8 },
  advCol: { flex: 1 },
  advLbl: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
  advVal: { fontSize: 14, fontWeight: '900', color: COLORS.text, marginTop: 1 },
  typeToggleRow: { flexDirection: 'row', gap: 8 },
  typeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  typeChipActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  typeChipText: { fontSize: 13, fontWeight: '800', color: COLORS.textSecondary },
  typeChipTextActive: { color: COLORS.plateYellow },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 2 },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  permIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  permLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text, flex: 1 },
  catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  catChipText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  input: {
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.surfaceMuted,
  },
  pickerLabel: { fontSize: 13, fontWeight: '800', color: COLORS.textSecondary },
  chipRow: { gap: 8, paddingVertical: 4 },
  selectChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  selectChipActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  selectChipText: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  selectChipTextActive: { color: COLORS.plateYellow },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
