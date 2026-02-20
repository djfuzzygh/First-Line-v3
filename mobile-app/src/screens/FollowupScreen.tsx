import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Card, Title, Paragraph, TextInput, Button, RadioButton } from 'react-native-paper';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { apiService } from '../services/api';

type FollowupScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Followup'>;
type FollowupScreenRouteProp = RouteProp<RootStackParamList, 'Followup'>;

interface Props {
  navigation: FollowupScreenNavigationProp;
  route: FollowupScreenRouteProp;
}

export default function FollowupScreen({ navigation, route }: Props) {
  const { encounterId, questions } = route.params;
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  const currentQuestion = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

  // Check if question is yes/no type
  const isYesNoQuestion = currentQuestion.toLowerCase().includes('do you') ||
    currentQuestion.toLowerCase().includes('have you') ||
    currentQuestion.toLowerCase().includes('are you') ||
    currentQuestion.toLowerCase().includes('is there');

  const handleNext = async () => {
    if (!currentAnswer.trim()) {
      Alert.alert('Required', 'Please provide an answer before continuing');
      return;
    }

    // Save current answer
    const newAnswers = { ...answers, [currentQuestion]: currentAnswer };
    setAnswers(newAnswers);

    // Submit to backend
    setLoading(true);
    try {
      await apiService.submitFollowup(encounterId, currentQuestion, currentAnswer);

      if (isLastQuestion) {
        // All questions answered, proceed to triage
        Alert.alert(
          'Complete',
          'All follow-up questions answered. Proceeding to triage assessment.',
          [
            {
              text: 'OK',
              onPress: () => navigation.navigate('TriageResult', { encounterId }),
            },
          ]
        );
      } else {
        // Move to next question
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        setCurrentAnswer('');
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error?.message || 'Failed to submit answer');
    } finally {
      setLoading(false);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      const prevQuestion = questions[currentQuestionIndex - 1];
      setCurrentAnswer(answers[prevQuestion] || '');
    }
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip Question',
      'Are you sure you want to skip this question? This may affect the accuracy of the triage assessment.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          style: 'destructive',
          onPress: () => {
            setCurrentAnswer('Not answered');
            handleNext();
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.progressCard}>
        <Card.Content>
          <Paragraph>
            Question {currentQuestionIndex + 1} of {questions.length}
          </Paragraph>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.questionCard}>
        <Card.Content>
          <Title style={styles.questionText}>{currentQuestion}</Title>
        </Card.Content>
      </Card>

      {isYesNoQuestion ? (
        <Card style={styles.card}>
          <Card.Content>
            <RadioButton.Group
              onValueChange={setCurrentAnswer}
              value={currentAnswer}
            >
              <View style={styles.radioItem}>
                <RadioButton value="Yes" />
                <Paragraph style={styles.radioLabel}>Yes</Paragraph>
              </View>
              <View style={styles.radioItem}>
                <RadioButton value="No" />
                <Paragraph style={styles.radioLabel}>No</Paragraph>
              </View>
              <View style={styles.radioItem}>
                <RadioButton value="Not sure" />
                <Paragraph style={styles.radioLabel}>Not sure</Paragraph>
              </View>
            </RadioButton.Group>
          </Card.Content>
        </Card>
      ) : (
        <TextInput
          label="Your answer"
          value={currentAnswer}
          onChangeText={setCurrentAnswer}
          mode="outlined"
          multiline
          numberOfLines={4}
          style={styles.input}
          placeholder="Please provide details..."
        />
      )}

      <View style={styles.buttonContainer}>
        {currentQuestionIndex > 0 && (
          <Button
            mode="outlined"
            onPress={handlePrevious}
            style={styles.navButton}
            disabled={loading}
          >
            Previous
          </Button>
        )}
        <Button
          mode="contained"
          onPress={handleNext}
          style={styles.navButton}
          loading={loading}
          disabled={loading}
        >
          {isLastQuestion ? 'Complete' : 'Next'}
        </Button>
      </View>

      <Button
        mode="text"
        onPress={handleSkip}
        style={styles.skipButton}
        disabled={loading}
      >
        Skip this question
      </Button>

      {Object.keys(answers).length > 0 && (
        <Card style={styles.summaryCard}>
          <Card.Content>
            <Title>Answered Questions ({Object.keys(answers).length})</Title>
            {Object.entries(answers).map(([q, a], index) => (
              <View key={index} style={styles.answerItem}>
                <Paragraph style={styles.answerQuestion}>Q: {q}</Paragraph>
                <Paragraph style={styles.answerText}>A: {a}</Paragraph>
              </View>
            ))}
          </Card.Content>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  progressCard: {
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2196F3',
  },
  questionCard: {
    marginBottom: 16,
    backgroundColor: '#E3F2FD',
  },
  questionText: {
    fontSize: 18,
    lineHeight: 26,
  },
  card: {
    marginBottom: 16,
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  radioLabel: {
    fontSize: 16,
    marginLeft: 8,
  },
  input: {
    marginBottom: 16,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  navButton: {
    flex: 1,
  },
  skipButton: {
    marginBottom: 16,
  },
  summaryCard: {
    marginTop: 8,
    marginBottom: 16,
    backgroundColor: '#F5F5F5',
  },
  answerItem: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  answerQuestion: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  answerText: {
    color: '#666',
  },
});
