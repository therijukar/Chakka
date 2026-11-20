import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { OwnerDashboardScreen } from '../screens/owner/OwnerDashboardScreen';
import { OwnerAccountScreen } from '../screens/owner/OwnerAccountScreen';
import { OwnerTripsScreen } from '../screens/owner/OwnerTripsScreen';
import { TripDetailScreen } from '../screens/owner/TripDetailScreen';
import { OwnerFleetScreen } from '../screens/owner/OwnerFleetScreen';
import { OwnerComplianceScreen } from '../screens/owner/OwnerComplianceScreen';
import { OwnerEmisScreen } from '../screens/owner/OwnerEmisScreen';
import { SyncBadge } from '../components/SyncBadge';
import { COLORS } from '../theme/tokens';

export type OwnerOverviewStackParamList = {
  OwnerDashboardHome: undefined;
  OwnerAccount: undefined;
};

export type OwnerTripsStackParamList = {
  OwnerTripsList: undefined;
  TripDetail: { tripId: string };
};

const OverviewStack = createNativeStackNavigator<OwnerOverviewStackParamList>();
const TripsStack = createNativeStackNavigator<OwnerTripsStackParamList>();
const Tab = createBottomTabNavigator();

const OwnerOverviewStackNavigator: React.FC = () => {
  const { t } = useTranslation();
  return (
    <OverviewStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.primary,
        headerTitleStyle: { fontWeight: '800', color: COLORS.text },
        headerRight: () => <SyncBadge />,
      }}
    >
      <OverviewStack.Screen
        name="OwnerDashboardHome"
        component={OwnerDashboardScreen}
        options={{ title: t('owner.dashboardTab') }}
      />
      <OverviewStack.Screen
        name="OwnerAccount"
        component={OwnerAccountScreen}
        options={{ title: 'Account & Plan' }}
      />
    </OverviewStack.Navigator>
  );
};

const OwnerTripsStackNavigator: React.FC = () => {
  const { t } = useTranslation();
  return (
    <TripsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.primary,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <TripsStack.Screen
        name="OwnerTripsList"
        component={OwnerTripsScreen}
        options={{ title: t('owner.tripsTab') }}
      />
      <TripsStack.Screen
        name="TripDetail"
        component={TripDetailScreen}
        options={{ title: t('owner.tripNetProfit') }}
      />
    </TripsStack.Navigator>
  );
};

export const OwnerNavigator: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: COLORS.surface },
        headerTitleStyle: { fontWeight: '800', color: COLORS.text },
        headerRight: () => <SyncBadge />,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 6 },
        tabBarIcon: ({ color, size }) => {
          const map: Record<string, keyof typeof Ionicons.glyphMap> = {
            Overview: 'stats-chart',
            Trips: 'map',
            Fleet: 'bus',
            Compliance: 'shield-checkmark',
            EMIs: 'card',
            Account: 'person-circle',
          };
          return <Ionicons name={map[route.name] ?? 'ellipse'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Overview"
        component={OwnerOverviewStackNavigator}
        options={{ title: t('owner.dashboardTab'), headerShown: false }}
      />
      <Tab.Screen
        name="Trips"
        component={OwnerTripsStackNavigator}
        options={{ title: t('owner.tripsTab'), headerShown: false }}
      />
      <Tab.Screen
        name="Fleet"
        component={OwnerFleetScreen}
        options={{ title: t('owner.fleetTab') }}
      />
      <Tab.Screen
        name="Compliance"
        component={OwnerComplianceScreen}
        options={{ title: t('owner.complianceTab') }}
      />
      <Tab.Screen
        name="EMIs"
        component={OwnerEmisScreen}
        options={{ title: t('owner.emisTab') }}
      />
      <Tab.Screen
        name="Account"
        component={OwnerAccountScreen}
        options={{ title: 'My Account' }}
      />
    </Tab.Navigator>
  );
};
