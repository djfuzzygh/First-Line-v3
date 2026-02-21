import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Key as KeyIcon,
} from '@mui/icons-material';
import {
  getDataSourceMode,
  setDataSourceMode,
  getKaggleApiUrl,
  setKaggleApiUrl,
  DataSourceMode,
} from '../services/api';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export default function Settings() {
  const [tabValue, setTabValue] = useState(0);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [settings, setSettings] = useState({
    systemName: 'FirstLine Triage Platform',
    organizationName: 'Healthcare Organization',
    supportEmail: 'support@firstline.health',
    enableOfflineMode: true,
    enableNotifications: true,
    autoSyncInterval: 5,
    sessionTimeout: 30,
    maxRetries: 3,
  });
  const [dataSourceMode, setDataSourceModeState] = useState<DataSourceMode>(getDataSourceMode());
  const [kaggleApiUrl, setKaggleApiUrlState] = useState<string>(getKaggleApiUrl());

  const apiKeys = [
    { id: '1', name: 'Mobile App', key: 'fln_***************', created: '2024-01-01', lastUsed: '2024-01-15' },
    { id: '2', name: 'Web Dashboard', key: 'fln_***************', created: '2024-01-01', lastUsed: '2024-01-15' },
  ];

  const users = [
    { id: '1', name: 'John Doe', email: 'john@example.com', role: 'Admin', status: 'Active' },
    { id: '2', name: 'Jane Smith', email: 'jane@example.com', role: 'Healthcare Worker', status: 'Active' },
  ];

  const handleSaveSettings = () => {
    setDataSourceMode(dataSourceMode);
    setKaggleApiUrl(kaggleApiUrl);
    console.log('Saving settings:', settings);
  };

  const handleGenerateApiKey = () => {
    // TODO: Implement API key generation
    console.log('Generating new API key');
    setApiKeyDialogOpen(false);
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>

      <Paper>
        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
          <Tab label="General" />
          <Tab label="API Keys" />
          <Tab label="Users" />
          <Tab label="System" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <Box p={3}>
            <Typography variant="h6" gutterBottom>
              General Settings
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="System Name"
                  value={settings.systemName}
                  onChange={(e) => setSettings({ ...settings, systemName: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Organization Name"
                  value={settings.organizationName}
                  onChange={(e) => setSettings({ ...settings, organizationName: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Support Email"
                  type="email"
                  value={settings.supportEmail}
                  onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Session Timeout (minutes)"
                  type="number"
                  value={settings.sessionTimeout}
                  onChange={(e) => setSettings({ ...settings, sessionTimeout: parseInt(e.target.value) })}
                />
              </Grid>
              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" gutterBottom>
                  Feature Toggles
                </Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Data Source</InputLabel>
                  <Select
                    value={dataSourceMode}
                    label="Data Source"
                    onChange={(e) => setDataSourceModeState(e.target.value as DataSourceMode)}
                  >
                    <MenuItem value="backend">Live Backend (GCP)</MenuItem>
                    <MenuItem value="kaggle">Kaggle Notebook / MedGemma Demo</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Kaggle Base URL (optional)"
                  value={kaggleApiUrl}
                  onChange={(e) => setKaggleApiUrlState(e.target.value)}
                  placeholder="https://<your-kaggle-proxy>"
                  helperText="Used for /infer and /health only. Leave empty to route through backend /kaggle/*."
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.enableOfflineMode}
                      onChange={(e) => setSettings({ ...settings, enableOfflineMode: e.target.checked })}
                    />
                  }
                  label="Enable Offline Mode"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.enableNotifications}
                      onChange={(e) => setSettings({ ...settings, enableNotifications: e.target.checked })}
                    />
                  }
                  label="Enable Notifications"
                />
              </Grid>
              <Grid item xs={12}>
                <Button variant="contained" onClick={handleSaveSettings}>
                  Save Changes
                </Button>
              </Grid>
            </Grid>
          </Box>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Box p={3}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">API Keys</Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setApiKeyDialogOpen(true)}
              >
                Generate New Key
              </Button>
            </Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              API keys are used to authenticate requests to the FirstLine API. Keep them secure!
            </Alert>
            <List>
              {apiKeys.map((key) => (
                <ListItem key={key.id} divider>
                  <ListItemText
                    primary={key.name}
                    secondary={
                      <>
                        <Typography component="span" variant="body2" fontFamily="monospace">
                          {key.key}
                        </Typography>
                        <br />
                        Created: {key.created} | Last used: {key.lastUsed}
                      </>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton edge="end" color="error">
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          </Box>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Box p={3}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">User Management</Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setUserDialogOpen(true)}
              >
                Add User
              </Button>
            </Box>
            <List>
              {users.map((user) => (
                <ListItem key={user.id} divider>
                  <ListItemText
                    primary={user.name}
                    secondary={`${user.email} • ${user.role} • ${user.status}`}
                  />
                  <ListItemSecondaryAction>
                    <IconButton edge="end">
                      <EditIcon />
                    </IconButton>
                    <IconButton edge="end" color="error">
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          </Box>
        </TabPanel>

        <TabPanel value={tabValue} index={3}>
          <Box p={3}>
            <Typography variant="h6" gutterBottom>
              System Configuration
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Auto Sync Interval (minutes)"
                  type="number"
                  value={settings.autoSyncInterval}
                  onChange={(e) => setSettings({ ...settings, autoSyncInterval: parseInt(e.target.value) })}
                  helperText="How often to sync offline data"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Max Retry Attempts"
                  type="number"
                  value={settings.maxRetries}
                  onChange={(e) => setSettings({ ...settings, maxRetries: parseInt(e.target.value) })}
                  helperText="Number of retries for failed operations"
                />
              </Grid>
              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" gutterBottom>
                  System Information
                </Typography>
                <List>
                  <ListItem>
                    <ListItemText primary="Version" secondary="1.0.0" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Environment" secondary="Production" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Region" secondary="us-central1" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Last Deployment" secondary="2024-01-15 10:30 UTC" />
                  </ListItem>
                </List>
              </Grid>
              <Grid item xs={12}>
                <Button variant="contained" onClick={handleSaveSettings}>
                  Save System Settings
                </Button>
              </Grid>
            </Grid>
          </Box>
        </TabPanel>
      </Paper>

      {/* API Key Dialog */}
      <Dialog open={apiKeyDialogOpen} onClose={() => setApiKeyDialogOpen(false)}>
        <DialogTitle>Generate New API Key</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Key Name"
            fullWidth
            variant="outlined"
            helperText="Give this API key a descriptive name"
          />
          <TextField
            margin="dense"
            label="Description (optional)"
            fullWidth
            variant="outlined"
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApiKeyDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleGenerateApiKey} variant="contained">
            Generate
          </Button>
        </DialogActions>
      </Dialog>

      {/* User Dialog */}
      <Dialog open={userDialogOpen} onClose={() => setUserDialogOpen(false)}>
        <DialogTitle>Add New User</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Full Name"
            fullWidth
            variant="outlined"
          />
          <TextField
            margin="dense"
            label="Email"
            type="email"
            fullWidth
            variant="outlined"
          />
          <TextField
            margin="dense"
            label="Role"
            select
            fullWidth
            variant="outlined"
            SelectProps={{ native: true }}
          >
            <option value="healthcare_worker">Healthcare Worker</option>
            <option value="admin">Administrator</option>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUserDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => setUserDialogOpen(false)} variant="contained">
            Add User
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
