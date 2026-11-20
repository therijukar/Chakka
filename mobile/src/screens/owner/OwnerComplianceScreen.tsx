import React, { useCallback, useState } from 'react';
import {
  Alert,
  Linking,
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
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL, apiRequest, getApiToken } from '../../api/client';
import { BigActionButton } from '../../components/BigActionButton';
import { COLORS, LAYOUT, SHADOWS } from '../../theme/tokens';
import type { ComplianceBadge, Vehicle } from '../../types/models';

interface ComplianceDoc {
  id: string;
  doc_type: string;
  title: string;
  document_number?: string | null;
  expiry_date?: string | null;
  status: ComplianceBadge;
  days_remaining: number | null;
  vehicle?: { id: string; vehicleNumber: string } | null;
  driver?: { id: string; name: string } | null;
}

const DOC_TYPES = [
  'RC_BOOK',
  'INSURANCE',
  'ROAD_TAX',
  'ALL_INDIA_PERMIT',
  'STATE_PERMIT',
  'FITNESS',
  'PUC',
  'DRIVING_LICENSE',
  'AADHAAR',
] as const;

export const OwnerComplianceScreen: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [docs, setDocs] = useState<ComplianceDoc[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Upload Document Modal state
  const [uploadModal, setUploadModal] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [docType, setDocType] = useState<string>('INSURANCE');
  const [docTitle, setDocTitle] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [pickedFile, setPickedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadCompliance = useCallback(async () => {
    try {
      const [cRes, vRes] = await Promise.all([
        apiRequest<{ documents: ComplianceDoc[] }>('/api/compliance/summary'),
        apiRequest<{ vehicles: Vehicle[] }>('/api/vehicles'),
      ]);
      setDocs(cRes.documents);
      setVehicles(vRes.vehicles);
      if (!selectedVehicleId && vRes.vehicles[0]) setSelectedVehicleId(vRes.vehicles[0].id);
    } catch {
      // Offline
    }
  }, [selectedVehicleId]);

  useFocusEffect(
    useCallback(() => {
      loadCompliance();
    }, [loadCompliance]),
  );

  const pickFile = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
    });
    if (!picked.canceled && picked.assets?.[0]) {
      setPickedFile(picked.assets[0]);
      if (!docTitle.trim()) {
        setDocTitle(picked.assets[0].name.replace(/\.[^.]+$/, ''));
      }
    }
  };

  const submitDocument = async () => {
    if (!pickedFile || !docTitle.trim()) {
      return Alert.alert('Missing details', 'Please pick a PDF/image file and enter a document title.');
    }
    setUploading(true);
    try {
      const formData = new FormData();
      if (selectedVehicleId) formData.append('vehicle_id', selectedVehicleId);
      formData.append('doc_type', docType);
      formData.append('title', docTitle.trim());
      if (docNumber.trim()) formData.append('document_number', docNumber.trim());
      if (expiryDate.trim().match(/^\d{4}-\d{2}-\d{2}$/)) {
        formData.append('expiry_date', new Date(`${expiryDate.trim()}T00:00:00Z`).toISOString());
      }
      formData.append('file', {
        uri: pickedFile.uri,
        name: pickedFile.name,
        type: pickedFile.mimeType || 'application/pdf',
      } as unknown as Blob);

      const res = await fetch(`${API_BASE_URL}/api/documents`, {
        method: 'POST',
        headers: {
          ...(getApiToken() ? { Authorization: `Bearer ${getApiToken()}` } : {}),
        },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');

      setUploadModal(false);
      setDocTitle('');
      setDocNumber('');
      setExpiryDate('');
      setPickedFile(null);
      await loadCompliance();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const deleteDocument = (doc: ComplianceDoc) => {
    Alert.alert('Delete Document', `Remove "${doc.title}"?`, [
      { text: t('app.cancel'), style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await apiRequest(`/api/documents/${doc.id}`, { method: 'DELETE' });
          loadCompliance();
        },
      },
    ]);
  };

  const shareOnWhatsApp = (doc: ComplianceDoc) => {
    const ownerLabel = doc.vehicle?.vehicleNumber ?? doc.driver?.name ?? '';
    const msg = `${doc.title} (${ownerLabel})\nDoc No: ${doc.document_number ?? '-'}\nExpiry: ${
      doc.expiry_date ? doc.expiry_date.slice(0, 10) : 'N/A'
    }`;
    const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`).catch(() => {});
    });
  };

  const getBadgeStyle = (status: ComplianceBadge) => {
    if (status === 'RED') return { bg: COLORS.redBg, fg: COLORS.red };
    if (status === 'AMBER') return { bg: COLORS.amberBg, fg: COLORS.amber };
    return { bg: COLORS.greenBg, fg: COLORS.green };
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
            await loadCompliance();
            setRefreshing(false);
          }}
        />
      }
    >
      {/* FASTag Auto-Sync Email Setup Card */}
      <View style={[styles.fastagCard, SHADOWS.card]}>
        <View style={styles.fastagHeader}>
          <Ionicons name="mail" size={22} color={COLORS.primary} />
          <Text style={styles.fastagTitle}>{t('owner.fastagSetup')}</Text>
        </View>
        <Text style={styles.fastagEmail}>
          {user?.inboundTollEmail ?? 'owner@tolls.fleetapp.in'}
        </Text>
        <Text style={styles.fastagGuide}>{t('owner.fastagGuide')}</Text>
      </View>

      <BigActionButton
        label={t('owner.uploadDoc')}
        icon="cloud-upload"
        color={COLORS.docs}
        onPress={() => setUploadModal(true)}
      />

      {docs.map((doc) => {
        const colors = getBadgeStyle(doc.status);
        return (
          <View key={doc.id} style={[styles.docCard, SHADOWS.card]}>
            <View style={styles.docTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.docTitle}>{doc.title}</Text>
                <Text style={styles.docMeta}>
                  {doc.vehicle?.vehicleNumber ?? doc.driver?.name ?? ''} •{' '}
                  {doc.doc_type.replace(/_/g, ' ')}
                </Text>
                {doc.expiry_date ? (
                  <Text style={styles.docMeta}>Exp: {doc.expiry_date.slice(0, 10)}</Text>
                ) : null}
              </View>

              <View style={[styles.badge, { backgroundColor: colors.bg }]}>
                <Text style={[styles.badgeText, { color: colors.fg }]}>
                  {doc.days_remaining !== null ? `${doc.days_remaining}d` : doc.status}
                </Text>
              </View>
            </View>

            <View style={styles.actionRow}>
              <Pressable onPress={() => shareOnWhatsApp(doc)} style={styles.waBtn}>
                <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
                <Text style={styles.waText}>{t('owner.shareWhatsApp')}</Text>
              </Pressable>
              <Pressable onPress={() => deleteDocument(doc)} style={styles.delBtn}>
                <Ionicons name="trash-outline" size={18} color={COLORS.red} />
              </Pressable>
            </View>
          </View>
        );
      })}

      {/* UPLOAD DOCUMENT MODAL */}
      <Modal visible={uploadModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('owner.uploadDoc')}</Text>

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

            <Text style={styles.pickerLabel}>Document Type:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {DOC_TYPES.map((dt) => (
                <Pressable
                  key={dt}
                  onPress={() => setDocType(dt)}
                  style={[styles.selectChip, docType === dt && styles.selectChipActive]}
                >
                  <Text style={[styles.selectChipText, docType === dt && styles.selectChipTextActive]}>
                    {dt.replace(/_/g, ' ')}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <TextInput style={styles.input} placeholder="Document Title (e.g. ICICI Insurance 2026)" value={docTitle} onChangeText={setDocTitle} />
            <TextInput style={styles.input} placeholder="Document / Policy Number (optional)" value={docNumber} onChangeText={setDocNumber} />
            <TextInput style={styles.input} placeholder="Expiry Date (YYYY-MM-DD, e.g. 2027-03-31)" value={expiryDate} onChangeText={setExpiryDate} />

            <BigActionButton
              label={pickedFile ? `Picked: ${pickedFile.name}` : 'Pick PDF or Image File'}
              icon="document-attach"
              color={COLORS.primary}
              onPress={pickFile}
            />

            <View style={styles.modalActions}>
              <BigActionButton label={t('app.cancel')} color="#E2E8F0" textColor={COLORS.text} onPress={() => setUploadModal(false)} style={{ flex: 1 }} />
              <BigActionButton label={t('app.save')} color={COLORS.green} onPress={submitDocument} loading={uploading} style={{ flex: 1 }} />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: LAYOUT.PADDING, gap: 14, paddingBottom: 32 },
  fastagCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: LAYOUT.RADIUS,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    gap: 6,
  },
  fastagHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fastagTitle: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  fastagEmail: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
    backgroundColor: COLORS.surface,
    padding: 10,
    borderRadius: 10,
  },
  fastagGuide: { fontSize: 13, color: COLORS.textSecondary },
  docCard: { backgroundColor: COLORS.surface, borderRadius: LAYOUT.RADIUS, padding: 14, gap: 10 },
  docTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  docTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  docMeta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeText: { fontSize: 13, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 10 },
  waBtn: {
    flex: 1,
    minHeight: 44,
    backgroundColor: '#16A34A',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  waText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  delBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.redBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  selectChipText: { fontSize: 12, fontWeight: '800', color: COLORS.text },
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
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
