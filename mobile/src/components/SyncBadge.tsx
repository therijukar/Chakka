import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { syncEngine, type SyncStateSnapshot } from '../sync/syncEngine';
import { COLORS, SHADOWS } from '../theme/tokens';

interface SyncBadgeProps {
  onPress?: () => void;
}

export const SyncBadge: React.FC<SyncBadgeProps> = ({ onPress }) => {
  const { t } = useTranslation();
  const pulse = useRef(new Animated.Value(1)).current;
  const [syncState, setSyncState] = useState<SyncStateSnapshot>({
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
  });

  useEffect(() => syncEngine.subscribe(setSyncState), []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const hasIssues = syncState.failedCount > 0;
  const hasPending = syncState.pendingCount > 0 || !syncState.isOnline;

  let bg = COLORS.greenBg;
  let fg = COLORS.green;
  let icon: keyof typeof Ionicons.glyphMap = 'cloud-done';
  let label = t('sync.synced');

  if (syncState.isSyncing) {
    bg = COLORS.amberBg;
    fg = COLORS.amber;
    icon = 'sync';
    label = t('sync.syncing');
  } else if (hasIssues) {
    bg = COLORS.redBg;
    fg = COLORS.red;
    icon = 'warning';
    label = t('sync.failed', { count: syncState.failedCount });
  } else if (hasPending) {
    bg = COLORS.amberBg;
    fg = COLORS.amber;
    icon = 'cloud-offline';
    label = t('sync.offlinePending', { count: syncState.pendingCount });
  }

  return (
    <Pressable
      onPress={onPress ?? (() => syncEngine.runSync())}
      style={[styles.pill, SHADOWS.pill, { backgroundColor: bg }]}
    >
      <Animated.View style={[styles.dot, { backgroundColor: fg, opacity: pulse }]} />
      <Ionicons name={icon} size={14} color={fg} />
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '800',
  },
});
