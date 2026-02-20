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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Save,
  Refresh,
  Add,
  Delete,
  Edit,
  Phone,
  Sms,
  TrendingUp,
} from '@mui/icons-material';
import api from '../../services/api';

interface SIPTrunk {
  id: string;
  name: string;
  provider: string;
  sipServer: string;
  username: string;
  password: string;
  concurrentCalls: number;
  status: 'active' | 'inactive';
}

interface SMSProvider {
  name: string;
  enabled: boolean;
  apiKey: string;
  apiSecret: string;
  senderId: string;
}

interface PhoneNumber {
  id: string;
  number: string;
  type: 'local' | 'toll-free';
  provider: string;
  monthlyCost: number;
  assignedTo: string;
  status: 'active' | 'inactive';
}

export default function TelecomIntegration() {
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [sipTrunks, setSipTrunks] = useState<SIPTrunk[]>([]);
  const [smsProviders, setSmsProviders] = useState({
    twilio: { enabled: false, apiKey: '', apiSecret: '', senderId: '' },
    africasTalking: { enabled: false, apiKey: '', username: '', senderId: '' },
    vonage: { enabled: false, apiKey: '', apiSecret: '', senderId: '' },
  });
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);

  const [addTrunkDialog, setAddTrunkDialog] = useState(false);
  const [addNumberDialog, setAddNumberDialog] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const [trunksRes, smsRes, numbersRes] = await Promise.all([
        api.get('/admin/telecom/sip-trunks'),
        api.get('/admin/telecom/sms-providers'),
        api.get('/admin/telecom/phone-numbers'),
      ]);
      setSipTrunks(trunksRes.data);
      setSmsProviders(smsRes.data);
      setPhoneNumbers(numbersRes.data);
    } catch (err) {
      console.error('Failed to load telecom config:', err);
    }
  };

  const handleSaveSMS = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      await api.put('/admin/telecom/sms-providers', smsProviders);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save SMS configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTrunk = async (id: string) => {
    try {
      await api.delete(`/admin/telecom/sip-trunks/${id}`);
      loadConfig();
    } catch (err: any) {
      setError('Failed to delete SIP trunk');
    }
  };

  const handleDeleteNumber = async (id: string) => {
    try {
      await api.delete(`/admin/telecom/phone-numbers/${id}`);
      loadConfig();
    } catch (err: any) {
      setError('Failed to delete phone number');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Telecom Integration</Typography>
        <Box>
          <Button startIcon={<Refresh />} onClick={loadConfig} sx={{ mr: 1 }}>
            Reload
          </Button>
          <Button
            variant="contained"
            startIcon={<Save />}
            onClick={handleSaveSMS}
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
          <Tab label="SIP Trunks" />
          <Tab label="SMS Providers" />
          <Tab label="Phone Numbers" />
          <Tab label="Usage & Billing" />
        </Tabs>

        <CardContent>
          {/* SIP Trunks */}
          {activeTab === 0 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">SIP Trunk Configuration</Typography>
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={() => setAddTrunkDialog(true)}
                >
                  Add SIP Trunk
                </Button>
              </Box>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Provider</TableCell>
                    <TableCell>SIP Server</TableCell>
                    <TableCell>Concurrent Calls</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sipTrunks.map((trunk) => (
                    <TableRow key={trunk.id}>
                      <TableCell>{trunk.name}</TableCell>
                      <TableCell>{trunk.provider}</TableCell>
                      <TableCell>{trunk.sipServer}</TableCell>
                      <TableCell>{trunk.concurrentCalls}</TableCell>
                      <TableCell>
                        <Chip
                          label={trunk.status}
                          color={trunk.status === 'active' ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton size="small">
                          <Edit />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteTrunk(trunk.id)}
                        >
                          <Delete />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {sipTrunks.length === 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  No SIP trunks configured. Add one to enable voice calling.
                </Alert>
              )}
            </Box>
          )}

          {/* SMS Providers */}
          {activeTab === 1 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  SMS Provider Configuration
                </Typography>
              </Grid>

              {/* Twilio */}
              <Grid item xs={12}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      <Sms />
                      <Typography variant="h6">Twilio</Typography>
                      <Chip
                        label={smsProviders.twilio.enabled ? 'Enabled' : 'Disabled'}
                        color={smsProviders.twilio.enabled ? 'success' : 'default'}
                        size="small"
                      />
                    </Box>

                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="Account SID"
                          value={smsProviders.twilio.apiKey}
                          onChange={(e) =>
                            setSmsProviders((prev) => ({
                              ...prev,
                              twilio: { ...prev.twilio, apiKey: e.target.value },
                            }))
                          }
                          helperText="Your Twilio Account SID"
                        />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          type="password"
                          label="Auth Token"
                          value={smsProviders.twilio.apiSecret}
                          onChange={(e) =>
                            setSmsProviders((prev) => ({
                              ...prev,
                              twilio: { ...prev.twilio, apiSecret: e.target.value },
                            }))
                          }
                          helperText="Your Twilio Auth Token"
                        />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="Sender ID"
                          value={smsProviders.twilio.senderId}
                          onChange={(e) =>
                            setSmsProviders((prev) => ({
                              ...prev,
                              twilio: { ...prev.twilio, senderId: e.target.value },
                            }))
                          }
                          helperText="Default sender ID or phone number"
                        />
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>

              {/* Africa's Talking */}
              <Grid item xs={12}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      <Sms />
                      <Typography variant="h6">Africa's Talking</Typography>
                      <Chip
                        label={smsProviders.africasTalking.enabled ? 'Enabled' : 'Disabled'}
                        color={smsProviders.africasTalking.enabled ? 'success' : 'default'}
                        size="small"
                      />
                    </Box>

                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="API Key"
                          value={smsProviders.africasTalking.apiKey}
                          onChange={(e) =>
                            setSmsProviders((prev) => ({
                              ...prev,
                              africasTalking: { ...prev.africasTalking, apiKey: e.target.value },
                            }))
                          }
                        />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="Username"
                          value={smsProviders.africasTalking.username}
                          onChange={(e) =>
                            setSmsProviders((prev) => ({
                              ...prev,
                              africasTalking: { ...prev.africasTalking, username: e.target.value },
                            }))
                          }
                        />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="Sender ID"
                          value={smsProviders.africasTalking.senderId}
                          onChange={(e) =>
                            setSmsProviders((prev) => ({
                              ...prev,
                              africasTalking: { ...prev.africasTalking, senderId: e.target.value },
                            }))
                          }
                        />
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>

              {/* Vonage */}
              <Grid item xs={12}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      <Sms />
                      <Typography variant="h6">Vonage</Typography>
                      <Chip
                        label={smsProviders.vonage.enabled ? 'Enabled' : 'Disabled'}
                        color={smsProviders.vonage.enabled ? 'success' : 'default'}
                        size="small"
                      />
                    </Box>

                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="API Key"
                          value={smsProviders.vonage.apiKey}
                          onChange={(e) =>
                            setSmsProviders((prev) => ({
                              ...prev,
                              vonage: { ...prev.vonage, apiKey: e.target.value },
                            }))
                          }
                        />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          type="password"
                          label="API Secret"
                          value={smsProviders.vonage.apiSecret}
                          onChange={(e) =>
                            setSmsProviders((prev) => ({
                              ...prev,
                              vonage: { ...prev.vonage, apiSecret: e.target.value },
                            }))
                          }
                        />
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          {/* Phone Numbers */}
          {activeTab === 2 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">Phone Number Inventory</Typography>
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={() => setAddNumberDialog(true)}
                >
                  Add Phone Number
                </Button>
              </Box>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Number</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Provider</TableCell>
                    <TableCell>Monthly Cost</TableCell>
                    <TableCell>Assigned To</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {phoneNumbers.map((number) => (
                    <TableRow key={number.id}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Phone fontSize="small" />
                          {number.number}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={number.type}
                          color={number.type === 'toll-free' ? 'primary' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{number.provider}</TableCell>
                      <TableCell>${number.monthlyCost}/mo</TableCell>
                      <TableCell>{number.assignedTo}</TableCell>
                      <TableCell>
                        <Chip
                          label={number.status}
                          color={number.status === 'active' ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton size="small">
                          <Edit />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteNumber(number.id)}
                        >
                          <Delete />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {phoneNumbers.length === 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  No phone numbers configured. Add one to enable voice/SMS services.
                </Alert>
              )}
            </Box>
          )}

          {/* Usage & Billing */}
          {activeTab === 3 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Usage & Billing Summary
                </Typography>
              </Grid>

              <Grid item xs={12} md={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Phone color="primary" />
                      <Typography variant="h6">Voice Calls</Typography>
                    </Box>
                    <Typography variant="h4">1,234</Typography>
                    <Typography variant="body2" color="text.secondary">
                      This month
                    </Typography>
                    <Typography variant="h6" sx={{ mt: 2 }}>
                      $123.45
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Sms color="primary" />
                      <Typography variant="h6">SMS Messages</Typography>
                    </Box>
                    <Typography variant="h4">5,678</Typography>
                    <Typography variant="body2" color="text.secondary">
                      This month
                    </Typography>
                    <Typography variant="h6" sx={{ mt: 2 }}>
                      $56.78
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <TrendingUp color="primary" />
                      <Typography variant="h6">Total Cost</Typography>
                    </Box>
                    <Typography variant="h4">$180.23</Typography>
                    <Typography variant="body2" color="text.secondary">
                      This month
                    </Typography>
                    <Typography variant="body2" color="success.main" sx={{ mt: 2 }}>
                      ↓ 12% vs last month
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
