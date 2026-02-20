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
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress,
  Stepper,
  Step,
  StepLabel,
} from '@mui/material';
import {
  Refresh,
  CloudUpload,
  Undo,
  CheckCircle,
  Error as ErrorIcon,
  PlayArrow,
  Stop,
  History,
  Code,
  Build,
} from '@mui/icons-material';
import api from '../../services/api';

interface Version {
  id: string;
  version: string;
  branch: string;
  commit: string;
  author: string;
  message: string;
  timestamp: string;
  status: 'deployed' | 'available' | 'failed';
}

interface Environment {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  version: string;
  lastDeployed: string;
  deployedBy: string;
  url: string;
}

interface Deployment {
  id: string;
  version: string;
  environment: string;
  status: 'pending' | 'in-progress' | 'success' | 'failed' | 'rolled-back';
  startedAt: string;
  completedAt?: string;
  deployedBy: string;
  duration?: number;
}

interface HealthCheck {
  name: string;
  status: 'passing' | 'failing';
  message: string;
  lastChecked: string;
}

export default function Deployment() {
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [versions, setVersions] = useState<Version[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);

  const [deployDialog, setDeployDialog] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [selectedEnvironment, setSelectedEnvironment] = useState('');
  const [deploymentInProgress, setDeploymentInProgress] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [versionsRes, envsRes, deploymentsRes, healthRes] = await Promise.all([
        api.get('/admin/deployment/versions'),
        api.get('/admin/deployment/environments'),
        api.get('/admin/deployment/history'),
        api.get('/admin/deployment/health-checks'),
      ]);
      setVersions(versionsRes.data);
      setEnvironments(envsRes.data);
      setDeployments(deploymentsRes.data);
      setHealthChecks(healthRes.data);
    } catch (err) {
      console.error('Failed to load deployment data:', err);
    }
  };

  const handleDeploy = async () => {
    if (!selectedVersion || !selectedEnvironment) {
      setError('Please select version and environment');
      return;
    }

    setDeploymentInProgress(true);
    setError('');

    try {
      await api.post('/admin/deployment/deploy', {
        version: selectedVersion,
        environment: selectedEnvironment,
      });
      setSuccess(true);
      setDeployDialog(false);
      loadData();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Deployment failed');
    } finally {
      setDeploymentInProgress(false);
    }
  };

  const handleRollback = async (deploymentId: string) => {
    try {
      await api.post('/admin/deployment/rollback', { deploymentId });
      setSuccess(true);
      loadData();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError('Rollback failed');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'success':
      case 'deployed':
      case 'passing':
        return 'success';
      case 'degraded':
      case 'in-progress':
      case 'pending':
        return 'warning';
      case 'down':
      case 'failed':
      case 'failing':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Deployment Management</Typography>
        <Box>
          <Button startIcon={<Refresh />} onClick={loadData} sx={{ mr: 1 }}>
            Reload
          </Button>
          <Button
            variant="contained"
            startIcon={<CloudUpload />}
            onClick={() => setDeployDialog(true)}
          >
            Deploy
          </Button>
        </Box>
      </Box>

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Deployment action completed successfully!
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Environment Status Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {environments.map((env) => (
          <Grid item xs={12} md={4} key={env.name}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h6">{env.name}</Typography>
                  <Chip
                    label={env.status}
                    color={getStatusColor(env.status)}
                    size="small"
                    icon={
                      env.status === 'healthy' ? <CheckCircle /> : <ErrorIcon />
                    }
                  />
                </Box>

                <Typography variant="body2" color="text.secondary">
                  Version: {env.version}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Last deployed: {new Date(env.lastDeployed).toLocaleDateString()}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  By: {env.deployedBy}
                </Typography>

                <Box sx={{ mt: 2 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    href={env.url}
                    target="_blank"
                    sx={{ mr: 1 }}
                  >
                    Open
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setSelectedEnvironment(env.name);
                      setDeployDialog(true);
                    }}
                  >
                    Deploy
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="Available Versions" />
          <Tab label="Deployment History" />
          <Tab label="Health Checks" />
          <Tab label="CI/CD Status" />
        </Tabs>

        <CardContent>
          {/* Available Versions */}
          {activeTab === 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Available Versions
              </Typography>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Version</TableCell>
                    <TableCell>Branch</TableCell>
                    <TableCell>Commit</TableCell>
                    <TableCell>Author</TableCell>
                    <TableCell>Message</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {versions.map((version) => (
                    <TableRow key={version.id}>
                      <TableCell>
                        <Chip label={version.version} size="small" />
                      </TableCell>
                      <TableCell>{version.branch}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Code fontSize="small" />
                          {version.commit.substring(0, 7)}
                        </Box>
                      </TableCell>
                      <TableCell>{version.author}</TableCell>
                      <TableCell>{version.message}</TableCell>
                      <TableCell>
                        {new Date(version.timestamp).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={version.status}
                          color={getStatusColor(version.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<CloudUpload />}
                          onClick={() => {
                            setSelectedVersion(version.version);
                            setDeployDialog(true);
                          }}
                        >
                          Deploy
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {versions.length === 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  No versions available for deployment.
                </Alert>
              )}
            </Box>
          )}

          {/* Deployment History */}
          {activeTab === 1 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Recent Deployments
              </Typography>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Version</TableCell>
                    <TableCell>Environment</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Started</TableCell>
                    <TableCell>Duration</TableCell>
                    <TableCell>Deployed By</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {deployments.map((deployment) => (
                    <TableRow key={deployment.id}>
                      <TableCell>
                        <Chip label={deployment.version} size="small" />
                      </TableCell>
                      <TableCell>{deployment.environment}</TableCell>
                      <TableCell>
                        <Chip
                          label={deployment.status}
                          color={getStatusColor(deployment.status)}
                          size="small"
                          icon={
                            deployment.status === 'in-progress' ? (
                              <PlayArrow />
                            ) : deployment.status === 'success' ? (
                              <CheckCircle />
                            ) : deployment.status === 'failed' ? (
                              <ErrorIcon />
                            ) : undefined
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(deployment.startedAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {deployment.duration
                          ? `${Math.floor(deployment.duration / 60)}m ${
                              deployment.duration % 60
                            }s`
                          : '-'}
                      </TableCell>
                      <TableCell>{deployment.deployedBy}</TableCell>
                      <TableCell>
                        {deployment.status === 'success' && (
                          <Button
                            size="small"
                            variant="outlined"
                            color="warning"
                            startIcon={<Undo />}
                            onClick={() => handleRollback(deployment.id)}
                          >
                            Rollback
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {deployments.length === 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  No deployment history available.
                </Alert>
              )}
            </Box>
          )}

          {/* Health Checks */}
          {activeTab === 2 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                System Health Checks
              </Typography>

              <Grid container spacing={2}>
                {healthChecks.map((check, index) => (
                  <Grid item xs={12} md={6} key={index}>
                    <Card variant="outlined">
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="h6">{check.name}</Typography>
                          <Chip
                            label={check.status}
                            color={getStatusColor(check.status)}
                            size="small"
                            icon={
                              check.status === 'passing' ? (
                                <CheckCircle />
                              ) : (
                                <ErrorIcon />
                              )
                            }
                          />
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          {check.message}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Last checked: {new Date(check.lastChecked).toLocaleString()}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>

              {healthChecks.length === 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  No health checks configured.
                </Alert>
              )}
            </Box>
          )}

          {/* CI/CD Status */}
          {activeTab === 3 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                CI/CD Pipeline Status
              </Typography>

              <Card variant="outlined" sx={{ mb: 3 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Build color="primary" />
                    <Typography variant="h6">Latest Build</Typography>
                    <Chip label="Success" color="success" size="small" />
                  </Box>

                  <Stepper activeStep={3}>
                    <Step completed>
                      <StepLabel>Code Checkout</StepLabel>
                    </Step>
                    <Step completed>
                      <StepLabel>Install Dependencies</StepLabel>
                    </Step>
                    <Step completed>
                      <StepLabel>Run Tests</StepLabel>
                    </Step>
                    <Step completed>
                      <StepLabel>Build</StepLabel>
                    </Step>
                  </Stepper>

                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Build #123 - main branch
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Duration: 3m 45s
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Triggered by: push event
                    </Typography>
                  </Box>
                </CardContent>
              </Card>

              <Alert severity="info">
                <Typography variant="body2">
                  <strong>Auto-Deploy:</strong> Enabled for development environment
                  <br />
                  <strong>Manual Approval:</strong> Required for staging and production
                </Typography>
              </Alert>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Deploy Dialog */}
      <Dialog open={deployDialog} onClose={() => setDeployDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Deploy New Version</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl fullWidth required>
                <InputLabel>Version</InputLabel>
                <Select
                  value={selectedVersion}
                  onChange={(e) => setSelectedVersion(e.target.value)}
                >
                  {versions.map((version) => (
                    <MenuItem key={version.id} value={version.version}>
                      {version.version} - {version.message}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <FormControl fullWidth required>
                <InputLabel>Environment</InputLabel>
                <Select
                  value={selectedEnvironment}
                  onChange={(e) => setSelectedEnvironment(e.target.value)}
                >
                  {environments.map((env) => (
                    <MenuItem key={env.name} value={env.name}>
                      {env.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {selectedVersion && selectedEnvironment && (
              <Grid item xs={12}>
                <Alert severity="warning">
                  <Typography variant="body2">
                    <strong>Warning:</strong> This will deploy version {selectedVersion} to{' '}
                    {selectedEnvironment} environment. Current users may experience brief
                    downtime.
                  </Typography>
                </Alert>
              </Grid>
            )}

            {deploymentInProgress && (
              <Grid item xs={12}>
                <LinearProgress />
                <Typography variant="body2" align="center" sx={{ mt: 1 }}>
                  Deployment in progress...
                </Typography>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeployDialog(false)} disabled={deploymentInProgress}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleDeploy}
            disabled={!selectedVersion || !selectedEnvironment || deploymentInProgress}
          >
            Deploy
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
