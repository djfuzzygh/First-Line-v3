import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Alert,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import {
  Add,
  Refresh,
  CloudSync,
  CloudOff,
  CloudDone,
  Update,
  RestartAlt,
  Settings,
  Delete,
  Visibility,
  Storage,
  Memory,
  Speed,
} from '@mui/icons-material';
import api from '../../services/api';

interface EdgeDevice {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'offline' | 'syncing';
  lastSync: string;
  modelVersion: string;
  storageUsed: number;
  storageTotal: number;
  cpuUsage: number;
  memoryUsage: number;
  networkStatus: 'good' | 'poor' | 'offline';
  pendingUpdates: number;
  assessmentsToday: number;
}

export default function EdgeDevices() {
  const [devices, setDevices] = useState<EdgeDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<EdgeDevice | null>(null);
  const [newDevice, setNewDevice] = useState({
    name: '',
    location: '',
    ipAddress: '',
  });

  useEffect(() => {
    loadDevices();
    // Poll every 30 seconds
    const interval = setInterval(loadDevices, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDevices = async () => {
    try {
      const response = await api.get('/admin/edge-devices');
      setDevices(response.data);
    } catch (err) {
      console.error('Failed to load devices:', err);
    }
  };

  const handleAddDevice = async () => {
    try {
      await api.post('/admin/edge-devices', newDevice);
      setAddDialogOpen(false);
      setNewDevice({ name: '', location: '', ipAddress: '' });
      loadDevices();
    } catch (err) {
      console.error('Failed to add device:', err);
    }
  };

  const handleUpdate = async (deviceId: string) => {
    try {
      await api.post(`/admin/edge-devices/${deviceId}/update`);
      alert('Update initiated. Device will restart automatically.');
      loadDevices();
    } catch (err) {
      console.error('Failed to update device:', err);
    }
  };

  const handleRestart = async (deviceId: string) => {
    if (confirm('Are you sure you want to restart this device?')) {
      try {
        await api.post(`/admin/edge-devices/${deviceId}/restart`);
        alert('Device restart initiated.');
        loadDevices();
      } catch (err) {
        console.error('Failed to restart device:', err);
      }
    }
  };

  const handleDelete = async (deviceId: string) => {
    if (confirm('Are you sure you want to remove this device? This cannot be undone.')) {
      try {
        await api.delete(`/admin/edge-devices/${deviceId}`);
        loadDevices();
      } catch (err) {
        console.error('Failed to delete device:', err);
      }
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <CloudDone color="success" />;
      case 'syncing':
        return <CloudSync color="info" />;
      case 'offline':
        return <CloudOff color="error" />;
      default:
        return <CloudOff />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'success';
      case 'syncing':
        return 'info';
      case 'offline':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Edge Devices</Typography>
        <Box>
          <Button startIcon={<Refresh />} onClick={loadDevices} sx={{ mr: 1 }}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<Add />} onClick={() => setAddDialogOpen(true)}>
            Add Device
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total Devices
              </Typography>
              <Typography variant="h4">{devices.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Online
              </Typography>
              <Typography variant="h4" color="success.main">
                {devices.filter((d) => d.status === 'online').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Syncing
              </Typography>
              <Typography variant="h4" color="info.main">
                {devices.filter((d) => d.status === 'syncing').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Offline
              </Typography>
              <Typography variant="h4" color="error.main">
                {devices.filter((d) => d.status === 'offline').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Devices Table */}
      <Card>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Device</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Sync</TableCell>
                <TableCell>Model Version</TableCell>
                <TableCell>Resources</TableCell>
                <TableCell>Today</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {devices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography color="text.secondary">
                      No edge devices configured. Add one to get started.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell>
                      <Box>
                        <Typography variant="body1" fontWeight="bold">
                          {device.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {device.location}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getStatusIcon(device.status)}
                        <Chip
                          label={device.status}
                          size="small"
                          color={getStatusColor(device.status) as any}
                        />
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {new Date(device.lastSync).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2">{device.modelVersion}</Typography>
                        {device.pendingUpdates > 0 && (
                          <Chip label={`${device.pendingUpdates} updates`} size="small" color="warning" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ minWidth: 150 }}>
                        <Tooltip title={`Storage: ${device.storageUsed}GB / ${device.storageTotal}GB`}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Storage fontSize="small" />
                            <LinearProgress
                              variant="determinate"
                              value={(device.storageUsed / device.storageTotal) * 100}
                              sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                            />
                          </Box>
                        </Tooltip>
                        <Tooltip title={`CPU: ${device.cpuUsage}%`}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Speed fontSize="small" />
                            <LinearProgress
                              variant="determinate"
                              value={device.cpuUsage}
                              sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                              color={device.cpuUsage > 80 ? 'error' : 'primary'}
                            />
                          </Box>
                        </Tooltip>
                        <Tooltip title={`Memory: ${device.memoryUsage}%`}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Memory fontSize="small" />
                            <LinearProgress
                              variant="determinate"
                              value={device.memoryUsage}
                              sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                              color={device.memoryUsage > 80 ? 'error' : 'primary'}
                            />
                          </Box>
                        </Tooltip>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="h6">{device.assessmentsToday}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        assessments
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="View Details">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setSelectedDevice(device);
                              setDetailsDialogOpen(true);
                            }}
                          >
                            <Visibility />
                          </IconButton>
                        </Tooltip>
                        {device.pendingUpdates > 0 && (
                          <Tooltip title="Update">
                            <IconButton
                              size="small"
                              color="warning"
                              onClick={() => handleUpdate(device.id)}
                            >
                              <Update />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Restart">
                          <IconButton size="small" onClick={() => handleRestart(device.id)}>
                            <RestartAlt />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDelete(device.id)}
                          >
                            <Delete />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Device Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Edge Device</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Device Name"
                  value={newDevice.name}
                  onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                  placeholder="Clinic A - Raspberry Pi"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Location"
                  value={newDevice.location}
                  onChange={(e) => setNewDevice({ ...newDevice, location: e.target.value })}
                  placeholder="Nairobi, Kenya"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="IP Address"
                  value={newDevice.ipAddress}
                  onChange={(e) => setNewDevice({ ...newDevice, ipAddress: e.target.value })}
                  placeholder="192.168.1.100"
                  helperText="Local IP address of the device"
                />
              </Grid>
              <Grid item xs={12}>
                <Alert severity="info">
                  <strong>Setup Instructions:</strong>
                  <ol>
                    <li>Install FirstLine on Raspberry Pi/Jetson</li>
                    <li>Run: <code>sudo firstline-setup</code></li>
                    <li>Copy the device ID shown</li>
                    <li>Enter device details here</li>
                  </ol>
                </Alert>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddDevice}
            disabled={!newDevice.name || !newDevice.location}
          >
            Add Device
          </Button>
        </DialogActions>
      </Dialog>

      {/* Device Details Dialog */}
      <Dialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Device Details: {selectedDevice?.name}</DialogTitle>
        <DialogContent>
          {selectedDevice && (
            <Box sx={{ mt: 2 }}>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        System Info
                      </Typography>
                      <Typography variant="body2">
                        <strong>Device ID:</strong> {selectedDevice.id}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Location:</strong> {selectedDevice.location}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Model Version:</strong> {selectedDevice.modelVersion}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Last Sync:</strong> {new Date(selectedDevice.lastSync).toLocaleString()}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Performance
                      </Typography>
                      <Typography variant="body2">
                        <strong>Assessments Today:</strong> {selectedDevice.assessmentsToday}
                      </Typography>
                      <Typography variant="body2">
                        <strong>CPU Usage:</strong> {selectedDevice.cpuUsage}%
                      </Typography>
                      <Typography variant="body2">
                        <strong>Memory Usage:</strong> {selectedDevice.memoryUsage}%
                      </Typography>
                      <Typography variant="body2">
                        <strong>Storage:</strong> {selectedDevice.storageUsed}GB /{' '}
                        {selectedDevice.storageTotal}GB
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12}>
                  <Alert severity={selectedDevice.status === 'online' ? 'success' : 'warning'}>
                    Device is currently <strong>{selectedDevice.status}</strong>
                  </Alert>
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
