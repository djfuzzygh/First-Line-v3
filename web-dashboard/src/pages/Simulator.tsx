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
import { Mic, MicOff } from '@mui/icons-material';
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

  // Follow-up questions state
  const [followupAnswers, setFollowupAnswers] = useState<string[]>([]);
  const [followupRound, setFollowupRound] = useState(0);

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
    const lower = transcript.toLowerCase();
    const ageMatch = transcript.match(/\b(\d{1,3})\s*(?:years|year old|yo|yrs)\b/i);
    const parsedAge = ageMatch ? ageMatch[1] : '';
    const isMale = /\b(male|man|boy|he)\b/i.test(lower);
    const isFemale = /\b(female|woman|girl|she)\b/i.test(lower);
    const parsedSex = isMale ? 'M' : isFemale ? 'F' : '';
    return { parsedAge, parsedSex, symptoms: transcript };
  };

  const runInference = async (
    inferSymptoms: string,
    inferAge: number,
    inferSex: string,
    inferLabResults?: any,
    followupResponses?: string[]
  ) => {
    setLoading(true);
    setError(null);

    try {
      const res = await kaggleApi.infer({
        symptoms: inferSymptoms,
        age: inferAge,
        sex: inferSex,
        followupResponses: followupResponses && followupResponses.length > 0 ? followupResponses : undefined,
        labResults: inferLabResults && Object.keys(inferLabResults).length > 0 ? inferLabResults : undefined,
      });
      setResult(res);

      // Initialize follow-up answer fields
      if (res.followupQuestions && res.followupQuestions.length > 0) {
        if (!followupResponses || followupResponses.length === 0) {
          setFollowupAnswers(res.followupQuestions.map(() => ''));
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to run triage assessment');
    } finally {
      setLoading(false);
    }
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

    setResult(null);
    setFollowupAnswers([]);
    setFollowupRound(0);
    await runInference(symptoms, parseInt(parsedAge), parsedSex);
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setResult(null);
    setError(null);
    setFollowupAnswers([]);
    setFollowupRound(0);
  };

  const handleRunSimulation = async () => {
    if (!age || !sex || !symptoms) {
      setError('Please fill in all fields');
      return;
    }

    setResult(null);
    setFollowupAnswers([]);
    setFollowupRound(0);

    // Build lab object only if fields are filled
    const labData: any = {};
    if (labResults.wbc) labData.wbc = parseFloat(labResults.wbc);
    if (labResults.hemoglobin) labData.hemoglobin = parseFloat(labResults.hemoglobin);
    if (labResults.temperature) labData.temperature = parseFloat(labResults.temperature);
    if (labResults.bloodPressure) labData.bloodPressure = labResults.bloodPressure;
    if (labResults.crp) labData.crp = parseFloat(labResults.crp);
    if (labResults.lactate) labData.lactate = parseFloat(labResults.lactate);

    await runInference(symptoms, parseInt(age), sex, labData);
  };

  const handleSubmitFollowups = async () => {
    const answered = followupAnswers.filter((a) => a.trim() !== '');
    if (answered.length === 0) {
      setError('Please answer at least one follow-up question before resubmitting.');
      return;
    }

    setFollowupRound((prev) => prev + 1);

    // Build follow-up context string
    const followupContext = result.followupQuestions
      .map((q: string, i: number) => {
        const answer = followupAnswers[i]?.trim();
        return answer ? `Q: ${q} A: ${answer}` : null;
      })
      .filter(Boolean)
      .join('; ');

    // Build lab data
    const labData: any = {};
    if (labResults.wbc) labData.wbc = parseFloat(labResults.wbc);
    if (labResults.hemoglobin) labData.hemoglobin = parseFloat(labResults.hemoglobin);
    if (labResults.temperature) labData.temperature = parseFloat(labResults.temperature);
    if (labResults.bloodPressure) labData.bloodPressure = labResults.bloodPressure;
    if (labResults.crp) labData.crp = parseFloat(labResults.crp);
    if (labResults.lactate) labData.lactate = parseFloat(labResults.lactate);

    await runInference(
      symptoms,
      parseInt(age),
      sex,
      labData,
      [followupContext]
    );
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
    setFollowupAnswers([]);
    setFollowupRound(0);
  };

  const generateSOAPReferral = async () => {
    if (!selectedHospital) {
      alert('Please select a hospital');
      return;
    }

    setReferralGenerating(true);
    try {
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
Temperature: ${labResults.temperature ? labResults.temperature + ' C' : 'Not recorded'}
WBC: ${labResults.wbc ? labResults.wbc + ' K/uL' : 'Not recorded'}
Hemoglobin: ${labResults.hemoglobin ? labResults.hemoglobin + ' g/dL' : 'Not recorded'}
Blood Pressure: ${labResults.bloodPressure || 'Not recorded'}
CRP: ${labResults.crp ? labResults.crp + ' mg/L' : 'Not recorded'}
Lactate: ${labResults.lactate ? labResults.lactate + ' mmol/L' : 'Not recorded'}

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

Follow-up Questions Asked:
${result.followupQuestions?.map((q: string) => `- ${q}`).join('\n') || '- None'}

---
Generated by FirstLine Clinical Triage System
This is a clinical support document, not a diagnosis.
      `;

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
          <Box sx={{ maxWidth: 600 }}>
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
                    label="WBC (K/uL)"
                    type="number"
                    value={labResults.wbc}
                    onChange={(e) => setLabResults({...labResults, wbc: e.target.value})}
                    placeholder="e.g., 7.2"
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
                    label="Temperature (C)"
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
                  <TextField
                    fullWidth
                    size="small"
                    label="CRP (mg/L)"
                    type="number"
                    value={labResults.crp}
                    onChange={(e) => setLabResults({...labResults, crp: e.target.value})}
                    placeholder="e.g., 45"
                  />
                  <TextField
                    fullWidth
                    size="small"
                    label="Lactate (mmol/L)"
                    type="number"
                    value={labResults.lactate}
                    onChange={(e) => setLabResults({...labResults, lactate: e.target.value})}
                    placeholder="e.g., 1.5"
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
                  {loading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CircularProgress size={20} color="inherit" />
                      <span>Analyzing...</span>
                    </Box>
                  ) : (
                    'Run Triage Assessment'
                  )}
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
                    {loading ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={20} color="inherit" />
                        <span>Analyzing...</span>
                      </Box>
                    ) : (
                      'Run Triage Assessment'
                    )}
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
            {result.source && (
              <Chip label={`Source: ${result.source}`} size="small" sx={{ mb: 2 }} />
            )}

            {/* Risk Tier */}
            <Box sx={{ mb: 2, p: 2, borderRadius: 2, backgroundColor:
              result.riskTier === 'RED' ? '#FFEBEE' :
              result.riskTier === 'YELLOW' ? '#FFF8E1' : '#E8F5E9'
            }}>
              <Typography color="textSecondary">Risk Tier:</Typography>
              <Typography
                variant="h5"
                sx={{
                  color:
                    result.riskTier === 'RED' ? '#F44336' :
                    result.riskTier === 'YELLOW' ? '#FF9800' : '#4CAF50',
                  fontWeight: 'bold',
                }}
              >
                {result.riskTier}
                {result.referralRecommended && (
                  <Chip label="Referral Recommended" color="warning" size="small" sx={{ ml: 2, verticalAlign: 'middle' }} />
                )}
              </Typography>
            </Box>

            {/* Diagnosis Suggestions */}
            {result.diagnosisSuggestions && result.diagnosisSuggestions.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography color="textSecondary">Diagnosis Suggestions:</Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {result.diagnosisSuggestions.map((diag: any, idx: number) => (
                    <Card key={idx} sx={{ p: 2, backgroundColor: '#f9f9f9', border: '1px solid #e0e0e0' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                            {idx + 1}. {diag.condition}
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

            {/* Danger Signs */}
            {result.dangerSigns && result.dangerSigns.length > 0 && (
              <Alert severity="error" sx={{ mb: 2 }}>
                <Typography sx={{ fontWeight: 'bold', mb: 1 }}>DANGER SIGNS:</Typography>
                <ul style={{ margin: '0px', paddingLeft: '20px' }}>
                  {result.dangerSigns.map((sign: string, idx: number) => (
                    <li key={idx} style={{ marginBottom: '4px' }}>{sign}</li>
                  ))}
                </ul>
              </Alert>
            )}

            {/* Watch-Outs */}
            {result.watchOuts && result.watchOuts.length > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography sx={{ fontWeight: 'bold', mb: 1 }}>WATCH-OUTS:</Typography>
                <ul style={{ margin: '0px', paddingLeft: '20px' }}>
                  {result.watchOuts.map((warning: string, idx: number) => (
                    <li key={idx} style={{ marginBottom: '4px' }}>{warning}</li>
                  ))}
                </ul>
              </Alert>
            )}

            {/* Follow-up Questions with Answer Fields */}
            {result.followupQuestions && result.followupQuestions.length > 0 && (
              <Card sx={{ mb: 2, border: '2px solid #1976d2' }}>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1, color: '#1976d2' }}>
                    Follow-up Questions (Round {followupRound + 1})
                  </Typography>
                  <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    Answer below and click "Resubmit" to refine the assessment with additional information.
                  </Typography>
                  <Stack spacing={2}>
                    {result.followupQuestions.map((question: string, idx: number) => (
                      <Box key={idx}>
                        <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                          Q{idx + 1}: {question}
                        </Typography>
                        <TextField
                          fullWidth
                          size="small"
                          placeholder="Type your answer here..."
                          value={followupAnswers[idx] || ''}
                          onChange={(e) => {
                            const newAnswers = [...followupAnswers];
                            newAnswers[idx] = e.target.value;
                            setFollowupAnswers(newAnswers);
                          }}
                          variant="outlined"
                        />
                      </Box>
                    ))}
                  </Stack>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleSubmitFollowups}
                    disabled={loading}
                    sx={{ mt: 2 }}
                    fullWidth
                  >
                    {loading ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={20} color="inherit" />
                        <span>Refining Assessment...</span>
                      </Box>
                    ) : (
                      'Resubmit with Follow-up Answers'
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Recommended Next Steps */}
            <Box sx={{ mb: 2 }}>
              <Typography color="textSecondary" sx={{ fontWeight: 'bold' }}>Recommended Next Steps:</Typography>
              <ul>
                {Array.isArray(result.recommendedNextSteps) &&
                  result.recommendedNextSteps.map((step: string, idx: number) => (
                    <li key={idx}>{step}</li>
                  ))}
              </ul>
            </Box>

            {/* AI Reasoning */}
            <Box sx={{ mb: 2 }}>
              <Typography color="textSecondary" sx={{ fontWeight: 'bold' }}>AI Reasoning:</Typography>
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
                Create & Download Referral (SOAP)
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
            {referralGenerating ? <CircularProgress size={20} /> : 'Generate & Download'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
