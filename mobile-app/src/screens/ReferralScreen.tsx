import React, { useState } from 'react';
import { View, StyleSheet, Alert, Linking } from 'react-native';
import { Card, Title, Paragraph, Button, ActivityIndicator } from 'react-native-paper';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { apiService } from '../services/api';

type ReferralScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Referral'>;
type ReferralScreenRouteProp = RouteProp<RootStackParamList, 'Referral'>;

interface Props {
  navigation: ReferralScreenNavigationProp;
  route: ReferralScreenRouteProp;
}

export default function ReferralScreen({ navigation, route }: Props) {
  const { encounterId } = route.params;
  const [loading, setLoading] = useState(false);
  const [referralUrl, setReferralUrl] = useState<string | null>(null);

  const handleGenerateReferral = async () => {
    setLoading(true);
    try {
      const response = await apiService.generateReferral(encounterId);
      if (response.documentUrl) {
        setReferralUrl(response.documentUrl);
        Alert.alert('Success', 'Referral document generated successfully');
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error?.message || 'Failed to generate referral');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDocument = () => {
    if (referralUrl) {
      Linking.openURL(referralUrl);
    }
  };

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Title>Referral Document</Title>
          <Paragraph>
            Generate a comprehensive referral summary for the healthcare provider.
          </Paragraph>
        </Card.Content>
      </Card>

      {!referralUrl && (
        <Button
          mode="contained"
          onPress={handleGenerateReferral}
          loading={loading}
          disabled={loading}
          style={styles.button}
          icon="file-document"
        >
          Generate Referral
        </Button>
      )}

      {referralUrl && (
        <>
          <Card style={styles.successCard}>
            <Card.Content>
              <Title style={styles.successTitle}>✓ Referral Generated</Title>
              <Paragraph>The referral document is ready to view or share.</Paragraph>
            </Card.Content>
          </Card>

          <Button
            mode="contained"
            onPress={handleOpenDocument}
            style={styles.button}
            icon="open-in-new"
          >
            Open Document
          </Button>
        </>
      )}

      <Button
        mode="outlined"
        onPress={() => navigation.navigate('Home')}
        style={styles.button}
      >
        Return to Home
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  card: {
    marginBottom: 16,
  },
  successCard: {
    marginBottom: 16,
    backgroundColor: '#E8F5E9',
  },
  successTitle: {
    color: '#4CAF50',
  },
  button: {
    marginBottom: 12,
  },
});
