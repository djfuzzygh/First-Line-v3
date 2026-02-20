import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Card, Title, Paragraph, Button, ActivityIndicator, Chip } from 'react-native-paper';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { apiService, TriageResult } from '../services/api';

type TriageResultScreenNavigationProp = StackNavigationProp<RootStackParamList, 'TriageResult'>;
type TriageResultScreenRouteProp = RouteProp<RootStackParamList, 'TriageResult'>;

interface Props {
  navigation: TriageResultScreenNavigationProp;
  route: TriageResultScreenRouteProp;
}

export default function TriageResultScreen({ navigation, route }: Props) {
  const { encounterId } = route.params;
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<TriageResult | null>(null);

  useEffect(() => {
    performTriage();
  }, []);

  const performTriage = async () => {
    try {
      const triageResult = await apiService.performTriage(encounterId);
      setResult(triageResult);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error?.message || 'Failed to perform triage');
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (tier: string) => {
    switch (tier) {
      case 'RED': return '#F44336';
      case 'YELLOW': return '#FF9800';
      case 'GREEN': return '#4CAF50';
      default: return '#9E9E9E';
    }
  };

  const handleGenerateReferral = () => {
    navigation.navigate('Referral', { encounterId });
  };

  const handleNewEncounter = () => {
    navigation.navigate('Home');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Paragraph style={styles.loadingText}>Analyzing symptoms...</Paragraph>
      </View>
    );
  }

  if (!result) {
    return (
      <View style={styles.container}>
        <Card>
          <Card.Content>
            <Title>Error</Title>
            <Paragraph>Unable to load triage result</Paragraph>
          </Card.Content>
        </Card>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Card style={[styles.riskCard, { borderLeftColor: getRiskColor(result.riskTier) }]}>
        <Card.Content>
          <Title style={[styles.riskTitle, { color: getRiskColor(result.riskTier) }]}>
            {result.riskTier} PRIORITY
          </Title>
          <Chip 
            style={[styles.uncertaintyChip, { backgroundColor: getRiskColor(result.riskTier) }]}
            textStyle={{ color: 'white' }}
          >
            Confidence: {result.uncertainty}
          </Chip>
        </Card.Content>
      </Card>

      {result.dangerSigns.length > 0 && (
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.dangerTitle}>⚠️ Danger Signs Detected</Title>
            {result.dangerSigns.map((sign, index) => (
              <Paragraph key={index} style={styles.dangerSign}>• {sign}</Paragraph>
            ))}
          </Card.Content>
        </Card>
      )}

      <Card style={styles.card}>
        <Card.Content>
          <Title>Recommended Next Steps</Title>
          {result.recommendedNextSteps.map((step, index) => (
            <Paragraph key={index} style={styles.listItem}>
              {index + 1}. {step}
            </Paragraph>
          ))}
        </Card.Content>
      </Card>

      {result.watchOuts.length > 0 && (
        <Card style={styles.card}>
          <Card.Content>
            <Title>Watch Out For</Title>
            {result.watchOuts.map((item, index) => (
              <Paragraph key={index} style={styles.listItem}>• {item}</Paragraph>
            ))}
          </Card.Content>
        </Card>
      )}

      <Card style={styles.disclaimerCard}>
        <Card.Content>
          <Paragraph style={styles.disclaimer}>{result.disclaimer}</Paragraph>
        </Card.Content>
      </Card>

      {result.referralRecommended && (
        <Button
          mode="contained"
          onPress={handleGenerateReferral}
          style={styles.button}
          icon="file-document"
        >
          Generate Referral Document
        </Button>
      )}

      <Button
        mode="outlined"
        onPress={handleNewEncounter}
        style={styles.button}
      >
        Start New Encounter
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
  },
  riskCard: {
    marginBottom: 16,
    borderLeftWidth: 8,
  },
  riskTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  uncertaintyChip: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  card: {
    marginBottom: 16,
  },
  dangerTitle: {
    color: '#F44336',
    marginBottom: 8,
  },
  dangerSign: {
    color: '#F44336',
    marginLeft: 8,
  },
  listItem: {
    marginBottom: 4,
  },
  disclaimerCard: {
    backgroundColor: '#FFF3E0',
    marginBottom: 16,
  },
  disclaimer: {
    fontStyle: 'italic',
    fontSize: 12,
  },
  button: {
    marginBottom: 12,
  },
});
