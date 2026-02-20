import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider as PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View } from 'react-native';

// Auth Screens
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';

// Main App Screens
import HomeScreen from './src/screens/HomeScreen';
import NewEncounterScreen from './src/screens/NewEncounterScreen';
import SymptomsScreen from './src/screens/SymptomsScreen';
import FollowupScreen from './src/screens/FollowupScreen';
import TriageResultScreen from './src/screens/TriageResultScreen';
import ReferralScreen from './src/screens/ReferralScreen';
import OfflineQueueScreen from './src/screens/OfflineQueueScreen';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
};

export type RootStackParamList = {
  Home: undefined;
  NewEncounter: undefined;
  Symptoms: { encounterId: string };
  Followup: { encounterId: string; questions: string[] };
  TriageResult: { encounterId: string };
  Referral: { encounterId: string };
  OfflineQueue: undefined;
};

const AuthStack = createStackNavigator<AuthStackParamList>();
const MainStack = createStackNavigator<RootStackParamList>();

function AuthNavigator({ onLogin }: { onLogin: () => void }) {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#2196F3' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <AuthStack.Screen 
        name="Login" 
        options={{ title: 'Sign In', headerShown: false }}
      >
        {(props) => <LoginScreen {...props} onLogin={onLogin} />}
      </AuthStack.Screen>
      <AuthStack.Screen 
        name="Signup" 
        options={{ title: 'Create Account' }}
      >
        {(props) => <SignupScreen {...props} onLogin={onLogin} />}
      </AuthStack.Screen>
      <AuthStack.Screen 
        name="ForgotPassword" 
        component={ForgotPasswordScreen}
        options={{ title: 'Reset Password' }}
      />
    </AuthStack.Navigator>
  );
}

function MainNavigator() {
  return (
    <MainStack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerStyle: { backgroundColor: '#2196F3' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <MainStack.Screen 
        name="Home" 
        component={HomeScreen}
        options={{ title: 'FirstLine Triage' }}
      />
      <MainStack.Screen 
        name="NewEncounter" 
        component={NewEncounterScreen}
        options={{ title: 'New Patient' }}
      />
      <MainStack.Screen 
        name="Symptoms" 
        component={SymptomsScreen}
        options={{ title: 'Add Symptoms' }}
      />
      <MainStack.Screen 
        name="Followup" 
        component={FollowupScreen}
        options={{ title: 'Follow-up Questions' }}
      />
      <MainStack.Screen 
        name="TriageResult" 
        component={TriageResultScreen}
        options={{ title: 'Triage Assessment' }}
      />
      <MainStack.Screen 
        name="Referral" 
        component={ReferralScreen}
        options={{ title: 'Referral' }}
      />
      <MainStack.Screen 
        name="OfflineQueue" 
        component={OfflineQueueScreen}
        options={{ title: 'Offline Queue' }}
      />
    </MainStack.Navigator>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      setIsAuthenticated(!!token);
    } catch (error) {
      console.error('Error checking auth status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('authToken');
    await AsyncStorage.removeItem('userInfo');
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <PaperProvider>
      <NavigationContainer>
        <StatusBar style="auto" />
        {isAuthenticated ? (
          <MainNavigator />
        ) : (
          <AuthNavigator onLogin={handleLogin} />
        )}
      </NavigationContainer>
    </PaperProvider>
  );
}
