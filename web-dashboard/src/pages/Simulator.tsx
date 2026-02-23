import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Paper,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { Mic, MicOff, Stop } from '@mui/icons-material';
import { kaggleApi } from '../services/api';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 2 }}>{children}</Box>}
    </div>
  );
}

export default function Simulator() {
  const [tabValue, setTabValue] = useState(0);
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [labResults, setLabResults] = useState({
    wbc: '',
    hemoglobin: '',
    temperature: '',
    crp: '',
    bloodPressure: '',
    lactate: '',
  });

  // Referral state
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState('');
  const [referralGenerating, setReferralGenerating] = useState(false);

  // Voice simulator state
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Initialize Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            setVoiceTranscript((prev) => prev + transcript);
          } else {
            interim += transcript;
          }
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        setError(`Voice recognition error: ${event.error}`);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const handleStartVoiceRecording = () => {
    if (recognitionRef.current) {
      setVoiceTranscript('');
      setError(null);
      recognitionRef.current.start();
      setIsListening(true);
    } else {
      setError('Web Speech API not supported in your browser. Please use Chrome, Edge, or Safari.');
    }
  };

  const handleStopVoiceRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const parseVoiceInput = (transcript: string) => {
    // Simple parsing logic - user should say something like "I am 45 years old, male, with fever and cough"
    const lower = transcript.toLowerCase();

    // Parse age (look for numbers)
    const ageMatch = transcript.match(/\b(\d{1,3})\s*(?:years|year old|yo|yrs)\b/i);
    const parsedAge = ageMatch ? ageMatch[1] : '';

    // Parse sex/gender
    const isMale = /\b(male|man|boy|he)\b/i.test(lower);
    const isFemale = /\b(female|woman|girl|she)\b/i.test(lower);
    const parsedSex = isMale ? 'M' : isFemale ? 'F' : '';

    return { parsedAge, parsedSex, symptoms: transcript };
  };

  const handleRunVoiceSimulation = async () => {
    if (!voiceTranscript) {
      setError('No voice input detected. Please record your speech first.');
      return;
    }

    const { parsedAge, parsedSex, symptoms } = parseVoiceInput(voiceTranscript);

    if (!parsedAge || !parsedSex) {
      setError('Could not parse age and sex from voice input. Please mention your age and gender clearly.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const result = await kaggleApi.infer({
        symptoms,
        age: parseInt(parsedAge),
        sex: parsedSex,
      });
      setResult(result);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to run triage assessment');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setResult(null);
    setError(null);
  };

  const handleRunSimulation = async () => {
    if (!age || !sex || !symptoms) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Build lab object only if fields are filled
      const labData: any = {};
      if (labResults.wbc) labData.wbc = parseFloat(labResults.wbc);
      if (labResults.hemoglobin) labData.hemoglobin = parseFloat(labResults.hemoglobin);
      if (labResults.temperature) labData.temperature = parseFloat(labResults.temperature);
      if (labResults.bloodPressure) labData.bloodPressure = labResults.bloodPressure;
      if (labResults.crp) labData.crp = parseFloat(labResults.crp);
      if (labResults.lactate) labData.lactate = parseFloat(labResults.lactate);

      const result = await kaggleApi.infer({
        symptoms,
        age: parseInt(age),
        sex,
        labResults: Object.keys(labData).length > 0 ? labData : undefined,
      });
      setResult(result);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to run triage assessment');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setAge('');
    setSex('');
    setSymptoms('');
    setLabResults({
      wbc: '',
      hemoglobin: '',
      temperature: '',
      crp: '',
      bloodPressure: '',
      lactate: '',
    });
    setResult(null);
    setError(null);
  };

  const generateSOAPReferral = async () => {
    if (!selectedHospital) {
      alert('Please select a hospital');
      return;
    }

    setReferralGenerating(true);
    try {
      // Generate SOAP formatted referral
      const soapContent = `
REFERRAL DOCUMENT
================

FACILITY: ${selectedHospital}
DATE: ${new Date().toLocaleDateString()}
TIME: ${new Date().toLocaleTimeString()}

PATIENT DEMOGRAPHICS
Age: ${age} years
Sex: ${sex === 'M' ? 'Male' : 'Female'}

SUBJECTIVE
Chief Complaint: ${symptoms}

OBJECTIVE
Temperature: ${labResults.temperature ? labResults.temperature + '°C' : 'Not recorded'}
WBC: ${labResults.wbc ? labResults.wbc + ' K/μL' : 'Not recorded'}
Blood Pressure: ${labResults.bloodPressure || 'Not recorded'}
CRP: ${labResults.crp ? labResults.crp + ' mg/L' : 'Not recorded'}

ASSESSMENT
Risk Tier: ${result.riskTier}
Confidence Level: ${result.uncertainty}

Primary Diagnosis:
${result.diagnosisSuggestions?.[0]?.condition || 'Unknown'}
Confidence: ${result.diagnosisSuggestions?.[0]?.confidence ? Math.round(result.diagnosisSuggestions[0].confidence * 100) + '%' : 'N/A'}
Reasoning: ${result.diagnosisSuggestions?.[0]?.reasoning || 'N/A'}

Differential Diagnoses:
${result.diagnosisSuggestions?.slice(1).map((d: any) => `- ${d.condition} (${Math.round(d.confidence * 100)}%)`).join('\n') || 'None'}

Danger Signs:
${result.dangerSigns?.length > 0 ? result.dangerSigns.map((s: string) => `- ${s}`).join('\n') : '- None identified'}

Watch-outs:
${result.watchOuts?.length > 0 ? result.watchOuts.map((w: string) => `- ${w}`).join('\n') : '- None'}

PLAN
Recommended Next Steps:
${result.recommendedNextSteps?.map((step: string) => `- ${step}`).join('\n') || '- Seek medical evaluation'}

Referral Recommended: ${result.referralRecommended ? 'YES' : 'NO'}

Follow-up Questions to Ask Patient:
${result.followupQuestions?.map((q: string) => `- ${q}`).join('\n') || '- None'}

---
Generated by FirstLine Clinical Triage System
This is a clinical support document, not a diagnosis.
      `;

      // Create downloadable file
      const element = document.createElement('a');
      const file = new Blob([soapContent], { type: 'text/plain' });
      element.href = URL.createObjectURL(file);
      element.download = `referral_${age}yo_${new Date().getTime()}.txt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);

      setShowReferralModal(false);
      alert('Referral document generated and downloaded successfully!');
    } catch (err) {
      alert('Error generating referral: ' + err);
    } finally {
      setReferralGenerating(false);
    }
  };

  return (
    <Box sx={{ pb: 4 }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
        Clinical Triage Simulator
      </Typography>

      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="simulator tabs"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="USSD/SMS Simulator" id="tab-0" aria-controls="tabpanel-0" />
          <Tab label="Voice Simulator" id="tab-1" aria-controls="tabpanel-1" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <Box sx={{ maxWidth: 500 }}>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
              Simulate a USSD/SMS triage interaction. Enter patient details to test the system.
            </Typography>

            <Stack spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Age</InputLabel>
                <Select
                  value={age}
                  label="Age"
                  onChange={(e) => setAge(e.target.value)}
                >
                  {Array.from({ length: 101 }, (_, i) => (
                    <MenuItem key={i} value={i.toString()}>
                      {i} years
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel>Sex</InputLabel>
                <Select
                  value={sex}
                  label="Sex"
                  onChange={(e) => setSex(e.target.value)}
                >
                  <MenuItem value="M">Male</MenuItem>
                  <MenuItem value="F">Female</MenuItem>
                </Select>
              </FormControl>

              <TextField
                fullWidth
                multiline
                rows={4}
                label="Symptoms (describe what patient reports)"
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="e.g., Fever, cough, and difficulty breathing for 3 days"
              />

              <Box sx={{ mt: 3, p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>Optional: Lab Results</Typography>
                <Stack spacing={1}>
                  <TextField
                    fullWidth
                    size="small"
                    label="WBC (K/μL)"
                    type="number"
                    value={labResults.wbc}
                    onChange={(e) => setLabResults({...labResults, wbc: e.target.value})}
                    placeholder="e.g., 15000"
                  />
                  <TextField
                    fullWidth
                    size="small"
                    label="Hemoglobin (g/dL)"
                    type="number"
                    value={labResults.hemoglobin}
                    onChange={(e) => setLabResults({...labResults, hemoglobin: e.target.value})}
                    placeholder="e.g., 12"
                  />
                  <TextField
                    fullWidth
                    size="small"
                    label="Temperature (°C)"
                    type="number"
                    value={labResults.temperature}
                    onChange={(e) => setLabResults({...labResults, temperature: e.target.value})}
                    placeholder="e.g., 39.5"
                  />
                  <TextField
                    fullWidth
                    size="small"
                    label="Blood Pressure"
                    value={labResults.bloodPressure}
                    onChange={(e) => setLabResults({...labResults, bloodPressure: e.target.value})}
                    placeholder="e.g., 120/80"
                  />
                </Stack>
              </Box>

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleRunSimulation}
                  disabled={loading || !age || !sex || !symptoms}
                  fullWidth
                >
                  {loading ? <CircularProgress size={24} /> : 'Run Triage Assessment'}
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleReset}
                >
                  Reset
                </Button>
              </Box>
            </Stack>
          </Box>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Box sx={{ maxWidth: 500 }}>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
              Simulate a voice call triage interaction. Press the microphone button to start speaking.
              Say something like: "I am 35 years old, female, and I have fever, cough, and difficulty breathing for 3 days."
            </Typography>

            <Stack spacing={2}>
              <Alert severity="info">
                Available in Chrome, Edge, Safari, and Firefox. Using Web Speech API for speech recognition.
              </Alert>

              <Box sx={{
                display: 'flex',
                gap: 1,
                justifyContent: 'center',
                py: 2
              }}>
                <Button
                  variant="contained"
                  color={isListening ? 'error' : 'primary'}
                  startIcon={isListening ? <MicOff /> : <Mic />}
                  onClick={isListening ? handleStopVoiceRecording : handleStartVoiceRecording}
                  size="large"
                >
                  {isListening ? 'Stop Recording' : 'Start Recording'}
                </Button>
              </Box>

              {isListening && (
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 1,
                  backgroundColor: '#f0f0f0',
                  borderRadius: 1
                }}>
                  <CircularProgress size={20} />
                  <Typography variant="body2" color="textSecondary">
                    Listening...
                  </Typography>
                </Box>
              )}

              {voiceTranscript && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                    Transcribed Speech:
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={4}
                    value={voiceTranscript}
                    onChange={(e) => setVoiceTranscript(e.target.value)}
                    variant="outlined"
                    helperText="You can edit the text above before submitting"
                  />
                </Box>
              )}

              {voiceTranscript && (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleRunVoiceSimulation}
                    disabled={loading || !voiceTranscript}
                    fullWidth
                  >
                    {loading ? <CircularProgress size={24} /> : 'Run Triage Assessment'}
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => setVoiceTranscript('')}
                  >
                    Clear
                  </Button>
                </Box>
              )}
            </Stack>
          </Box>
        </TabPanel>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {result && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Triage Result
            </Typography>

            <Box sx={{ mb: 2 }}>
              <Typography color="textSecondary">Risk Tier:</Typography>
              <Typography
                variant="h5"
                sx={{
                  color:
                    result.riskTier === 'RED'
                      ? '#F44336'
                      : result.riskTier === 'YELLOW'
                      ? '#FF9800'
                      : '#4CAF50',
                  fontWeight: 'bold',
                }}
              >
                {result.riskTier}
              </Typography>
            </Box>

            {result.diagnosisSuggestions && result.diagnosisSuggestions.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography color="textSecondary">Diagnosis Suggestions:</Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {result.diagnosisSuggestions.map((diag: any, idx: number) => (
                    <Card key={idx} sx={{ p: 2, backgroundColor: '#f9f9f9', border: '1px solid #e0e0e0' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                            {diag.condition}
                          </Typography>
                          <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                            {diag.reasoning}
                          </Typography>
                        </Box>
                        <Chip
                          label={`${Math.round(diag.confidence * 100)}%`}
                          color={diag.confidence > 0.7 ? 'error' : diag.confidence > 0.4 ? 'warning' : 'default'}
                          variant="filled"
                          sx={{ ml: 1 }}
                        />
                      </Box>
                    </Card>
                  ))}
                </Stack>
              </Box>
            )}

            {result.dangerSigns && result.dangerSigns.length > 0 && (
              <Box sx={{ mb: 2, p: 1.5, backgroundColor: '#FFEBEE', borderLeft: '4px solid #F44336', borderRadius: 1 }}>
                <Typography color="error" sx={{ fontWeight: 'bold', mb: 1 }}>🚨 DANGER SIGNS:</Typography>
                <ul style={{ margin: '0px', paddingLeft: '20px' }}>
                  {result.dangerSigns.map((sign: string, idx: number) => (
                    <li key={idx} style={{ marginBottom: '4px', color: '#C62828' }}>{sign}</li>
                  ))}
                </ul>
              </Box>
            )}

            {result.watchOuts && result.watchOuts.length > 0 && (
              <Box sx={{ mb: 2, p: 1.5, backgroundColor: '#FFF3E0', borderLeft: '4px solid #FF9800', borderRadius: 1 }}>
                <Typography sx={{ fontWeight: 'bold', mb: 1, color: '#E65100' }}>⚠️ WATCH-OUTS:</Typography>
                <ul style={{ margin: '0px', paddingLeft: '20px' }}>
                  {result.watchOuts.map((warning: string, idx: number) => (
                    <li key={idx} style={{ marginBottom: '4px', color: '#E65100' }}>{warning}</li>
                  ))}
                </ul>
              </Box>
            )}

            {result.followupQuestions && result.followupQuestions.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography color="textSecondary" sx={{ mt: 2, fontWeight: 'bold' }}>❓ Follow-up Questions:</Typography>
                <ul style={{ marginTop: '8px' }}>
                  {result.followupQuestions.map((q: string, idx: number) => (
                    <li key={idx} style={{ marginBottom: '4px' }}>{q}</li>
                  ))}
                </ul>
              </Box>
            )}

            <Box sx={{ mb: 2 }}>
              <Typography color="textSecondary" sx={{ fontWeight: 'bold' }}>📋 Recommended Next Steps:</Typography>
              <ul>
                {Array.isArray(result.recommendedNextSteps) &&
                  result.recommendedNextSteps.map((step: string, idx: number) => (
                    <li key={idx}>{step}</li>
                  ))}
              </ul>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography color="textSecondary" sx={{ fontWeight: 'bold' }}>💭 AI Reasoning:</Typography>
              <Typography variant="body2" sx={{ p: 1, backgroundColor: '#f5f5f5', borderRadius: 1, mt: 1 }}>
                {result.reasoning}
              </Typography>
            </Box>

            <Alert severity="info" sx={{ mb: 2 }}>{result.disclaimer}</Alert>

            <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
              <Button
                variant="contained"
                color="primary"
                onClick={() => setShowReferralModal(true)}
                fullWidth
              >
                📄 Create & Download Referral (SOAP)
              </Button>
              <Button
                variant="outlined"
                onClick={handleReset}
              >
                Start Over
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Referral Modal Dialog */}
      <Dialog open={showReferralModal} onClose={() => setShowReferralModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Generate Referral Document</DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <FormControl fullWidth>
            <InputLabel>Select Hospital/Facility</InputLabel>
            <Select
              value={selectedHospital}
              label="Select Hospital/Facility"
              onChange={(e) => setSelectedHospital(e.target.value)}
            >
              <MenuItem value="City General Hospital">City General Hospital</MenuItem>
              <MenuItem value="Rural Health Center">Rural Health Center</MenuItem>
              <MenuItem value="District Medical College">District Medical College</MenuItem>
              <MenuItem value="Primary Health Center (PHC)">Primary Health Center (PHC)</MenuItem>
              <MenuItem value="Community Health Center (CHC)">Community Health Center (CHC)</MenuItem>
              <MenuItem value="Tertiary Care Hospital">Tertiary Care Hospital</MenuItem>
              <MenuItem value="Private Clinic">Private Clinic</MenuItem>
              <MenuItem value="Emergency Care Unit">Emergency Care Unit</MenuItem>
            </Select>
          </FormControl>
          <Alert severity="info" sx={{ mt: 2 }}>
            The referral will be generated in SOAP format (Subjective, Objective, Assessment, Plan) and downloaded as a text file.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowReferralModal(false)}>Cancel</Button>
          <Button
            onClick={generateSOAPReferral}
            variant="contained"
            disabled={!selectedHospital || referralGenerating}
          >
            {referralGenerating ? <CircularProgress size={20} /> : '📄 Generate & Download'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
