import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { TextInput, Button, SegmentedButtons, HelperText } from 'react-native-paper';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../App';
import { apiService, CreateEncounterRequest } from '../services/api';
import { offlineStorage } from '../services/offlineStorage';

type NewEncounterScreenNavigationProp = StackNavigationProp<RootStackParamList, 'NewEncounter'>;

interface Props {
  navigation: NewEncounterScreenNavigationProp;
}

export default function NewEncounterScreen({ navigation }: Props) {
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<'M' | 'F' | 'O'>('M');
  const [location, setLocation] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [temperature, setTemperature] = useState('');
  const [pulse, setPulse] = useState('');
  const [bloodPressure, setBloodPressure] = useState('');
  const [respiratoryRate, setRespiratoryRate] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!age || isNaN(Number(age)) || Number(age) < 0 || Number(age) > 150) {
      newErrors.age = 'Please enter a valid age (0-150)';
    }
    if (!location.trim()) {
      newErrors.location = 'Location is required';
    }
    if (!symptoms.trim()) {
      newErrors.symptoms = 'Symptoms are required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);

    const encounterData: CreateEncounterRequest = {
      channel: 'app',
      age: Number(age),
      sex,
      location: location.trim(),
      symptoms: symptoms.trim(),
      vitals: {
        temperature: temperature ? Number(temperature) : undefined,
        pulse: pulse ? Number(pulse) : undefined,
        bloodPressure: bloodPressure || undefined,
        respiratoryRate: respiratoryRate ? Number(respiratoryRate) : undefined,
      },
    };

    try {
      const response = await apiService.createEncounter(encounterData);
      Alert.alert('Success', 'Encounter created successfully');
      navigation.navigate('TriageResult', { encounterId: response.encounterId });
    } catch (error: any) {
      // Save offline if network error
      if (error.message?.includes('Network') || error.code === 'ECONNABORTED') {
        const offlineId = `offline-${Date.now()}`;
        await offlineStorage.saveOfflineEncounter({
          id: offlineId,
          data: { ...encounterData, offlineCreated: true },
          timestamp: new Date().toISOString(),
          synced: false,
        });
        Alert.alert(
          'Saved Offline',
          'No internet connection. Encounter saved locally and will sync when online.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert('Error', error.response?.data?.error?.message || 'Failed to create encounter');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.form}>
        <TextInput
          label="Patient Age *"
          value={age}
          onChangeText={setAge}
          keyboardType="numeric"
          mode="outlined"
          style={styles.input}
          error={!!errors.age}
        />
        <HelperText type="error" visible={!!errors.age}>
          {errors.age}
        </HelperText>

        <SegmentedButtons
          value={sex}
          onValueChange={(value) => setSex(value as 'M' | 'F' | 'O')}
          buttons={[
            { value: 'M', label: 'Male' },
            { value: 'F', label: 'Female' },
            { value: 'O', label: 'Other' },
          ]}
          style={styles.input}
        />

        <TextInput
          label="Location *"
          value={location}
          onChangeText={setLocation}
          mode="outlined"
          style={styles.input}
          error={!!errors.location}
        />
        <HelperText type="error" visible={!!errors.location}>
          {errors.location}
        </HelperText>

        <TextInput
          label="Chief Complaint / Symptoms *"
          value={symptoms}
          onChangeText={setSymptoms}
          mode="outlined"
          multiline
          numberOfLines={4}
          style={styles.input}
          error={!!errors.symptoms}
        />
        <HelperText type="error" visible={!!errors.symptoms}>
          {errors.symptoms}
        </HelperText>

        <TextInput
          label="Temperature (°C)"
          value={temperature}
          onChangeText={setTemperature}
          keyboardType="decimal-pad"
          mode="outlined"
          style={styles.input}
        />

        <TextInput
          label="Pulse (bpm)"
          value={pulse}
          onChangeText={setPulse}
          keyboardType="numeric"
          mode="outlined"
          style={styles.input}
        />

        <TextInput
          label="Blood Pressure (e.g., 120/80)"
          value={bloodPressure}
          onChangeText={setBloodPressure}
          mode="outlined"
          style={styles.input}
        />

        <TextInput
          label="Respiratory Rate (breaths/min)"
          value={respiratoryRate}
          onChangeText={setRespiratoryRate}
          keyboardType="numeric"
          mode="outlined"
          style={styles.input}
        />

        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={loading}
          disabled={loading}
          style={styles.button}
        >
          Start Triage Assessment
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
  form: {
    padding: 16,
  },
  input: {
    marginBottom: 8,
  },
  button: {
    marginTop: 16,
    marginBottom: 32,
  },
});
