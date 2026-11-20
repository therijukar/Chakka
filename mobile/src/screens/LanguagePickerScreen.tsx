import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n';
import { useAuth } from '../context/AuthContext';
import { COLORS, LAYOUT, SHADOWS } from '../theme/tokens';

const SCRIPT_EMBLEM: Record<SupportedLanguage, { glyph: string; color: string; bg: string }> = {
  hi: { glyph: 'हि', color: '#EA580C', bg: '#FFEDD5' },
  en: { glyph: 'Aa', color: '#1D4ED8', bg: '#DBEAFE' },
  bn: { glyph: 'বা', color: '#059669', bg: '#D1FAE5' },
  mr: { glyph: 'म', color: '#7C3AED', bg: '#EDE9FE' },
  ta: { glyph: 'த', color: '#0D9488', bg: '#CCFBF1' },
};

const LanguageCard: React.FC<{
  code: SupportedLanguage;
  nativeName: string;
  englishName: string;
  active: boolean;
  onPress: () => void;
}> = ({ code, nativeName, englishName, active, onPress }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const emblem = SCRIPT_EMBLEM[code];

  const bounce = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 35 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => bounce(0.97)}
        onPressOut={() => bounce(1)}
        style={[styles.card, SHADOWS.card, active && styles.cardActive]}
      >
        <View style={[styles.emblemCircle, { backgroundColor: emblem.bg }]}>
          <Text style={[styles.emblemText, { color: emblem.color }]}>{emblem.glyph}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.nativeName, active && styles.nativeNameActive]}>{nativeName}</Text>
          <Text style={styles.englishName}>{englishName}</Text>
        </View>
        <View style={[styles.checkCircle, active && styles.checkCircleActive]}>
          <Ionicons
            name={active ? 'checkmark' : 'chevron-forward'}
            size={18}
            color={active ? '#FFFFFF' : COLORS.textSecondary}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
};

export const LanguagePickerScreen: React.FC<{ onDone?: () => void }> = ({ onDone }) => {
  const { t } = useTranslation();
  const { language, setLanguage } = useAuth();

  const handleSelect = async (code: SupportedLanguage) => {
    await setLanguage(code);
    onDone?.();
  };

  return (
    <View style={styles.root}>
      <View style={styles.heroBanner}>
        <SafeAreaView>
          <View style={styles.heroInner}>
            <View style={styles.heroIcon}>
              <Ionicons name="language" size={34} color={COLORS.plateYellow} />
            </View>
            <Text style={styles.title}>{t('language.title')}</Text>
            <Text style={styles.subtitle}>{t('language.subtitle')}</Text>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <LanguageCard
            key={lang.code}
            code={lang.code}
            nativeName={lang.nativeName}
            englishName={lang.englishName}
            active={language === lang.code}
            onPress={() => handleSelect(lang.code)}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  heroBanner: {
    backgroundColor: COLORS.navy,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingBottom: 28,
    paddingTop: 12,
    ...SHADOWS.hero,
  },
  heroInner: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 18, gap: 8 },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 25, fontWeight: '900', color: '#FFFFFF', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#CBD5E1', textAlign: 'center' },
  list: { padding: 20, gap: 14 },
  card: {
    minHeight: 76,
    backgroundColor: COLORS.surface,
    borderRadius: LAYOUT.RADIUS,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cardActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#EFF6FF',
  },
  emblemCircle: {
    width: 50,
    height: 50,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblemText: { fontSize: 22, fontWeight: '900' },
  nativeName: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  nativeNameActive: { color: COLORS.primary },
  englishName: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginTop: 1 },
  checkCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleActive: {
    backgroundColor: COLORS.primary,
  },
});
