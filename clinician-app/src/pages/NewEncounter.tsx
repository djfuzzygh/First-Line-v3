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
} from '@mui/material';
import { encounterAPI } from '../services/api';

export default function NewEncounter() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    age: '',
    sex: 'M' as 'M' | 'F' | 'O',
    location: '',
    symptoms: '',
    temperature: '',
    pulse: '',
    bloodPressure: '',
    respiratoryRate: '',
  });

  const handleChange = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const vitals: any = {};
      if (formData.temperature) vitals.temperature = parseFloat(formData.temperature);
      if (formData.pulse) vitals.pulse = parseInt(formData.pulse);
      if (formData.bloodPressure) vitals.bloodPressure = formData.bloodPressure;
      if (formData.respiratoryRate) vitals.respiratoryRate = parseInt(formData.respiratoryRate);

      const response = await encounterAPI.create({
        channel: 'web',
        demographics: {
          age: parseInt(formData.age),
          sex: formData.sex,
          location: formData.location,
        },
        symptoms: formData.symptoms,
        vitals: Object.keys(vitals).length > 0 ? vitals : undefined,
      });

      const encounterId = response.data.encounterId;
      navigate(`/triage/${encounterId}`);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create encounter');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom>
        New Patient Encounter
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Enter patient information to begin triage assessment
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit}>
        <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
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
              required
              fullWidth
              label="Location"
              value={formData.location}
              onChange={(e) => handleChange('location', e.target.value)}
              placeholder="City or Region"
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />

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

        <Typography variant="h6" gutterBottom>
          Vital Signs (Optional)
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="Temperature (°C)"
              type="number"
              value={formData.temperature}
              onChange={(e) => handleChange('temperature', e.target.value)}
              inputProps={{ step: 0.1, min: 30, max: 45 }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="Pulse (bpm)"
              type="number"
              value={formData.pulse}
              onChange={(e) => handleChange('pulse', e.target.value)}
              inputProps={{ min: 30, max: 250 }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="Blood Pressure"
              value={formData.bloodPressure}
              onChange={(e) => handleChange('bloodPressure', e.target.value)}
              placeholder="120/80"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="Respiratory Rate"
              type="number"
              value={formData.respiratoryRate}
              onChange={(e) => handleChange('respiratoryRate', e.target.value)}
              inputProps={{ min: 5, max: 60 }}
            />
          </Grid>
        </Grid>

        <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Start Triage'}
          </Button>
          <Button
            variant="outlined"
            size="large"
            onClick={() => navigate('/')}
          >
            Cancel
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}
