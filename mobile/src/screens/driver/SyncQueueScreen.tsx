import React, { useCallback, useState } from 'react';
import { FlatList, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getAllSyncItems } from '../../db/database';
import { syncEngine } from '../../sync/syncEngine';
import { BigActionButton } from '../../components/BigActionButton';
import { COLORS, LAYOUT } from '../../theme/tokens';
import type { SyncQueueItem } from '../../types/models';

export const SyncQueueScreen: React.FC = () => {
  const { t } = useTranslation();
  const [items, setItems] = useState<SyncQueueItem[]>([]);
  const [syncing, setSyncing] = useState(false);

  const loadQueue = useCallback(async () => {
    const rows = await getAllSyncItems();
    setItems(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadQueue();
    }, [loadQueue]),
  );

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await syncEngine.runSync();
      await loadQueue();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <BigActionButton
          label={t('sync.syncNow')}
          icon="sync"
          color={COLORS.primary}
          onPress={handleSyncNow}
          loading={syncing}
        />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>{t('sync.empty')}</Text>}
        renderItem={({ item }) => {
          const badgeColor =
            item.status === 'SYNCED'
              ? COLORS.green
              : item.status === 'FAILED'
                ? COLORS.red
                : COLORS.amber;
          return (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.type}>{item.entity_type}</Text>
                <Text style={[styles.status, { color: badgeColor }]}>{item.status}</Text>
              </View>
              <Text style={styles.meta}>ID: {item.client_id.slice(0, 8)}…</Text>
              <Text style={styles.meta}>{item.created_at.slice(0, 19).replace('T', ' ')}</Text>
              {item.last_error ? <Text style={styles.err}>{item.last_error}</Text> : null}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: LAYOUT.PADDING },
  list: { paddingHorizontal: LAYOUT.PADDING, paddingBottom: 24, gap: 10 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 16, color: COLORS.textSecondary },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  status: { fontSize: 13, fontWeight: '800' },
  meta: { fontSize: 12, color: COLORS.textSecondary },
  err: { fontSize: 12, color: COLORS.red, marginTop: 4 },
});
