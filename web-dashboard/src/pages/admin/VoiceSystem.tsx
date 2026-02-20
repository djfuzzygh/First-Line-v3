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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Save,
  Refresh,
  Add,
  Delete,
  Phone,
  PlayArrow,
  CheckCircle,
  Error as ErrorIcon,
} from '@mui/icons-material';
import api from '../../services/api';

interface VoiceConfig {
  provider: '3cx' | 'twilio' | 'africas-talking';
  threecx: {
    serverUrl: string;
    adminUsername: string;
    adminPassword: string;
    extensionRange: string;
    webhookUrl: string;
  };
  twilio: {
    accountSid: string;
    authToken: string;
    phoneNumbers: string[];
  };
  africasTalking: {
    apiKey: string;
    username: string;
    phoneNumbers: string[];
  };
  ivr: {
    welcomeMessage: string;
    languages: string[];
    defaultLanguage: string;
    timeout: number;
    maxRetries: number;
    recordingEnabled: boolean;
  };
  phoneNumbers: PhoneNumber[];
}

interface PhoneNumber {
  id: string;
  number: string;
  provider: string;
  type: 'local' | 'toll-free';
  status: 'active' | 'inactive';
  monthlyCost: number;
}

export default function VoiceSystem() {
  const [config, setConfig] = useState<VoiceConfig>({
    provider: '3cx',
    threecx: {
      serverUrl: '',
      adminUsername: '',
      adminPassword: '',
      extensionRange: '100-199',
      webhookUrl: '',
    },
    twilio: {
      accountSid: '',
      authToken: '',
      phoneNumbers: [],
    },
    africasTalking: {
      apiKey: '',
      username: '',
      phoneNumbers: [],
    },
    ivr: {
      welcomeMessage: 'Welcome to FirstLine Health Triage',
      languages: ['en', 'sw', 'fr'],
      defaultLanguage: 'en',
      timeout: 5,
      maxRetries: 3,
      recordingEnabled: true,
    },
    phoneNumbers: [],
  });

  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await api.get('/admin/voice/config');
      setConfig(response.data);
    } catch (err) {
      console.error('Failed to load voice config:', err);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      await api.put('/admin/voice/config', config);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleTestCall = async () => {
    setTesting(true);
    try {
      await api.post('/admin/voice/test-call', { phoneNumber: testNumber });
      alert('Test call initiated! Check your phone.');
    } catch (err: any) {
      setError('Test call failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setTesting(false);
      setTestDialogOpen(false);
    }
  };

  const handleChange = (section: string, field: string, value: any) => {
    setConfig((prev) => ({
      ...prev,
      [section]: {
        ...prev[section as keyof VoiceConfig],
        [field]: value,
      },
    }));
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Voice System Configuration</Typography>
        <Box>
          <Button startIcon={<Phone />} onClick={() => setTestDialogOpen(true)} sx={{ mr: 1 }}>
            Test Call
          </Button>
          <Button startIcon={<Refresh />} onClick={loadConfig} sx={{ mr: 1 }}>
            Reload
          </Button>
          <Button variant="contained" startIcon={<Save />} onClick={handleSave} disabled={loading}>
            Save Changes
          </Button>
        </Box>
      </Box>

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Voice system configuration saved successfully!
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Voice Provider
          </Typography>
          <FormControl fullWidth>
            <InputLabel>Select Provider</InputLabel>
            <Select
              value={config.provider}
              onChange={(e) => setConfig((prev) => ({ ...prev, provider: e.target.value as any }))}
            >
              <MenuItem value="3cx">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  3CX PBX
                  <Chip label="Recommended" size="small" color="primary" />
                  <Chip label="Free Demo" size="small" color="success" />
                </Box>
              </MenuItem>
              <MenuItem value="twilio">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  Twilio
                  <Chip label="Global" size="small" />
                </Box>
              </MenuItem>
              <MenuItem value="africas-talking">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  Africa's Talking
                  <Chip label="Africa" size="small" color="info" />
                </Box>
              </MenuItem>
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      <Card>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="3CX Setup" />
          <Tab label="Twilio Setup" />
          <Tab label="Africa's Talking" />
          <Tab label="Phone Numbers" />
          <Tab label="IVR Settings" />
        </Tabs>

        <CardContent>
          {/* 3CX Setup */}
          {activeTab === 0 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  3CX PBX Configuration
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Configure your 3CX PBX server for voice triage
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="3CX Server URL"
                  value={config.threecx.serverUrl}
                  onChange={(e) => handleChange('threecx', 'serverUrl', e.target.value)}
                  placeholder="https://your-3cx-server.com:5001"
                  helperText="Your 3CX web interface URL"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Admin Username"
                  value={config.threecx.adminUsername}
                  onChange={(e) => handleChange('threecx', 'adminUsername', e.target.value)}
                  helperText="3CX admin username"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="password"
                  label="Admin Password"
                  value={config.threecx.adminPassword}
                  onChange={(e) => handleChange('threecx', 'adminPassword', e.target.value)}
                  helperText="3CX admin password"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Extension Range"
                  value={config.threecx.extensionRange}
                  onChange={(e) => handleChange('threecx', 'extensionRange', e.target.value)}
                  placeholder="100-199"
                  helperText="Range of extensions for triage"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Webhook URL"
                  value={config.threecx.webhookUrl}
                  onChange={(e) => handleChange('threecx', 'webhookUrl', e.target.value)}
                  placeholder="https://your-api.com/voice/3cx"
                  helperText="Your API endpoint for 3CX webhooks"
                />
              </Grid>

              <Grid item xs={12}>
                <Alert severity="info">
                  <strong>Quick Setup:</strong>
                  <ol>
                    <li>Install 3CX from https://www.3cx.com/</li>
                    <li>Create a call flow in 3CX Call Flow Designer</li>
                    <li>Point webhook to: {config.threecx.webhookUrl || 'your-api-url'}</li>
                    <li>Test with extension or phone number</li>
                  </ol>
                </Alert>
              </Grid>

              <Grid item xs={12}>
                <Button variant="outlined" href="https://www.3cx.com/docs/" target="_blank">
                  View 3CX Documentation
                </Button>
              </Grid>
            </Grid>
          )}

          {/* Twilio Setup */}
          {activeTab === 1 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Twilio Configuration
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Configure Twilio for global voice coverage
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Account SID"
                  value={config.twilio.accountSid}
                  onChange={(e) => handleChange('twilio', 'accountSid', e.target.value)}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  helperText="Found in Twilio Console"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="password"
                  label="Auth Token"
                  value={config.twilio.authToken}
                  onChange={(e) => handleChange('twilio', 'authToken', e.target.value)}
                  helperText="Found in Twilio Console"
                />
              </Grid>

              <Grid item xs={12}>
                <Alert severity="info">
                  <strong>Get Started:</strong>
                  <ol>
                    <li>Sign up at https://www.twilio.com/</li>
                    <li>Get $15 free credit for testing</li>
                    <li>Copy Account SID and Auth Token</li>
                    <li>Purchase phone numbers from Twilio Console</li>
                  </ol>
                </Alert>
              </Grid>

              <Grid item xs={12}>
                <Alert severity="warning">
                  <strong>Cost:</strong> ~$0.0085/min for calls + $1/month per phone number
                </Alert>
              </Grid>
            </Grid>
          )}

          {/* Africa's Talking */}
          {activeTab === 2 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Africa's Talking Configuration
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Configure Africa's Talking for African markets
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="API Key"
                  value={config.africasTalking.apiKey}
                  onChange={(e) => handleChange('africasTalking', 'apiKey', e.target.value)}
                  helperText="Your Africa's Talking API key"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Username"
                  value={config.africasTalking.username}
                  onChange={(e) => handleChange('africasTalking', 'username', e.target.value)}
                  helperText="Your Africa's Talking username"
                />
              </Grid>

              <Grid item xs={12}>
                <Alert severity="info">
                  <strong>Get Started:</strong>
                  <ol>
                    <li>Sign up at https://africastalking.com/</li>
                    <li>Get free credits for testing</li>
                    <li>Copy API Key and Username</li>
                    <li>Purchase phone numbers for your country</li>
                  </ol>
                </Alert>
              </Grid>

              <Grid item xs={12}>
                <Alert severity="success">
                  <strong>Coverage:</strong> Kenya, Uganda, Tanzania, Rwanda, Nigeria, Ghana, and more
                </Alert>
              </Grid>
            </Grid>
          )}

          {/* Phone Numbers */}
          {activeTab === 3 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h6">Phone Numbers</Typography>
                  <Button startIcon={<Add />} variant="contained">
                    Add Number
                  </Button>
                </Box>
              </Grid>

              <Grid item xs={12}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Number</TableCell>
                      <TableCell>Provider</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Monthly Cost</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {config.phoneNumbers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center">
                          <Typography color="text.secondary">
                            No phone numbers configured. Add one to get started.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      config.phoneNumbers.map((number) => (
                        <TableRow key={number.id}>
                          <TableCell>{number.number}</TableCell>
                          <TableCell>{number.provider}</TableCell>
                          <TableCell>
                            <Chip
                              label={number.type}
                              size="small"
                              color={number.type === 'toll-free' ? 'success' : 'default'}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={number.status}
                              size="small"
                              color={number.status === 'active' ? 'success' : 'default'}
                            />
                          </TableCell>
                          <TableCell>${number.monthlyCost}/mo</TableCell>
                          <TableCell>
                            <IconButton size="small" color="error">
                              <Delete />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Grid>

              <Grid item xs={12}>
                <Alert severity="info">
                  <strong>Toll-Free Numbers:</strong> Recommended for patient access. Costs $2-5/month
                  depending on country.
                </Alert>
              </Grid>
            </Grid>
          )}

          {/* IVR Settings */}
          {activeTab === 4 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  IVR Settings
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Configure Interactive Voice Response behavior
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Welcome Message"
                  value={config.ivr.welcomeMessage}
                  onChange={(e) => handleChange('ivr', 'welcomeMessage', e.target.value)}
                  helperText="Message played when call is answered"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Default Language</InputLabel>
                  <Select
                    value={config.ivr.defaultLanguage}
                    onChange={(e) => handleChange('ivr', 'defaultLanguage', e.target.value)}
                  >
                    <MenuItem value="en">English</MenuItem>
                    <MenuItem value="sw">Swahili</MenuItem>
                    <MenuItem value="fr">French</MenuItem>
                    <MenuItem value="pt">Portuguese</MenuItem>
                    <MenuItem value="ha">Hausa</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Input Timeout (seconds)"
                  value={config.ivr.timeout}
                  onChange={(e) => handleChange('ivr', 'timeout', parseInt(e.target.value))}
                  helperText="How long to wait for user input"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Max Retries"
                  value={config.ivr.maxRetries}
                  onChange={(e) => handleChange('ivr', 'maxRetries', parseInt(e.target.value))}
                  helperText="Number of times to retry on no input"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={config.ivr.recordingEnabled}
                      onChange={(e) => handleChange('ivr', 'recordingEnabled', e.target.checked)}
                    />
                  }
                  label="Enable Call Recording"
                />
              </Grid>

              <Grid item xs={12}>
                <Alert severity="warning">
                  <strong>Privacy:</strong> If call recording is enabled, ensure you comply with local
                  laws and inform callers.
                </Alert>
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* Test Call Dialog */}
      <Dialog open={testDialogOpen} onClose={() => setTestDialogOpen(false)}>
        <DialogTitle>Test Voice System</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <TextField
              fullWidth
              label="Your Phone Number"
              value={testNumber}
              onChange={(e) => setTestNumber(e.target.value)}
              placeholder="+1234567890"
              helperText="Enter your phone number to receive a test call"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleTestCall}
            disabled={testing || !testNumber}
            startIcon={<Phone />}
          >
            {testing ? 'Calling...' : 'Call Me'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
