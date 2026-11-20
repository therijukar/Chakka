import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { LanguagePickerScreen } from '../screens/LanguagePickerScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { OwnerSignupScreen } from '../screens/OwnerSignupScreen';
import { DriverNavigator } from './DriverNavigator';
import { OwnerNavigator } from './OwnerNavigator';
import { COLORS } from '../theme/tokens';

export const RootNavigator: React.FC = () => {
  const { user, languageSelected, loading } = useAuth();
  const [pickingLanguage, setPickingLanguage] = useState(false);
  const [signingUp, setSigningUp] = useState(false);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!languageSelected || pickingLanguage) {
    return <LanguagePickerScreen onDone={() => setPickingLanguage(false)} />;
  }

  if (!user) {
    if (signingUp) {
      return <OwnerSignupScreen onBackToLogin={() => setSigningUp(false)} />;
    }
    return (
      <LoginScreen
        onOpenLanguagePicker={() => setPickingLanguage(true)}
        onOpenSignup={() => setSigningUp(true)}
      />
    );
  }

  return (
    <NavigationContainer>
      {user.role === 'DRIVER' ? <DriverNavigator /> : <OwnerNavigator />}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
});
