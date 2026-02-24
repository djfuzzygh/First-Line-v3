/**
 * IVR Demo Component
 * Interactive Voice Response System Simulation
 * Shows the voice channel in action for judges
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  Alert,
  Chip,
  Grid,
} from '@mui/material';
import {
  Phone,
  Mic,
  PhoneOff,
  CheckCircle,
  Error as ErrorIcon,
  VolumeUp,
} from '@mui/icons-material';

interface IVRStep {
  id: string;
  prompt: string;
  options?: Array<{ key: string; label: string }>;
  onSelect?: (key: string) => void;
}

export const IVRDemo: React.FC = () => {
  const [callActive, setCallActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [triageResult, setTriageResult] = useState<any>(null);
  const [callDuration, setCallDuration] = useState(0);

  // IVR Script
  const ivrScript: IVRStep[] = [
    {
      id: 'welcome',
      prompt: '📞 Welcome to FirstLine Clinical Triage. Press 1 for New Triage Assessment.',
    },
    {
      id: 'age_selection',
      prompt: '👤 What is the patient age group?',
      options: [
        { key: '1', label: 'Infant (0-2 years)' },
        { key: '2', label: 'Child (3-12 years)' },
        { key: '3', label: 'Teen (13-17 years)' },
        { key: '4', label: 'Adult (18-65 years)' },
        { key: '5', label: 'Elderly (65+ years)' },
      ],
    },
    {
      id: 'symptoms',
      prompt: '🤒 What are the main symptoms?',
      options: [
        { key: '1', label: 'Fever' },
        { key: '2', label: 'Cough' },
        { key: '3', label: 'Chest Pain' },
        { key: '4', label: 'Abdominal Pain' },
        { key: '5', label: 'Difficulty Breathing' },
      ],
    },
    {
      id: 'duration',
      prompt: '⏱️ How long have you had these symptoms?',
      options: [
        { key: '1', label: 'Less than 24 hours' },
        { key: '2', label: '1-3 days' },
        { key: '3', label: '3-7 days' },
        { key: '4', label: 'More than 1 week' },
      ],
    },
    {
      id: 'danger_signs',
      prompt: '⚠️ Any danger signs?',
      options: [
        { key: '1', label: 'Difficulty breathing' },
        { key: '2', label: 'Unconscious or unresponsive' },
        { key: '3', label: 'Severe bleeding' },
        { key: '4', label: 'Severe chest pain' },
        { key: '5', label: 'None of the above' },
      ],
    },
  ];

  // Timer for call duration
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callActive && !triageResult) {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callActive, triageResult]);

  const startCall = () => {
    setCallActive(true);
    setCurrentStep(0);
    setSelectedAnswers([]);
    setTriageResult(null);
    setCallDuration(0);
  };

  const selectOption = async (key: string) => {
    const answers = [...selectedAnswers, key];
    setSelectedAnswers(answers);

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (currentStep < ivrScript.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Perform triage
      await performTriage(answers);
    }
  };

  const performTriage = async (answers: string[]) => {
    setProcessing(true);

    // Map answers to clinical data
    const ageMap: { [key: string]: string } = {
      '1': 'Infant',
      '2': 'Child',
      '3': 'Teen',
      '4': 'Adult',
      '5': 'Elderly',
    };

    const symptomMap: { [key: string]: string } = {
      '1': 'Fever',
      '2': 'Cough',
      '3': 'Chest Pain',
      '4': 'Abdominal Pain',
      '5': 'Difficulty Breathing',
    };

    const durationMap: { [key: string]: string } = {
      '1': '< 24 hours',
      '2': '1-3 days',
      '3': '3-7 days',
      '4': '> 1 week',
    };

    // Simulate AI assessment
    const result = {
      ageGroup: ageMap[answers[0]] || 'Unknown',
      symptoms: [symptomMap[answers[1]] || 'Unknown'],
      duration: durationMap[answers[2]] || 'Unknown',
      riskTier: simulateRiskAssessment(answers),
      recommendations: [
        'See a clinician within 2 hours for evaluation',
        'Keep patient hydrated and rested',
        'Monitor vital signs closely',
        'Seek immediate care if symptoms worsen',
      ],
      disclaimer:
        'This is not a diagnosis. Please consult with a qualified healthcare provider for medical advice.',
    };

    setTriageResult(result);
    setProcessing(false);
    setCallDuration(Math.round(callDuration));
  };

  const simulateRiskAssessment = (answers: string[]): string => {
    // Simple logic: higher danger signs = higher risk
    const dangerSignAnswer = answers[4];

    if (dangerSignAnswer === '1' || dangerSignAnswer === '2' || dangerSignAnswer === '3' || dangerSignAnswer === '4') {
      return 'RED';
    }

    // Fever + long duration = ORANGE
    if (answers[1] === '1' && (answers[2] === '3' || answers[2] === '4')) {
      return 'ORANGE';
    }

    // Default to YELLOW or GREEN
    return Math.random() > 0.5 ? 'YELLOW' : 'GREEN';
  };

  const endCall = () => {
    setCallActive(false);
    setCurrentStep(0);
    setSelectedAnswers([]);
    setTriageResult(null);
    setCallDuration(0);
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getRiskTierColor = (tier: string): 'error' | 'warning' | 'info' | 'success' => {
    const colors: { [key: string]: 'error' | 'warning' | 'info' | 'success' } = {
      RED: 'error',
      ORANGE: 'warning',
      YELLOW: 'warning',
      GREEN: 'success',
    };
    return colors[tier] || 'info';
  };

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', p: 3 }}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom sx={{ mb: 2 }}>
            <Phone sx={{ mr: 1, verticalAlign: 'middle' }} />
            FirstLine Voice Triage Demo
          </Typography>

          {/* Call Status */}
          <Box
            sx={{
              p: 2,
              bgcolor: callActive ? '#e3f2fd' : '#f5f5f5',
              borderRadius: 1,
              mb: 2,
              textAlign: 'center',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
              {callActive && <Phone sx={{ animation: 'pulse 2s infinite' }} />}
              <Typography variant="subtitle1">
                {callActive
                  ? `Call Active - ${formatDuration(callDuration)}`
                  : triageResult
                    ? 'Call Completed'
                    : 'Call Ready'}
              </Typography>
            </Box>
          </Box>

          {/* Main IVR UI */}
          {callActive && !triageResult && (
            <Box>
              {/* Current Prompt */}
              <Box sx={{ mb: 3, p: 2, bgcolor: '#fff3e0', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <VolumeUp color="warning" />
                  <Typography variant="body2" color="textSecondary">
                    IVR System
                  </Typography>
                </Box>
                <Typography variant="h6">{ivrScript[currentStep].prompt}</Typography>
              </Box>

              {/* Options */}
              {ivrScript[currentStep].options && (
                <Grid container spacing={1} sx={{ mb: 2 }}>
                  {ivrScript[currentStep].options!.map((option) => (
                    <Grid item xs={12} key={option.key}>
                      <Button
                        fullWidth
                        variant="outlined"
                        onClick={() => selectOption(option.key)}
                        disabled={processing}
                        sx={{
                          justifyContent: 'flex-start',
                          textAlign: 'left',
                          p: 1.5,
                        }}
                      >
                        <Typography sx={{ mr: 1, fontWeight: 'bold' }}>Press {option.key}</Typography>
                        {option.label}
                      </Button>
                    </Grid>
                  ))}
                </Grid>
              )}

              {/* Progress */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="textSecondary">
                  Question {currentStep + 1} of {ivrScript.length}
                </Typography>
                <LinearProgress variant="determinate" value={((currentStep + 1) / ivrScript.length) * 100} />
              </Box>
            </Box>
          )}

          {/* Processing State */}
          {processing && (
            <Box sx={{ textAlign: 'center', p: 2 }}>
              <LinearProgress sx={{ mb: 2 }} />
              <Typography variant="body2" color="textSecondary">
                Analyzing triage data...
              </Typography>
            </Box>
          )}

          {/* Results */}
          {triageResult && (
            <Box>
              <Alert severity="success" sx={{ mb: 2 }}>
                ✅ Triage Assessment Complete
              </Alert>

              {/* Risk Tier */}
              <Box sx={{ mb: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                  Risk Assessment
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Chip
                    label={triageResult.riskTier}
                    color={getRiskTierColor(triageResult.riskTier)}
                    variant="filled"
                    size="medium"
                    sx={{ fontSize: '1.1rem', fontWeight: 'bold' }}
                  />
                  <Typography variant="body2">{triageResult.ageGroup} patient</Typography>
                </Box>
              </Box>

              {/* Patient Summary */}
              <Box sx={{ mb: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                  Assessment Summary
                </Typography>
                <Typography variant="body2">
                  <strong>Symptoms:</strong> {triageResult.symptoms.join(', ')}
                </Typography>
                <Typography variant="body2">
                  <strong>Duration:</strong> {triageResult.duration}
                </Typography>
              </Box>

              {/* Recommendations */}
              <Box sx={{ mb: 2, p: 2, bgcolor: '#e8f5e9', borderRadius: 1 }}>
                <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                  Recommended Actions
                </Typography>
                {triageResult.recommendations.map((rec: string, idx: number) => (
                  <Typography key={idx} variant="body2" sx={{ mb: 1, pl: 1 }}>
                    • {rec}
                  </Typography>
                ))}
              </Box>

              {/* SMS Notification */}
              <Alert severity="info" sx={{ mb: 2 }}>
                📱 SMS with results sent to caller's phone
              </Alert>

              {/* Disclaimer */}
              <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 2 }}>
                ⚠️ {triageResult.disclaimer}
              </Typography>

              {/* Call Stats */}
              <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 1, mb: 2 }}>
                <Typography variant="caption" color="textSecondary">
                  Call Duration: {formatDuration(callDuration)}
                </Typography>
              </Box>
            </Box>
          )}

          {/* Actions */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            {!callActive && !triageResult && (
              <Button variant="contained" color="success" fullWidth startIcon={<Phone />} onClick={startCall}>
                Start Call
              </Button>
            )}

            {(callActive || triageResult) && (
              <>
                {callActive && !triageResult && (
                  <Button variant="outlined" color="error" fullWidth startIcon={<PhoneOff />} onClick={endCall}>
                    End Call
                  </Button>
                )}
                {triageResult && (
                  <Button variant="contained" fullWidth onClick={() => endCall()}>
                    Start New Call
                  </Button>
                )}
              </>
            )}
          </Box>

          {/* Demo Info */}
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="caption">
              This is a simulated IVR demo. In production, this integrates with Africa's Talking toll-free numbers
              and performs real triage via MedGemma AI. SMS notifications are sent automatically.
            </Typography>
          </Alert>
        </CardContent>
      </Card>
    </Box>
  );
};

export default IVRDemo;
