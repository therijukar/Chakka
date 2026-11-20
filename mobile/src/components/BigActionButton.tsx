import React, { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, LAYOUT, SHADOWS } from '../theme/tokens';

interface BigActionButtonProps {
  label: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  color?: string;
  textColor?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export const BigActionButton: React.FC<BigActionButtonProps> = ({
  label,
  subtitle,
  icon,
  color = COLORS.primary,
  textColor = '#FFFFFF',
  onPress,
  disabled = false,
  loading = false,
  style,
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (val: number) => {
    Animated.spring(scale, {
      toValue: val,
      useNativeDriver: true,
      speed: 35,
      bounciness: 6,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animateTo(0.96)}
        onPressOut={() => animateTo(1)}
        disabled={disabled || loading}
        style={[
          styles.button,
          SHADOWS.card,
          { backgroundColor: color, opacity: disabled ? 0.5 : 1 },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={textColor} />
        ) : (
          <View style={styles.inner}>
            {icon ? (
              <View style={styles.iconBadge}>
                <Ionicons name={icon} size={24} color={textColor} />
              </View>
            ) : null}
            <View style={{ flexShrink: 1 }}>
              <Text style={[styles.label, { color: textColor }]} numberOfLines={1}>
                {label}
              </Text>
              {subtitle ? (
                <Text style={[styles.subtitle, { color: textColor }]} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  button: {
    minHeight: LAYOUT.MIN_TOUCH_TARGET,
    borderRadius: LAYOUT.RADIUS,
    paddingHorizontal: 18,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.85,
    marginTop: 1,
  },
});
