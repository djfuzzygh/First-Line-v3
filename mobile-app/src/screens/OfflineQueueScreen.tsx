import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import { Card, Title, Paragraph, Button, Chip, ActivityIndicator } from 'react-native-paper';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../App';
import { offlineStorage, OfflineEncounter } from '../services/offlineStorage';
import { apiService } from '../services/api';

type OfflineQueueScreenNavigationProp = StackNavigationProp<RootStackParamList, 'OfflineQueue'>;

interface Props {
  navigation: OfflineQueueScreenNavigationProp;
}

export default function OfflineQueueScreen({ navigation }: Props) {
  const [queue, setQueue] = useState<OfflineEncounter[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadQueue();
  }, []);

  const loadQueue = async () => {
    const data = await offlineStorage.getOfflineQueue();
    setQueue(data);
  };

  const syncAll = async () => {
    setSyncing(true);
    let successCount = 0;
    let failCount = 0;

    for (const encounter of queue) {
      if (encounter.synced) continue;

      try {
        await apiService.createEncounter(encounter.data);
        await offlineStorage.markAsSynced(encounter.id);
        successCount++;
      } catch (error) {
        failCount++;
      }
    }

    setSyncing(false);
    await loadQueue();

    Alert.alert(
      'Sync Complete',
      `Successfully synced: ${successCount}\nFailed: ${failCount}`,
      [{ text: 'OK' }]
    );
  };

  const clearSynced = async () => {
    await offlineStorage.clearSyncedEncounters();
    await loadQueue();
  };

  const renderItem = ({ item }: { item: OfflineEncounter }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.cardHeader}>
          <Title style={styles.cardTitle}>
            {item.data.location || 'Unknown Location'}
          </Title>
          <Chip style={item.synced ? styles.syncedChip : styles.pendingChip}>
            {item.synced ? 'Synced' : 'Pending'}
          </Chip>
        </View>
        <Paragraph>Age: {item.data.age}, Sex: {item.data.sex}</Paragraph>
        <Paragraph>Symptoms: {item.data.symptoms}</Paragraph>
        <Paragraph style={styles.timestamp}>
          Created: {new Date(item.timestamp).toLocaleString()}
        </Paragraph>
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.container}>
      <Card style={styles.headerCard}>
        <Card.Content>
          <Title>Offline Queue</Title>
          <Paragraph>
            {queue.filter(e => !e.synced).length} encounters pending sync
          </Paragraph>
        </Card.Content>
      </Card>

      <View style={styles.buttonContainer}>
        <Button
          mode="contained"
          onPress={syncAll}
          loading={syncing}
          disabled={syncing || queue.filter(e => !e.synced).length === 0}
          style={styles.button}
          icon="sync"
        >
          Sync All
        </Button>
        <Button
          mode="outlined"
          onPress={clearSynced}
          disabled={queue.filter(e => e.synced).length === 0}
          style={styles.button}
        >
          Clear Synced
        </Button>
      </View>

      <FlatList
        data={queue}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Card style={styles.emptyCard}>
            <Card.Content>
              <Paragraph>No offline encounters</Paragraph>
            </Card.Content>
          </Card>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  headerCard: {
    marginBottom: 16,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  button: {
    flex: 1,
  },
  card: {
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
  },
  syncedChip: {
    backgroundColor: '#4CAF50',
  },
  pendingChip: {
    backgroundColor: '#FF9800',
  },
  timestamp: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  emptyCard: {
    alignItems: 'center',
  },
});
