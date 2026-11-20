import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { DriverHomeScreen } from '../screens/driver/DriverHomeScreen';
import { TripOdometerScreen } from '../screens/driver/TripOdometerScreen';
import { FuelExpenseScreen } from '../screens/driver/FuelExpenseScreen';
import { OtherExpenseScreen } from '../screens/driver/OtherExpenseScreen';
import { DriverDocVaultScreen } from '../screens/driver/DriverDocVaultScreen';
import { SyncQueueScreen } from '../screens/driver/SyncQueueScreen';
import { SyncBadge } from '../components/SyncBadge';
import { COLORS } from '../theme/tokens';

export type DriverStackParamList = {
  DriverHome: undefined;
  TripOdometer: { mode: 'START' | 'END'; tripClientId?: string };
  FuelExpense: { tripClientId?: string; tripServerId?: string };
  OtherExpense: { tripClientId?: string; tripServerId?: string };
  DriverDocVault: undefined;
  SyncQueue: undefined;
};

const Stack = createNativeStackNavigator<DriverStackParamList>();

export const DriverNavigator: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Stack.Navigator
      screenOptions={({ navigation }) => ({
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.primary,
        headerTitleStyle: { fontWeight: '800' },
        headerRight: () => (
          <SyncBadge onPress={() => navigation.navigate('SyncQueue')} />
        ),
      })}
    >
      <Stack.Screen
        name="DriverHome"
        component={DriverHomeScreen}
        options={{ title: t('driver.homeTitle') }}
      />
      <Stack.Screen
        name="TripOdometer"
        component={TripOdometerScreen}
        options={{ title: t('driver.odometerTitle') }}
      />
      <Stack.Screen
        name="FuelExpense"
        component={FuelExpenseScreen}
        options={{ title: t('driver.fuelTitle') }}
      />
      <Stack.Screen
        name="OtherExpense"
        component={OtherExpenseScreen}
        options={{ title: t('driver.expenseTitle') }}
      />
      <Stack.Screen
        name="DriverDocVault"
        component={DriverDocVaultScreen}
        options={{ title: t('driver.docsTitle') }}
      />
      <Stack.Screen
        name="SyncQueue"
        component={SyncQueueScreen}
        options={{ title: t('sync.queueTitle') }}
      />
    </Stack.Navigator>
  );
};
