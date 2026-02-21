import AsyncStorage from '@react-native-async-storage/async-storage';

const OFFLINE_QUEUE_KEY = 'offline_encounters';

export interface OfflineEncounter {
  id: string;
  data: any;
  timestamp: string;
  synced: boolean;
}

export const offlineStorage = {
  async saveOfflineEncounter(encounter: OfflineEncounter): Promise<void> {
    const queue = await this.getOfflineQueue();
    queue.push(encounter);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  },

  async getOfflineQueue(): Promise<OfflineEncounter[]> {
    const data = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!data) return [];
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      console.warn('Corrupted offline queue data — resetting to empty queue');
      return [];
    }
  },

  async markAsSynced(encounterId: string): Promise<void> {
    const queue = await this.getOfflineQueue();
    const updated = queue.map(e => 
      e.id === encounterId ? { ...e, synced: true } : e
    );
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(updated));
  },

  async removeFromQueue(encounterId: string): Promise<void> {
    const queue = await this.getOfflineQueue();
    const filtered = queue.filter(e => e.id !== encounterId);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filtered));
  },

  async clearSyncedEncounters(): Promise<void> {
    const queue = await this.getOfflineQueue();
    const unsynced = queue.filter(e => !e.synced);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(unsynced));
  },
};
