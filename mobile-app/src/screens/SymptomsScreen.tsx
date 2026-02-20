import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { TextInput, Button, Card, Title, Paragraph, Chip } from 'react-native-paper';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { apiService } from '../services/api';

type SymptomsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Symptoms'>;
type SymptomsScreenRouteProp = RouteProp<RootStackParamList, 'Symptoms'>;

interface Props {
  navigation: SymptomsScreenNavigationProp;
  route: SymptomsScreenRouteProp;
}

const COMMON_SYMPTOMS = [
  'Fever',
  'Cough',
  'Headache',
  'Fatigue',
  'Nausea',
  'Vomiting',
  'Diarrhea',
  'Abdominal pain',
  'Chest pain',
  'Difficulty breathing',
  'Dizziness',
  'Rash',
];

export default function SymptomsScreen({ navigation, route }: Props) {
  const { encounterId } = route.params;
  const [additionalSymptoms, setAdditionalSymptoms] = useState('');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const toggleSymptom = (symptom: string) => {
    if (selectedSymptoms.includes(symptom)) {
      setSelectedSymptoms(selectedSymptoms.filter(s => s !== symptom));
    } else {
      setSelectedSymptoms([...selectedSymptoms, symptom]);
    }
  };

  const handleSubmit = async () => {
    const allSymptoms = [
      ...selectedSymptoms,
      ...(additionalSymptoms.trim() ? [additionalSymptoms.trim()] : []),
    ];

    if (allSymptoms.length === 0) {
      Alert.alert('Error', 'Please select or enter at least one symptom');
      return;
    }

    setLoading(true);

    try {
      await apiService.addSymptoms(encounterId, allSymptoms.join(', '));
      Alert.alert('Success', 'Symptoms added successfully');
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error?.message || 'Failed to add symptoms');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Title>Select Common Symptoms</Title>
          <Paragraph>Tap to select symptoms the patient is experiencing</Paragraph>
        </Card.Content>
      </Card>

      <View style={styles.chipContainer}>
        {COMMON_SYMPTOMS.map((symptom) => (
          <Chip
            key={symptom}
            selected={selectedSymptoms.includes(symptom)}
            onPress={() => toggleSymptom(symptom)}
            style={styles.chip}
            mode={selectedSymptoms.includes(symptom) ? 'flat' : 'outlined'}
          >
            {symptom}
          </Chip>
        ))}
      </View>

      <Card style={styles.card}>
        <Card.Content>
          <Title>Additional Symptoms</Title>
          <Paragraph>Describe any other symptoms not listed above</Paragraph>
        </Card.Content>
      </Card>

      <TextInput
        label="Other symptoms or details"
        value={additionalSymptoms}
        onChangeText={setAdditionalSymptoms}
        mode="outlined"
        multiline
        numberOfLines={4}
        style={styles.input}
        placeholder="e.g., pain in lower back, swelling in legs..."
      />

      {selectedSymptoms.length > 0 && (
        <Card style={styles.summaryCard}>
          <Card.Content>
            <Title>Selected Symptoms ({selectedSymptoms.length})</Title>
            <Paragraph>{selectedSymptoms.join(', ')}</Paragraph>
          </Card.Content>
        </Card>
      )}

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={loading}
        disabled={loading}
        style={styles.button}
      >
        Add Symptoms
      </Button>

      <Button
        mode="outlined"
        onPress={() => navigation.goBack()}
        style={styles.button}
      >
        Cancel
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
  card: {
    marginBottom: 16,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    marginBottom: 8,
  },
  input: {
    marginBottom: 16,
  },
  summaryCard: {
    marginBottom: 16,
    backgroundColor: '#E3F2FD',
  },
  button: {
    marginBottom: 12,
  },
});
