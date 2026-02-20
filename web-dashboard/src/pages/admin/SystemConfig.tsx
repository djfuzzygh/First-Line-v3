import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  Alert,
  Tabs,
  Tab,
  Switch,
  FormControlLabel,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import { Save, Refresh, Visibility, VisibilityOff } from '@mui/icons-material';
import api from '../../services/api';

interface SystemConfig {
  aws: {
    region: string;
    accountId: string;
    tableName: string;
    bucketName: string;
  };
  api: {
    baseUrl: string;
    timeout: number;
    retryAttempts: number;
  };
  security: {
    jwtSecret: string;
    jwtExpiration: string;
    encryptionEnabled: boolean;
  };
  features: {
    offlineMode: boolean;
    voiceEnabled: boolean;
    smsEnabled: boolean;
    ussdEnabled: boolean;
    edgeDevicesEnabled: boolean;
  };
}

export default function SystemConfig() {
  const [config, setConfig] = useState<SystemConfig>({
    aws: {
      region: 'us-central1',
      accountId: '',
      tableName: 'firstline-data',
      bucketName: 'firstline-referrals-gcs',
    },
    api: {
      baseUrl: '',
      timeout: 30000,
      retryAttempts: 3,
    },
    security: {
      jwtSecret: '',
      jwtExpiration: '7d',
      encryptionEnabled: true,
    },
    features: {
      offlineMode: true,
      voiceEnabled: true,
      smsEnabled: true,
      ussdEnabled: true,
      edgeDevicesEnabled: false,
    },
  });

  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await api.get('/admin/config/system');
      setConfig(response.data);
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      await api.put('/admin/config/system', config);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (section: keyof SystemConfig, field: string, value: any) => {
    setConfig((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">System Configuration</Typography>
        <Box>
          <Button
            startIcon={<Refresh />}
            onClick={loadConfig}
            sx={{ mr: 1 }}
          >
            Reload
          </Button>
          <Button
            variant="contained"
            startIcon={<Save />}
            onClick={handleSave}
            disabled={loading}
          >
            Save Changes
          </Button>
        </Box>
      </Box>

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Configuration saved successfully!
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="Cloud Configuration" />
          <Tab label="API Settings" />
          <Tab label="Security" />
          <Tab label="Features" />
        </Tabs>

        <CardContent>
          {/* Cloud Configuration */}
          {activeTab === 0 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Google Cloud Configuration
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Configure your Google Cloud project and resource settings
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="GCP Region"
                  value={config.aws.region}
                  onChange={(e) => handleChange('aws', 'region', e.target.value)}
                  helperText="e.g., us-central1, europe-west1"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="GCP Project ID"
                  value={config.aws.accountId}
                  onChange={(e) => handleChange('aws', 'accountId', e.target.value)}
                  helperText="Your Google Cloud project ID"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Firestore Collection Name"
                  value={config.aws.tableName}
                  onChange={(e) => handleChange('aws', 'tableName', e.target.value)}
                  helperText="Firestore collection used for app data"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="GCS Bucket Name"
                  value={config.aws.bucketName}
                  onChange={(e) => handleChange('aws', 'bucketName', e.target.value)}
                  helperText="Cloud Storage bucket for referral documents"
                />
              </Grid>

              <Grid item xs={12}>
                <Alert severity="info">
                  These settings are read from your deployed cloud environment. Changes here will update
                  environment variables but won't modify infrastructure.
                </Alert>
              </Grid>
            </Grid>
          )}

          {/* API Settings */}
          {activeTab === 1 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  API Settings
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Configure API behavior and performance settings
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="API Base URL"
                  value={config.api.baseUrl}
                  onChange={(e) => handleChange('api', 'baseUrl', e.target.value)}
                  helperText="Your Cloud Run URL (e.g., https://service-xxxxx-uc.a.run.app)"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Request Timeout (ms)"
                  value={config.api.timeout}
                  onChange={(e) => handleChange('api', 'timeout', parseInt(e.target.value))}
                  helperText="Maximum time to wait for API response"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Retry Attempts"
                  value={config.api.retryAttempts}
                  onChange={(e) => handleChange('api', 'retryAttempts', parseInt(e.target.value))}
                  helperText="Number of times to retry failed requests"
                />
              </Grid>
            </Grid>
          )}

          {/* Security */}
          {activeTab === 2 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h6" gutterBottom>
                      Security Settings
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Configure authentication and encryption settings
                    </Typography>
                  </Box>
                  <Tooltip title={showSecrets ? 'Hide secrets' : 'Show secrets'}>
                    <IconButton onClick={() => setShowSecrets(!showSecrets)}>
                      {showSecrets ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </Tooltip>
                </Box>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="JWT Secret"
                  type={showSecrets ? 'text' : 'password'}
                  value={config.security.jwtSecret}
                  onChange={(e) => handleChange('security', 'jwtSecret', e.target.value)}
                  helperText="Secret key for JWT token signing (min 32 characters)"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="JWT Expiration"
                  value={config.security.jwtExpiration}
                  onChange={(e) => handleChange('security', 'jwtExpiration', e.target.value)}
                  helperText="Token expiration time (e.g., 7d, 24h, 30m)"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={config.security.encryptionEnabled}
                      onChange={(e) => handleChange('security', 'encryptionEnabled', e.target.checked)}
                    />
                  }
                  label="Enable Data Encryption"
                />
              </Grid>

              <Grid item xs={12}>
                <Alert severity="warning">
                  <strong>Important:</strong> Changing the JWT secret will invalidate all existing tokens.
                  Users will need to log in again.
                </Alert>
              </Grid>

              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Button variant="outlined" color="primary">
                  Generate New JWT Secret
                </Button>
              </Grid>
            </Grid>
          )}

          {/* Features */}
          {activeTab === 3 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Feature Flags
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Enable or disable platform features
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={config.features.offlineMode}
                          onChange={(e) => handleChange('features', 'offlineMode', e.target.checked)}
                        />
                      }
                      label="Offline Mode"
                    />
                    <Typography variant="body2" color="text.secondary">
                      Allow mobile app to work offline with local storage
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={config.features.voiceEnabled}
                          onChange={(e) => handleChange('features', 'voiceEnabled', e.target.checked)}
                        />
                      }
                      label="Voice Triage"
                    />
                    <Typography variant="body2" color="text.secondary">
                      Enable voice-based triage via phone calls
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={config.features.smsEnabled}
                          onChange={(e) => handleChange('features', 'smsEnabled', e.target.checked)}
                        />
                      }
                      label="SMS Channel"
                    />
                    <Typography variant="body2" color="text.secondary">
                      Enable SMS-based triage interactions
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={config.features.ussdEnabled}
                          onChange={(e) => handleChange('features', 'ussdEnabled', e.target.checked)}
                        />
                      }
                      label="USSD Channel"
                    />
                    <Typography variant="body2" color="text.secondary">
                      Enable USSD menu-based triage
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={config.features.edgeDevicesEnabled}
                          onChange={(e) => handleChange('features', 'edgeDevicesEnabled', e.target.checked)}
                        />
                      }
                      label="Edge Devices"
                    />
                    <Typography variant="body2" color="text.secondary">
                      Enable edge device management and sync
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
