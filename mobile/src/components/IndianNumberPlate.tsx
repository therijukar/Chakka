import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../theme/tokens';

interface Props {
  vehicleNumber: string;
  compact?: boolean;
}

function formatIndianPlate(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = clean.match(/^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{3,4})$/);
  if (m) return `${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  return clean;
}

/**
 * Authentic Indian commercial yellow number plate badge ("IND | MH 12 AB 1234").
 */
export const IndianNumberPlate: React.FC<Props> = ({ vehicleNumber, compact = false }) => {
  return (
    <View style={[styles.plate, compact && styles.plateCompact]}>
      <View style={[styles.indStrip, compact && styles.indStripCompact]}>
        <Text style={[styles.indText, compact && styles.indTextCompact]}>IND</Text>
      </View>
      <Text style={[styles.plateText, compact && styles.plateTextCompact]}>
        {formatIndianPlate(vehicleNumber)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.plateYellow,
    borderWidth: 2,
    borderColor: COLORS.plateBorder,
    borderRadius: 8,
    overflow: 'hidden',
  },
  plateCompact: {
    borderWidth: 1.5,
    borderRadius: 6,
  },
  indStrip: {
    backgroundColor: COLORS.plateIndBlue,
    paddingHorizontal: 6,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indStripCompact: {
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  indText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  indTextCompact: {
    fontSize: 7,
  },
  plateText: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 1.2,
  },
  plateTextCompact: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontSize: 13,
    letterSpacing: 0.8,
  },
});
