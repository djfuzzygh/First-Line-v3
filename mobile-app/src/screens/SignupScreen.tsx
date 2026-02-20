import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { TextInput, Button, Card, Title, Paragraph, HelperText, SegmentedButtons } from 'react-native-paper';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthStackParamList } from '../../App';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

type SignupScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Signup'>;

interface Props {
  navigation: SignupScreenNavigationProp;
  onLogin: () => void;
}

export default function SignupScreen({ navigation, onLogin }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'healthcare_worker' | 'admin'>('healthcare_worker');
  const [organization, setOrganization] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!organization.trim()) {
      newErrors.organization = 'Organization is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignup = async () => {
    if (!validate()) return;

    setLoading(true);

    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.firstline.health/v1';
      
      const response = await axios.post(`${API_URL}/auth/signup`, {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password,
        role,
        organization: organization.trim(),
      });

      const { token, user } = response.data;

      await AsyncStorage.setItem('authToken', token);
      await AsyncStorage.setItem('userInfo', JSON.stringify(user));

      Alert.alert('Success', 'Account created successfully!');
      onLogin();
    } catch (error: any) {
      if (error.response?.status === 409) {
        Alert.alert('Error', 'An account with this email already exists');
      } else if (error.message?.includes('Network')) {
        Alert.alert('Network Error', 'Please check your internet connection');
      } else {
        Alert.alert('Error', error.response?.data?.error?.message || 'Signup failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.title}>Create Account</Title>
          <Paragraph style={styles.subtitle}>Join FirstLine to start triaging patients</Paragraph>

          <TextInput
            label="Full Name *"
            value={name}
            onChangeText={setName}
            mode="outlined"
            style={styles.input}
            error={!!errors.name}
            left={<TextInput.Icon icon="account" />}
          />
          <HelperText type="error" visible={!!errors.name}>
            {errors.name}
          </HelperText>

          <TextInput
            label="Email *"
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
            label="Organization *"
            value={organization}
            onChangeText={setOrganization}
            mode="outlined"
            style={styles.input}
            error={!!errors.organization}
            left={<TextInput.Icon icon="hospital-building" />}
          />
          <HelperText type="error" visible={!!errors.organization}>
            {errors.organization}
          </HelperText>

          <Paragraph style={styles.label}>Role *</Paragraph>
          <SegmentedButtons
            value={role}
            onValueChange={(value) => setRole(value as 'healthcare_worker' | 'admin')}
            buttons={[
              { value: 'healthcare_worker', label: 'Healthcare Worker' },
              { value: 'admin', label: 'Administrator' },
            ]}
            style={styles.input}
          />

          <TextInput
            label="Password *"
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

          <TextInput
            label="Confirm Password *"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            mode="outlined"
            style={styles.input}
            secureTextEntry={!showPassword}
            error={!!errors.confirmPassword}
            left={<TextInput.Icon icon="lock-check" />}
          />
          <HelperText type="error" visible={!!errors.confirmPassword}>
            {errors.confirmPassword}
          </HelperText>

          <Button
            mode="contained"
            onPress={handleSignup}
            loading={loading}
            disabled={loading}
            style={styles.button}
          >
            Create Account
          </Button>

          <View style={styles.footer}>
            <Paragraph>Already have an account?</Paragraph>
            <Button
              mode="text"
              onPress={() => navigation.navigate('Login')}
            >
              Sign In
            </Button>
          </View>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  card: {
    marginTop: 16,
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    marginBottom: 8,
  },
  subtitle: {
    marginBottom: 24,
    color: '#666',
  },
  label: {
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    marginBottom: 8,
  },
  button: {
    marginTop: 16,
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
});
