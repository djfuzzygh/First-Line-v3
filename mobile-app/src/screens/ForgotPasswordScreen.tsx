import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { TextInput, Button, Card, Title, Paragraph, HelperText } from 'react-native-paper';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthStackParamList } from '../../App';
import axios from 'axios';

type ForgotPasswordScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'ForgotPassword'>;

interface Props {
  navigation: ForgotPasswordScreenNavigationProp;
}

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const validate = (): boolean => {
    if (!email.trim()) {
      setError('Email is required');
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Email is invalid');
      return false;
    }
    setError('');
    return true;
  };

  const handleResetPassword = async () => {
    if (!validate()) return;

    setLoading(true);

    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.firstline.health/v1';
      
      await axios.post(`${API_URL}/auth/forgot-password`, {
        email: email.toLowerCase().trim(),
      });

      setSuccess(true);
      Alert.alert(
        'Success',
        'Password reset instructions have been sent to your email.',
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Login'),
          },
        ]
      );
    } catch (error: any) {
      if (error.message?.includes('Network')) {
        Alert.alert('Network Error', 'Please check your internet connection');
      } else {
        Alert.alert('Error', error.response?.data?.error?.message || 'Failed to send reset email');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.title}>Reset Password</Title>
          <Paragraph style={styles.subtitle}>
            Enter your email address and we'll send you instructions to reset your password.
          </Paragraph>

          {!success && (
            <>
              <TextInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                mode="outlined"
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                error={!!error}
                left={<TextInput.Icon icon="email" />}
              />
              <HelperText type="error" visible={!!error}>
                {error}
              </HelperText>

              <Button
                mode="contained"
                onPress={handleResetPassword}
                loading={loading}
                disabled={loading}
                style={styles.button}
              >
                Send Reset Link
              </Button>
            </>
          )}

          <Button
            mode="text"
            onPress={() => navigation.navigate('Login')}
            style={styles.textButton}
          >
            Back to Sign In
          </Button>
        </Card.Content>
      </Card>
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
    marginTop: 16,
    marginBottom: 8,
  },
  textButton: {
    marginTop: 8,
  },
});
