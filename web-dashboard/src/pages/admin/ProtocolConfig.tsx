import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
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
  TextField,
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
  Upload,
  Download,
  History,
  CheckCircle,
  Warning,
} from '@mui/icons-material';
import api from '../../services/api';

interface Protocol {
  id: string;
  name: string;
  version: string;
  status: 'active' | 'draft' | 'archived';
  uploadedBy: string;
  uploadedAt: string;
  region: string;
}

interface TriageRule {
  id: string;
  condition: string;
  urgency: 'emergency' | 'urgent' | 'routine';
  action: string;
  enabled: boolean;
}

interface DangerSign {
  id: string;
  name: string;
  description: string;
  ageGroup: string;
  autoReferral: boolean;
  enabled: boolean;
}

export default function ProtocolConfig() {
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [triageRules, setTriageRules] = useState<TriageRule[]>([]);
  const [dangerSigns, setDangerSigns] = useState<DangerSign[]>([]);

  const [uploadDialog, setUploadDialog] = useState(false);
  const [addRuleDialog, setAddRuleDialog] = useState(false);
  const [addDangerSignDialog, setAddDangerSignDialog] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const [protocolsRes, rulesRes, dangerSignsRes] = await Promise.all([
        api.get('/admin/protocols'),
        api.get('/admin/protocols/triage-rules'),
        api.get('/admin/protocols/danger-signs'),
      ]);
      setProtocols(protocolsRes.data);
      setTriageRules(rulesRes.data);
      setDangerSigns(dangerSignsRes.data);
    } catch (err) {
      console.error('Failed to load protocol config:', err);
    }
  };

  const handleActivateProtocol = async (id: string) => {
    try {
      await api.post(`/admin/protocols/${id}/activate`);
      setSuccess(true);
      loadConfig();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError('Failed to activate protocol');
    }
  };

  const handleDeleteProtocol = async (id: string) => {
    try {
      await api.delete(`/admin/protocols/${id}`);
      loadConfig();
    } catch (err: any) {
      setError('Failed to delete protocol');
    }
  };

  const handleToggleRule = async (id: string, enabled: boolean) => {
    try {
      await api.put(`/admin/protocols/triage-rules/${id}`, { enabled });
      loadConfig();
    } catch (err: any) {
      setError('Failed to update rule');
    }
  };

  const handleToggleDangerSign = async (id: string, enabled: boolean) => {
    try {
      await api.put(`/admin/protocols/danger-signs/${id}`, { enabled });
      loadConfig();
    } catch (err: any) {
      setError('Failed to update danger sign');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Protocol Configuration</Typography>
        <Box>
          <Button startIcon={<Refresh />} onClick={loadConfig} sx={{ mr: 1 }}>
            Reload
          </Button>
          <Button
            variant="contained"
            startIcon={<Upload />}
            onClick={() => setUploadDialog(true)}
          >
            Upload Protocol
          </Button>
        </Box>
      </Box>

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Protocol configuration updated successfully!
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="Protocol Library" />
          <Tab label="Triage Rules" />
          <Tab label="Danger Signs" />
          <Tab label="Regional Settings" />
          <Tab label="Version History" />
        </Tabs>

        <CardContent>
          {/* Protocol Library */}
          {activeTab === 0 && (
            <Box>
              <Box sx={{ mb: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Health Protocol Library
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Upload and manage local health protocols (PDF, Word, or structured JSON)
                </Typography>
              </Box>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Protocol Name</TableCell>
                    <TableCell>Version</TableCell>
                    <TableCell>Region</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Uploaded By</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {protocols.map((protocol) => (
                    <TableRow key={protocol.id}>
                      <TableCell>{protocol.name}</TableCell>
                      <TableCell>{protocol.version}</TableCell>
                      <TableCell>{protocol.region}</TableCell>
                      <TableCell>
                        <Chip
                          label={protocol.status}
                          color={
                            protocol.status === 'active'
                              ? 'success'
                              : protocol.status === 'draft'
                              ? 'warning'
                              : 'default'
                          }
                          size="small"
                          icon={protocol.status === 'active' ? <CheckCircle /> : undefined}
                        />
                      </TableCell>
                      <TableCell>{protocol.uploadedBy}</TableCell>
                      <TableCell>{new Date(protocol.uploadedAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {protocol.status !== 'active' && (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => handleActivateProtocol(protocol.id)}
                            sx={{ mr: 1 }}
                          >
                            Activate
                          </Button>
                        )}
                        <IconButton size="small">
                          <Download />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteProtocol(protocol.id)}
                        >
                          <Delete />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {protocols.length === 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  No protocols uploaded. Upload your local health protocols to customize triage logic.
                </Alert>
              )}
            </Box>
          )}

          {/* Triage Rules */}
          {activeTab === 1 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">Triage Rules</Typography>
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={() => setAddRuleDialog(true)}
                >
                  Add Rule
                </Button>
              </Box>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Condition</TableCell>
                    <TableCell>Urgency</TableCell>
                    <TableCell>Action</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {triageRules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell>{rule.condition}</TableCell>
                      <TableCell>
                        <Chip
                          label={rule.urgency}
                          color={
                            rule.urgency === 'emergency'
                              ? 'error'
                              : rule.urgency === 'urgent'
                              ? 'warning'
                              : 'success'
                          }
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{rule.action}</TableCell>
                      <TableCell>
                        <Chip
                          label={rule.enabled ? 'Enabled' : 'Disabled'}
                          color={rule.enabled ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleToggleRule(rule.id, !rule.enabled)}
                          sx={{ mr: 1 }}
                        >
                          {rule.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <IconButton size="small">
                          <Edit />
                        </IconButton>
                        <IconButton size="small" color="error">
                          <Delete />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Alert severity="info" sx={{ mt: 2 }}>
                <strong>Tip:</strong> Rules are evaluated in order. More specific rules should be placed
                before general rules.
              </Alert>
            </Box>
          )}

          {/* Danger Signs */}
          {activeTab === 2 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">Danger Sign Definitions</Typography>
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={() => setAddDangerSignDialog(true)}
                >
                  Add Danger Sign
                </Button>
              </Box>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Age Group</TableCell>
                    <TableCell>Auto Referral</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dangerSigns.map((sign) => (
                    <TableRow key={sign.id}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Warning color="error" fontSize="small" />
                          {sign.name}
                        </Box>
                      </TableCell>
                      <TableCell>{sign.description}</TableCell>
                      <TableCell>{sign.ageGroup}</TableCell>
                      <TableCell>
                        <Chip
                          label={sign.autoReferral ? 'Yes' : 'No'}
                          color={sign.autoReferral ? 'error' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={sign.enabled ? 'Enabled' : 'Disabled'}
                          color={sign.enabled ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleToggleDangerSign(sign.id, !sign.enabled)}
                          sx={{ mr: 1 }}
                        >
                          {sign.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <IconButton size="small">
                          <Edit />
                        </IconButton>
                        <IconButton size="small" color="error">
                          <Delete />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Alert severity="warning" sx={{ mt: 2 }}>
                <strong>Important:</strong> Danger signs with auto-referral enabled will automatically
                escalate to emergency referral regardless of other triage results.
              </Alert>
            </Box>
          )}

          {/* Regional Settings */}
          {activeTab === 3 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Regional Protocol Variations
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Configure region-specific protocol variations
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Default Region</InputLabel>
                  <Select defaultValue="global">
                    <MenuItem value="global">Global</MenuItem>
                    <MenuItem value="east-africa">East Africa</MenuItem>
                    <MenuItem value="west-africa">West Africa</MenuItem>
                    <MenuItem value="southern-africa">Southern Africa</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12}>
                <Alert severity="info">
                  Regional variations allow you to customize protocols for different geographic areas
                  while maintaining a common base protocol.
                </Alert>
              </Grid>
            </Grid>
          )}

          {/* Version History */}
          {activeTab === 4 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Protocol Version History
              </Typography>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Version</TableCell>
                    <TableCell>Protocol</TableCell>
                    <TableCell>Changes</TableCell>
                    <TableCell>Updated By</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>
                      <Chip label="v2.1" color="success" size="small" />
                    </TableCell>
                    <TableCell>WHO IMCI Guidelines</TableCell>
                    <TableCell>Updated danger signs for children under 5</TableCell>
                    <TableCell>admin@firstline.health</TableCell>
                    <TableCell>2024-02-15</TableCell>
                    <TableCell>
                      <Button size="small" variant="outlined" startIcon={<History />}>
                        Rollback
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <Alert severity="info" sx={{ mt: 2 }}>
                Version history allows you to track changes and rollback to previous protocol versions
                if needed.
              </Alert>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Upload Protocol Dialog */}
      <Dialog open={uploadDialog} onClose={() => setUploadDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload Health Protocol</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField fullWidth label="Protocol Name" />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Version" defaultValue="1.0" />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Region</InputLabel>
                <Select defaultValue="global">
                  <MenuItem value="global">Global</MenuItem>
                  <MenuItem value="east-africa">East Africa</MenuItem>
                  <MenuItem value="west-africa">West Africa</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Button variant="outlined" component="label" fullWidth>
                Choose File (PDF, Word, JSON)
                <input type="file" hidden accept=".pdf,.doc,.docx,.json" />
              </Button>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialog(false)}>Cancel</Button>
          <Button variant="contained">Upload</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
