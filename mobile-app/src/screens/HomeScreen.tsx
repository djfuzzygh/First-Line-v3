import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Button, Card, Title, Paragraph, Badge, IconButton, Menu } from 'react-native-paper';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../App';
import { offlineStorage } from '../services/offlineStorage';
import { apiService } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

interface Props {
  navigation: HomeScreenNavigationProp;
}

export default function HomeScreen({ navigation }: Props) {
  const [offlineCount, setOfflineCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [userName, setUserName] = useState('User');

  useEffect(() => {
    loadOfflineCount();
    checkConnectivity();
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      const userInfo = await AsyncStorage.getItem('userInfo');
      if (userInfo) {
        const user = JSON.parse(userInfo);
        setUserName(user.name || 'User');
      }
    } catch (error) {
      console.error('Error loading user info:', error);
    }
  };

  const loadOfflineCount = async () => {
    const queue = await offlineStorage.getOfflineQueue();
    const unsynced = queue.filter(e => !e.synced);
    setOfflineCount(unsynced.length);
  };

  const checkConnectivity = async () => {
    try {
      await apiService.checkHealth();
      setIsOnline(true);
    } catch (error) {
      setIsOnline(false);
    }
  };

  const handleNewEncounter = () => {
    navigation.navigate('NewEncounter');
  };

  const handleOfflineQueue = () => {
    navigation.navigate('OfflineQueue');
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('authToken');
            await AsyncStorage.removeItem('userInfo');
            // Navigation will be handled by App.tsx auth state
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Title>Welcome, {userName}!</Title>
        </View>
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <IconButton
              icon="dots-vertical"
              onPress={() => setMenuVisible(true)}
            />
          }
        >
          <Menu.Item
            onPress={() => {
              setMenuVisible(false);
              checkConnectivity();
              loadOfflineCount();
            }}
            title="Refresh"
            leadingIcon="refresh"
          />
          <Menu.Item
            onPress={() => {
              setMenuVisible(false);
              handleLogout();
            }}
            title="Logout"
            leadingIcon="logout"
          />
        </Menu>
      </View>

      <Card style={styles.card}>
        <Card.Content>
          <Title>FirstLine Triage</Title>
          <Paragraph>AI-powered healthcare triage for low-resource settings</Paragraph>
          
          <View style={styles.statusContainer}>
            <Badge style={isOnline ? styles.onlineBadge : styles.offlineBadge}>
              {isOnline ? 'Online' : 'Offline'}
            </Badge>
            {offlineCount > 0 && (
              <Badge style={styles.queueBadge}>
                {offlineCount} pending sync
              </Badge>
            )}
          </View>
        </Card.Content>
      </Card>

      <Button
        mode="contained"
        onPress={handleNewEncounter}
        style={styles.button}
        icon="plus"
      >
        Start New Triage
      </Button>

      {offlineCount > 0 && (
        <Button
          mode="outlined"
          onPress={handleOfflineQueue}
          style={styles.button}
          icon="sync"
        >
          View Offline Queue ({offlineCount})
        </Button>
      )}

      <Card style={styles.infoCard}>
        <Card.Content>
          <Title style={styles.infoTitle}>Quick Guide</Title>
          <Paragraph>1. Collect patient demographics</Paragraph>
          <Paragraph>2. Record symptoms</Paragraph>
          <Paragraph>3. Answer follow-up questions</Paragraph>
          <Paragraph>4. Get triage assessment</Paragraph>
          <Paragraph>5. Generate referral if needed</Paragraph>
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  card: {
    marginBottom: 16,
  },
  button: {
    marginBottom: 12,
  },
  statusContainer: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  onlineBadge: {
    backgroundColor: '#4CAF50',
  },
  offlineBadge: {
    backgroundColor: '#FF9800',
  },
  queueBadge: {
    backgroundColor: '#2196F3',
  },
  infoCard: {
    marginTop: 16,
  },
  infoTitle: {
    fontSize: 18,
    marginBottom: 8,
  },
});
