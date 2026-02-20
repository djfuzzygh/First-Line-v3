import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import { TextInput, Button, Card, Title, Paragraph, HelperText } from 'react-native-paper';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthStackParamList } from '../../App';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

type LoginScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Login'>;

interface Props {
  navigation: LoginScreenNavigationProp;
  onLogin: () => void;
}

export default function LoginScreen({ navigation, onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;

    setLoading(true);

    try {
      // TODO: Replace with actual API endpoint
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.firstline.health/v1';
      
      const response = await axios.post(`${API_URL}/auth/login`, {
        email: email.toLowerCase().trim(),
        password,
      });

      const { token, user } = response.data;

      // Store auth token and user info
      await AsyncStorage.setItem('authToken', token);
      await AsyncStorage.setItem('userInfo', JSON.stringify(user));

      Alert.alert('Success', 'Login successful!');
      onLogin();
    } catch (error: any) {
      if (error.response?.status === 401) {
        Alert.alert('Error', 'Invalid email or password');
      } else if (error.message?.includes('Network')) {
        Alert.alert('Network Error', 'Please check your internet connection');
      } else {
        Alert.alert('Error', error.response?.data?.error?.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    // Demo mode for testing without backend
    await AsyncStorage.setItem('authToken', 'demo-token-12345');
    await AsyncStorage.setItem('userInfo', JSON.stringify({
      id: 'demo-user',
      email: 'demo@firstline.health',
      name: 'Demo User',
      role: 'healthcare_worker',
    }));
    Alert.alert('Demo Mode', 'Logged in as demo user');
    onLogin();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.logoContainer}>
        <Title style={styles.logo}>🏥 FirstLine</Title>
        <Paragraph style={styles.tagline}>Healthcare Triage Platform</Paragraph>
      </View>

      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.title}>Welcome Back</Title>
          <Paragraph style={styles.subtitle}>Sign in to continue</Paragraph>

          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            mode="outlined"
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            error={!!errors.email}
            left={<TextInput.Icon icon="email" />}
          />
          <HelperText type="error" visible={!!errors.email}>
            {errors.email}
          </HelperText>

          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            mode="outlined"
            style={styles.input}
            secureTextEntry={!showPassword}
            error={!!errors.password}
            left={<TextInput.Icon icon="lock" />}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword(!showPassword)}
              />
            }
          />
          <HelperText type="error" visible={!!errors.password}>
            {errors.password}
          </HelperText>

          <Button
            mode="contained"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
            style={styles.button}
          >
            Sign In
          </Button>

          <Button
            mode="outlined"
            onPress={handleDemoLogin}
            style={styles.button}
          >
            Demo Mode (No Login Required)
          </Button>

          <Button
            mode="text"
            onPress={() => navigation.navigate('ForgotPassword')}
            style={styles.textButton}
          >
            Forgot Password?
          </Button>
        </Card.Content>
      </Card>

      <View style={styles.footer}>
        <Paragraph>Don't have an account?</Paragraph>
        <Button
          mode="text"
          onPress={() => navigation.navigate('Signup')}
        >
          Sign Up
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: 16,
    justifyContent: 'center',
    minHeight: '100%',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  tagline: {
    fontSize: 16,
    color: '#666',
  },
  card: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    marginBottom: 8,
  },
  subtitle: {
    marginBottom: 24,
    color: '#666',
  },
  input: {
    marginBottom: 8,
  },
  button: {
    marginTop: 8,
    marginBottom: 8,
  },
  textButton: {
    marginTop: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
});
