import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getCachedDocuments } from '../../db/database';
import { syncOfflineDocVault } from '../../sync/docVaultCache';
import { BigActionButton } from '../../components/BigActionButton';
import { COLORS, LAYOUT } from '../../theme/tokens';
import type { CachedDocument } from '../../types/models';

export const DriverDocVaultScreen: React.FC = () => {
  const { t } = useTranslation();
  const [docs, setDocs] = useState<CachedDocument[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadDocs = useCallback(async () => {
    const cached = await getCachedDocuments();
    setDocs(cached);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDocs();
      syncOfflineDocVault()
        .then(loadDocs)
        .catch(() => {});
    }, [loadDocs]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await syncOfflineDocVault().catch(() => {});
      await loadDocs();
    } finally {
      setRefreshing(false);
    }
  };

  const openDocument = async (doc: CachedDocument) => {
    if (!doc.local_uri) {
      Alert.alert(doc.title, t('app.offlineNotice'));
      return;
    }
    const available = await Sharing.isAvailableAsync();
    if (available) {
      await Sharing.shareAsync(doc.local_uri, {
        mimeType: doc.mime_type,
        dialogTitle: doc.title,
      });
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.banner}>
        <Ionicons name="shield-checkmark" size={20} color={COLORS.green} />
        <Text style={styles.bannerText}>{t('driver.docsOfflineReady')}</Text>
      </View>

      <FlatList
        data={docs}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text" size={26} color={COLORS.docs} />
              <View style={{ flex: 1 }}>
                <Text style={styles.docTitle}>{item.title}</Text>
                <Text style={styles.docMeta}>
                  {item.doc_type.replace(/_/g, ' ')}
                  {item.document_number ? ` • ${item.document_number}` : ''}
                </Text>
                {item.expiry_date ? (
                  <Text style={styles.docMeta}>
                    Exp: {item.expiry_date.slice(0, 10)}
                  </Text>
                ) : null}
              </View>
            </View>

            <BigActionButton
              label={t('driver.openDoc')}
              icon="open-outline"
              color={item.local_uri ? COLORS.docs : '#6B7280'}
              onPress={() => openDocument(item)}
            />
          </View>
        )}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.greenBg,
    paddingVertical: 10,
  },
  bannerText: { fontSize: 14, fontWeight: '700', color: COLORS.green },
  list: { padding: LAYOUT.PADDING, gap: 14 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: LAYOUT.RADIUS,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  docTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  docMeta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
});
