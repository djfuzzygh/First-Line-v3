import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Alert,
  Divider,
  CircularProgress,
  Card,
  CardContent,
  Stack,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { kaggleApi } from '../services/api';

export default function NewEncounter() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Patient demographics
  const [formData, setFormData] = useState({
    age: '',
    sex: 'M' as 'M' | 'F' | 'O',
    location: '',
    symptoms: '',
  });

  // Vital signs
  const [vitals, setVitals] = useState({
    temperature: '',
    pulse: '',
    bloodPressure: '',
    respiratoryRate: '',
  });

  // Lab results
  const [labResults, setLabResults] = useState({
    wbc: '',
    hemoglobin: '',
    crp: '',
    lactate: '',
    glucose: '',
  });

  // Triage result
  const [triageResult, setTriageResult] = useState<any>(null);

  // Follow-up questions state
  const [followupAnswers, setFollowupAnswers] = useState<string[]>([]);
  const [followupRound, setFollowupRound] = useState(0);

  // Referral state
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState('');
  const [referralGenerating, setReferralGenerating] = useState(false);

  const handleChange = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runTriage();
  };

  const runTriage = async (additionalFollowups?: string[]) => {
    setError('');
    setLoading(true);

    try {
      // Build lab + vitals object
      const labData: any = {};
      if (vitals.temperature) labData.temperature = parseFloat(vitals.temperature);
      if (vitals.bloodPressure) labData.bloodPressure = vitals.bloodPressure;
      if (labResults.wbc) labData.wbc = parseFloat(labResults.wbc);
      if (labResults.hemoglobin) labData.hemoglobin = parseFloat(labResults.hemoglobin);
      if (labResults.crp) labData.crp = parseFloat(labResults.crp);
      if (labResults.lactate) labData.lactate = parseFloat(labResults.lactate);

      // Gather all follow-up responses
      const allFollowups = additionalFollowups || followupAnswers;

      const result = await kaggleApi.infer({
        symptoms: formData.symptoms,
        age: parseInt(formData.age),
        sex: formData.sex,
        location: formData.location,
        followupResponses: allFollowups.length > 0 ? allFollowups : undefined,
        labResults: Object.keys(labData).length > 0 ? labData : undefined,
      });

      setTriageResult(result);

      // If follow-up questions returned, set up empty answer fields
      if (result.followupQuestions && result.followupQuestions.length > 0) {
        // Only initialize fresh answers if this is a new round
        if (!additionalFollowups || additionalFollowups.length === 0) {
          setFollowupAnswers(result.followupQuestions.map(() => ''));
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to run triage assessment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitFollowups = async () => {
    // Validate at least one follow-up is answered
    const answered = followupAnswers.filter((a) => a.trim() !== '');
    if (answered.length === 0) {
      setError('Please answer at least one follow-up question before resubmitting.');
      return;
    }

    setFollowupRound((prev) => prev + 1);

    // Build a combined symptom description with follow-up context
    const followupContext = triageResult.followupQuestions
      .map((q: string, i: number) => {
        const answer = followupAnswers[i]?.trim();
        return answer ? `Q: ${q} A: ${answer}` : null;
      })
      .filter(Boolean)
      .join('; ');

    // Re-run triage with follow-up answers
    await runTriage([followupContext]);
  };

  const handleReset = () => {
    setFormData({ age: '', sex: 'M', location: '', symptoms: '' });
    setVitals({ temperature: '', pulse: '', bloodPressure: '', respiratoryRate: '' });
    setLabResults({ wbc: '', hemoglobin: '', crp: '', lactate: '', glucose: '' });
    setTriageResult(null);
    setFollowupAnswers([]);
    setFollowupRound(0);
    setError('');
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
Age: ${formData.age} years
Sex: ${formData.sex === 'M' ? 'Male' : formData.sex === 'F' ? 'Female' : 'Other'}
Location: ${formData.location || 'Not specified'}

SUBJECTIVE
Chief Complaint: ${formData.symptoms}

OBJECTIVE
Vital Signs:
  Temperature: ${vitals.temperature ? vitals.temperature + ' C' : 'Not recorded'}
  Pulse: ${vitals.pulse ? vitals.pulse + ' bpm' : 'Not recorded'}
  Blood Pressure: ${vitals.bloodPressure || 'Not recorded'}
  Respiratory Rate: ${vitals.respiratoryRate ? vitals.respiratoryRate + ' /min' : 'Not recorded'}

Lab Results:
  WBC: ${labResults.wbc ? labResults.wbc + ' K/uL' : 'Not recorded'}
  Hemoglobin: ${labResults.hemoglobin ? labResults.hemoglobin + ' g/dL' : 'Not recorded'}
  CRP: ${labResults.crp ? labResults.crp + ' mg/L' : 'Not recorded'}
  Lactate: ${labResults.lactate ? labResults.lactate + ' mmol/L' : 'Not recorded'}

ASSESSMENT
Risk Tier: ${triageResult.riskTier}
Confidence Level: ${triageResult.uncertainty || 'N/A'}

Primary Diagnosis:
${triageResult.diagnosisSuggestions?.[0]?.condition || 'Unknown'}
Confidence: ${triageResult.diagnosisSuggestions?.[0]?.confidence ? Math.round(triageResult.diagnosisSuggestions[0].confidence * 100) + '%' : 'N/A'}
Reasoning: ${triageResult.diagnosisSuggestions?.[0]?.reasoning || 'N/A'}

Differential Diagnoses:
${triageResult.diagnosisSuggestions?.slice(1).map((d: any) => `- ${d.condition} (${Math.round(d.confidence * 100)}%)`).join('\n') || 'None'}

Danger Signs:
${triageResult.dangerSigns?.length > 0 ? triageResult.dangerSigns.map((s: string) => `- ${s}`).join('\n') : '- None identified'}

Watch-outs:
${triageResult.watchOuts?.length > 0 ? triageResult.watchOuts.map((w: string) => `- ${w}`).join('\n') : '- None'}

PLAN
Recommended Next Steps:
${triageResult.recommendedNextSteps?.map((step: string) => `- ${step}`).join('\n') || '- Seek medical evaluation'}

Referral Recommended: ${triageResult.referralRecommended ? 'YES' : 'NO'}

Follow-up Questions Asked:
${triageResult.followupQuestions?.map((q: string) => `- ${q}`).join('\n') || '- None'}

---
Generated by FirstLine Clinical Triage System
This is a clinical support document, not a diagnosis.
      `;

      const element = document.createElement('a');
      const file = new Blob([soapContent], { type: 'text/plain' });
      element.href = URL.createObjectURL(file);
      element.download = `referral_${formData.age}yo_${new Date().getTime()}.txt`;
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
      <Paper sx={{ p: 4, mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          New Patient Encounter
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Enter patient information, symptoms, vital signs, and lab results to begin AI-powered triage assessment
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          {/* Demographics */}
          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            Demographics
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField
                required
                fullWidth
                label="Age"
                type="number"
                value={formData.age}
                onChange={(e) => handleChange('age', e.target.value)}
                inputProps={{ min: 0, max: 120 }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth required>
                <InputLabel>Sex</InputLabel>
                <Select
                  value={formData.sex}
                  label="Sex"
                  onChange={(e) => handleChange('sex', e.target.value)}
                >
                  <MenuItem value="M">Male</MenuItem>
                  <MenuItem value="F">Female</MenuItem>
                  <MenuItem value="O">Other</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Location"
                value={formData.location}
                onChange={(e) => handleChange('location', e.target.value)}
                placeholder="City or Region"
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          {/* Chief Complaint & Symptoms */}
          <Typography variant="h6" gutterBottom>
            Chief Complaint & Symptoms
          </Typography>
          <TextField
            required
            fullWidth
            multiline
            rows={4}
            label="Symptoms"
            value={formData.symptoms}
            onChange={(e) => handleChange('symptoms', e.target.value)}
            placeholder="Describe the patient's symptoms in detail..."
            helperText="Include onset, duration, severity, and any relevant details"
          />

          <Divider sx={{ my: 3 }} />

          {/* Vital Signs */}
          <Typography variant="h6" gutterBottom>
            Vital Signs (Optional)
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                label="Temperature (C)"
                type="number"
                value={vitals.temperature}
                onChange={(e) => setVitals({ ...vitals, temperature: e.target.value })}
                inputProps={{ step: 0.1, min: 30, max: 45 }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                label="Pulse (bpm)"
                type="number"
                value={vitals.pulse}
                onChange={(e) => setVitals({ ...vitals, pulse: e.target.value })}
                inputProps={{ min: 30, max: 250 }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                label="Blood Pressure"
                value={vitals.bloodPressure}
                onChange={(e) => setVitals({ ...vitals, bloodPressure: e.target.value })}
                placeholder="120/80"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                label="Respiratory Rate"
                type="number"
                value={vitals.respiratoryRate}
                onChange={(e) => setVitals({ ...vitals, respiratoryRate: e.target.value })}
                inputProps={{ min: 5, max: 60 }}
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          {/* Lab Results */}
          <Typography variant="h6" gutterBottom>
            Lab Results (Optional)
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                label="WBC (K/uL)"
                type="number"
                value={labResults.wbc}
                onChange={(e) => setLabResults({ ...labResults, wbc: e.target.value })}
                placeholder="e.g., 7.2"
                inputProps={{ step: 0.1 }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                label="Hemoglobin (g/dL)"
                type="number"
                value={labResults.hemoglobin}
                onChange={(e) => setLabResults({ ...labResults, hemoglobin: e.target.value })}
                placeholder="e.g., 12.5"
                inputProps={{ step: 0.1 }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                label="CRP (mg/L)"
                type="number"
                value={labResults.crp}
                onChange={(e) => setLabResults({ ...labResults, crp: e.target.value })}
                placeholder="e.g., 45"
                inputProps={{ step: 0.1 }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                label="Lactate (mmol/L)"
                type="number"
                value={labResults.lactate}
                onChange={(e) => setLabResults({ ...labResults, lactate: e.target.value })}
                placeholder="e.g., 1.5"
                inputProps={{ step: 0.1 }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                label="Glucose (mg/dL)"
                type="number"
                value={labResults.glucose}
                onChange={(e) => setLabResults({ ...labResults, glucose: e.target.value })}
                placeholder="e.g., 95"
                inputProps={{ step: 1 }}
              />
            </Grid>
          </Grid>

          <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={loading || !formData.age || !formData.symptoms}
              sx={{ minWidth: 200 }}
            >
              {loading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={20} color="inherit" />
                  <span>Analyzing with MedGemma...</span>
                </Box>
              ) : (
                'Run AI Triage Assessment'
              )}
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={handleReset}
            >
              Reset All
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Triage Results */}
      {triageResult && (
        <Paper sx={{ p: 4, mb: 3 }}>
          <Typography variant="h5" gutterBottom>
            AI Triage Assessment Results
          </Typography>
          {triageResult.source && (
            <Chip
              label={`Source: ${triageResult.source}`}
              size="small"
              sx={{ mb: 2 }}
              color="default"
            />
          )}

          {/* Risk Tier */}
          <Box sx={{ mb: 3, p: 2, borderRadius: 2, backgroundColor:
            triageResult.riskTier === 'RED' ? '#FFEBEE' :
            triageResult.riskTier === 'YELLOW' ? '#FFF8E1' : '#E8F5E9'
          }}>
            <Typography variant="body2" color="textSecondary">Risk Tier:</Typography>
            <Typography
              variant="h4"
              sx={{
                color:
                  triageResult.riskTier === 'RED' ? '#D32F2F' :
                  triageResult.riskTier === 'YELLOW' ? '#F57F17' : '#2E7D32',
                fontWeight: 'bold',
              }}
            >
              {triageResult.riskTier}
              {triageResult.referralRecommended && (
                <Chip label="Referral Recommended" color="warning" size="small" sx={{ ml: 2, verticalAlign: 'middle' }} />
              )}
            </Typography>
          </Box>

          {/* Diagnosis Suggestions */}
          {triageResult.diagnosisSuggestions && triageResult.diagnosisSuggestions.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>Diagnosis Suggestions</Typography>
              <Stack spacing={1}>
                {triageResult.diagnosisSuggestions.map((diag: any, idx: number) => (
                  <Card key={idx} sx={{ p: 2, backgroundColor: '#f9f9f9', border: '1px solid #e0e0e0' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                          {idx + 1}. {diag.condition}
                        </Typography>
                        <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
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
          {triageResult.dangerSigns && triageResult.dangerSigns.length > 0 && (
            <Alert severity="error" sx={{ mb: 2 }}>
              <Typography sx={{ fontWeight: 'bold', mb: 1 }}>DANGER SIGNS:</Typography>
              <ul style={{ margin: '0px', paddingLeft: '20px' }}>
                {triageResult.dangerSigns.map((sign: string, idx: number) => (
                  <li key={idx} style={{ marginBottom: '4px' }}>{sign}</li>
                ))}
              </ul>
            </Alert>
          )}

          {/* Watch-Outs */}
          {triageResult.watchOuts && triageResult.watchOuts.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography sx={{ fontWeight: 'bold', mb: 1 }}>WATCH-OUTS:</Typography>
              <ul style={{ margin: '0px', paddingLeft: '20px' }}>
                {triageResult.watchOuts.map((warning: string, idx: number) => (
                  <li key={idx} style={{ marginBottom: '4px' }}>{warning}</li>
                ))}
              </ul>
            </Alert>
          )}

          {/* Follow-up Questions with Answer Fields */}
          {triageResult.followupQuestions && triageResult.followupQuestions.length > 0 && (
            <Card sx={{ mb: 3, border: '2px solid #1976d2' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, color: '#1976d2' }}>
                  Follow-up Questions (Round {followupRound + 1})
                </Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                  Answer the questions below and click "Resubmit with Answers" to refine the triage assessment.
                </Typography>
                <Stack spacing={2}>
                  {triageResult.followupQuestions.map((question: string, idx: number) => (
                    <Box key={idx}>
                      <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 0.5 }}>
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
          {triageResult.recommendedNextSteps && triageResult.recommendedNextSteps.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" gutterBottom>Recommended Next Steps</Typography>
              <ul>
                {triageResult.recommendedNextSteps.map((step: string, idx: number) => (
                  <li key={idx}>{step}</li>
                ))}
              </ul>
            </Box>
          )}

          {/* AI Reasoning */}
          {triageResult.reasoning && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" gutterBottom>AI Reasoning</Typography>
              <Typography variant="body2" sx={{ p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
                {triageResult.reasoning}
              </Typography>
            </Box>
          )}

          {/* Disclaimer */}
          {triageResult.disclaimer && (
            <Alert severity="info" sx={{ mb: 2 }}>{triageResult.disclaimer}</Alert>
          )}

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={() => setShowReferralModal(true)}
              size="large"
            >
              Create & Download Referral (SOAP)
            </Button>
            <Button
              variant="outlined"
              onClick={handleReset}
              size="large"
            >
              New Encounter
            </Button>
            <Button
              variant="text"
              onClick={() => navigate('/')}
              size="large"
            >
              Back to Dashboard
            </Button>
          </Box>
        </Paper>
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
