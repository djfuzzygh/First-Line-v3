import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Paper,
  Typography,
  Button,
  Box,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import {
  Warning,
  CheckCircle,
  Error as ErrorIcon,
  LocalHospital,
} from '@mui/icons-material';
import { encounterAPI } from '../services/api';

export default function TriageSession() {
  const { encounterId } = useParams<{ encounterId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [triaging, setTriaging] = useState(false);
  const [error, setError] = useState('');
  const [encounter, setEncounter] = useState<any>(null);
  const [triageResult, setTriageResult] = useState<any>(null);

  useEffect(() => {
    loadEncounter();
  }, [encounterId]);

  const loadEncounter = async () => {
    try {
      const response = await encounterAPI.get(encounterId!);
      setEncounter(response.data.encounter);
      setTriageResult(response.data.triage);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load encounter');
    } finally {
      setLoading(false);
    }
  };

  const handlePerformTriage = async () => {
    setError('');
    setTriaging(true);

    try {
      const response = await encounterAPI.performTriage(encounterId!, {
        symptoms: encounter.Symptoms,
      });
      setTriageResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Triage failed');
    } finally {
      setTriaging(false);
    }
  };

  const handleGenerateReferral = async () => {
    try {
      await encounterAPI.generateReferral(encounterId!);
      alert('Referral generated successfully!');
      loadEncounter();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to generate referral');
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (!encounter) {
    return (
      <Alert severity="error">
        Encounter not found
      </Alert>
    );
  }

  const getTriageLevelColor = (level: string) => {
    switch (level) {
      case 'RED':
        return 'error';
      case 'YELLOW':
        return 'warning';
      case 'GREEN':
        return 'success';
      default:
        return 'default';
    }
  };

  const getTriageLevelIcon = (level: string) => {
    switch (level) {
      case 'RED':
        return <ErrorIcon />;
      case 'YELLOW':
        return <Warning />;
      case 'GREEN':
        return <CheckCircle />;
      default:
        return null;
    }
  };

  const triageLevel = triageResult?.riskTier || triageResult?.RiskTier;
  const dangerSigns = triageResult?.dangerSigns || triageResult?.DangerSigns || [];
  const recommendations =
    triageResult?.recommendedNextSteps || triageResult?.RecommendedNextSteps || [];
  const watchOuts = triageResult?.watchOuts || triageResult?.WatchOuts || [];
  const disclaimer = triageResult?.disclaimer || triageResult?.Disclaimer;
  const reasoning = triageResult?.reasoning || triageResult?.Reasoning;

  return (
    <Box>
      <Paper sx={{ p: 4, mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Triage Session
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Encounter ID: {encounterId}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        <Divider sx={{ my: 3 }} />

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Patient Information
                </Typography>
                <Typography variant="body2">
                  <strong>Age:</strong> {encounter.Demographics?.age} years
                </Typography>
                <Typography variant="body2">
                  <strong>Sex:</strong> {encounter.Demographics?.sex === 'M' ? 'Male' : encounter.Demographics?.sex === 'F' ? 'Female' : 'Other'}
                </Typography>
                <Typography variant="body2">
                  <strong>Location:</strong> {encounter.Demographics?.location}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>Channel:</strong> {encounter.Channel}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Vital Signs
                </Typography>
                {encounter.Vitals ? (
                  <>
                    {encounter.Vitals.temperature && (
                      <Typography variant="body2">
                        <strong>Temperature:</strong> {encounter.Vitals.temperature}°C
                      </Typography>
                    )}
                    {encounter.Vitals.pulse && (
                      <Typography variant="body2">
                        <strong>Pulse:</strong> {encounter.Vitals.pulse} bpm
                      </Typography>
                    )}
                    {encounter.Vitals.bloodPressure && (
                      <Typography variant="body2">
                        <strong>Blood Pressure:</strong> {encounter.Vitals.bloodPressure}
                      </Typography>
                    )}
                    {encounter.Vitals.respiratoryRate && (
                      <Typography variant="body2">
                        <strong>Respiratory Rate:</strong> {encounter.Vitals.respiratoryRate}
                      </Typography>
                    )}
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No vitals recorded
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Chief Complaint & Symptoms
                </Typography>
                <Typography variant="body1">
                  {encounter.Symptoms}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {!triageResult && (
          <Box sx={{ mt: 3 }}>
            <Button
              variant="contained"
              size="large"
              onClick={handlePerformTriage}
              disabled={triaging}
              startIcon={<LocalHospital />}
            >
              {triaging ? 'Analyzing...' : 'Perform AI Triage'}
            </Button>
          </Box>
        )}
      </Paper>

      {triageResult && (
        <Paper sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <Typography variant="h5" sx={{ flexGrow: 1 }}>
              Triage Result
            </Typography>
            <Chip
              icon={getTriageLevelIcon(triageLevel)}
              label={`${triageLevel}`}
              color={getTriageLevelColor(triageLevel)}
              sx={{ fontSize: '1.1rem', padding: '20px 12px' }}
            />
          </Box>

          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Assessment
                  </Typography>
                  <Typography variant="body1">
                    {reasoning || 'Clinical assessment completed.'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Recommendations
                  </Typography>
                  <Typography variant="body1" component="div">
                    <ul>
                      {recommendations.map((step: string, index: number) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ul>
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {dangerSigns.length > 0 && (
              <Grid item xs={12}>
                <Alert severity="error">
                  <Typography variant="h6" gutterBottom>
                    ⚠️ Danger Signs Detected
                  </Typography>
                  <ul>
                    {dangerSigns.map((sign: string, index: number) => (
                      <li key={index}>{sign}</li>
                    ))}
                  </ul>
                </Alert>
              </Grid>
            )}

            {watchOuts.length > 0 && (
              <Grid item xs={12}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Watch Outs
                    </Typography>
                    <ul>
                      {watchOuts.map((warning: string, index: number) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </Grid>
            )}

            <Grid item xs={12}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Disclaimer:</strong> {disclaimer}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleGenerateReferral}
            >
              Generate Referral
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate('/')}
            >
              Complete Encounter
            </Button>
          </Box>
        </Paper>
      )}
    </Box>
  );
}
