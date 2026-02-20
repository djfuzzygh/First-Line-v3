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
  LinearProgress,
  IconButton,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Refresh,
  CheckCircle,
  Error as ErrorIcon,
  Warning,
  TrendingUp,
  TrendingDown,
  Speed,
  Storage,
  Memory,
  CloudQueue,
  Notifications,
  NotificationsOff,
} from '@mui/icons-material';
import api from '../../services/api';

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  requestRate: number;
  errorRate: number;
  avgResponseTime: number;
}

interface APIMetric {
  endpoint: string;
  requests: number;
  successRate: number;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
}

interface DatabaseMetric {
  readCapacity: number;
  writeCapacity: number;
  readLatency: number;
  writeLatency: number;
  throttles: number;
  storageUsage: number;
}

interface AIMetric {
  provider: string;
  status: 'online' | 'offline';
  requests: number;
  avgInferenceTime: number;
  costPerRequest: number;
  totalCost: number;
}

interface AlertItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

interface LogEntry {
  id: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  timestamp: string;
  source: string;
}

export default function Monitoring() {
  const [activeTab, setActiveTab] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    status: 'healthy',
    uptime: 99.9,
    requestRate: 1234,
    errorRate: 0.5,
    avgResponseTime: 145,
  });

  const [apiMetrics, setApiMetrics] = useState<APIMetric[]>([]);
  const [dbMetrics, setDbMetrics] = useState<DatabaseMetric>({
    readCapacity: 75,
    writeCapacity: 45,
    readLatency: 12,
    writeLatency: 18,
    throttles: 0,
    storageUsage: 45.2,
  });
  const [aiMetrics, setAiMetrics] = useState<AIMetric[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    loadData();
    if (autoRefresh) {
      const interval = setInterval(loadData, 30000); // Refresh every 30s
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const loadData = async () => {
    try {
      const [healthRes, apiRes, dbRes, aiRes, alertsRes, logsRes] = await Promise.all([
        api.get('/admin/monitoring/health'),
        api.get('/admin/monitoring/api-metrics'),
        api.get('/admin/monitoring/database-metrics'),
        api.get('/admin/monitoring/ai-metrics'),
        api.get('/admin/monitoring/alerts'),
        api.get('/admin/monitoring/logs'),
      ]);
      setSystemHealth(healthRes.data);
      setApiMetrics(apiRes.data);
      setDbMetrics(dbRes.data);
      setAiMetrics(aiRes.data);
      setAlerts(alertsRes.data);
      setLogs(logsRes.data);
    } catch (err) {
      console.error('Failed to load monitoring data:', err);
    }
  };

  const handleAcknowledgeAlert = async (id: string) => {
    try {
      await api.post(`/admin/monitoring/alerts/${id}/acknowledge`);
      loadData();
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'online':
        return 'success';
      case 'degraded':
      case 'warning':
        return 'warning';
      case 'down':
      case 'offline':
      case 'critical':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">System Monitoring</Typography>
        <Box>
          <Button
            startIcon={autoRefresh ? <NotificationsOff /> : <Notifications />}
            onClick={() => setAutoRefresh(!autoRefresh)}
            sx={{ mr: 1 }}
          >
            {autoRefresh ? 'Disable' : 'Enable'} Auto-Refresh
          </Button>
          <Button startIcon={<Refresh />} onClick={loadData}>
            Refresh Now
          </Button>
        </Box>
      </Box>

      {/* System Health Overview */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CheckCircle color={getStatusColor(systemHealth.status)} />
                <Typography variant="h6">System Status</Typography>
              </Box>
              <Typography variant="h4">
                <Chip
                  label={systemHealth.status.toUpperCase()}
                  color={getStatusColor(systemHealth.status)}
                />
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Uptime: {systemHealth.uptime}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <TrendingUp color="primary" />
                <Typography variant="h6">Request Rate</Typography>
              </Box>
              <Typography variant="h4">{systemHealth.requestRate}</Typography>
              <Typography variant="body2" color="text.secondary">
                requests/min
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ErrorIcon color={systemHealth.errorRate > 1 ? 'error' : 'success'} />
                <Typography variant="h6">Error Rate</Typography>
              </Box>
              <Typography variant="h4">{systemHealth.errorRate}%</Typography>
              <Typography variant="body2" color="text.secondary">
                of requests
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Speed color="primary" />
                <Typography variant="h6">Response Time</Typography>
              </Box>
              <Typography variant="h4">{systemHealth.avgResponseTime}ms</Typography>
              <Typography variant="body2" color="text.secondary">
                average
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="API Metrics" />
          <Tab label="Database Stats" />
          <Tab label="AI Performance" />
          <Tab label="Alerts" />
          <Tab label="Logs" />
        </Tabs>

        <CardContent>
          {/* API Metrics */}
          {activeTab === 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                API Endpoint Performance
              </Typography>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Endpoint</TableCell>
                    <TableCell>Requests</TableCell>
                    <TableCell>Success Rate</TableCell>
                    <TableCell>Avg Latency</TableCell>
                    <TableCell>P95</TableCell>
                    <TableCell>P99</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {apiMetrics.map((metric, index) => (
                    <TableRow key={index}>
                      <TableCell>{metric.endpoint}</TableCell>
                      <TableCell>{metric.requests.toLocaleString()}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={metric.successRate}
                            sx={{ width: 100 }}
                            color={metric.successRate >= 99 ? 'success' : 'warning'}
                          />
                          <Typography variant="body2">{metric.successRate}%</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>{metric.avgLatency}ms</TableCell>
                      <TableCell>{metric.p95Latency}ms</TableCell>
                      <TableCell>{metric.p99Latency}ms</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {apiMetrics.length === 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  No API metrics available yet.
                </Alert>
              )}
            </Box>
          )}

          {/* Database Stats */}
          {activeTab === 1 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Firestore Performance
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <Storage color="primary" />
                      <Typography variant="h6">Capacity Usage</Typography>
                    </Box>

                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" gutterBottom>
                        Read Capacity: {dbMetrics.readCapacity}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={dbMetrics.readCapacity}
                        color={dbMetrics.readCapacity > 80 ? 'warning' : 'primary'}
                      />
                    </Box>

                    <Box>
                      <Typography variant="body2" gutterBottom>
                        Write Capacity: {dbMetrics.writeCapacity}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={dbMetrics.writeCapacity}
                        color={dbMetrics.writeCapacity > 80 ? 'warning' : 'primary'}
                      />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <Speed color="primary" />
                      <Typography variant="h6">Latency</Typography>
                    </Box>

                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">
                          Read Latency
                        </Typography>
                        <Typography variant="h5">{dbMetrics.readLatency}ms</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">
                          Write Latency
                        </Typography>
                        <Typography variant="h5">{dbMetrics.writeLatency}ms</Typography>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <Warning color={dbMetrics.throttles > 0 ? 'error' : 'success'} />
                      <Typography variant="h6">Throttles</Typography>
                    </Box>
                    <Typography variant="h4">{dbMetrics.throttles}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      in last hour
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <Memory color="primary" />
                      <Typography variant="h6">Storage</Typography>
                    </Box>
                    <Typography variant="h4">{dbMetrics.storageUsage} GB</Typography>
                    <Typography variant="body2" color="text.secondary">
                      total usage
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          {/* AI Performance */}
          {activeTab === 2 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                AI Provider Performance
              </Typography>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Provider</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Requests</TableCell>
                    <TableCell>Avg Inference Time</TableCell>
                    <TableCell>Cost/Request</TableCell>
                    <TableCell>Total Cost</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {aiMetrics.map((metric, index) => (
                    <TableRow key={index}>
                      <TableCell>{metric.provider}</TableCell>
                      <TableCell>
                        <Chip
                          label={metric.status}
                          color={getStatusColor(metric.status)}
                          size="small"
                          icon={
                            metric.status === 'online' ? <CheckCircle /> : <ErrorIcon />
                          }
                        />
                      </TableCell>
                      <TableCell>{metric.requests.toLocaleString()}</TableCell>
                      <TableCell>{metric.avgInferenceTime}ms</TableCell>
                      <TableCell>${metric.costPerRequest.toFixed(4)}</TableCell>
                      <TableCell>${metric.totalCost.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {aiMetrics.length === 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  No AI metrics available yet.
                </Alert>
              )}
            </Box>
          )}

          {/* Alerts */}
          {activeTab === 3 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">Active Alerts</Typography>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel>Filter</InputLabel>
                  <Select defaultValue="all">
                    <MenuItem value="all">All Alerts</MenuItem>
                    <MenuItem value="critical">Critical</MenuItem>
                    <MenuItem value="warning">Warning</MenuItem>
                    <MenuItem value="info">Info</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              {alerts.map((alert) => (
                <Alert
                  key={alert.id}
                  severity={alert.severity}
                  sx={{ mb: 2 }}
                  action={
                    !alert.acknowledged && (
                      <Button
                        color="inherit"
                        size="small"
                        onClick={() => handleAcknowledgeAlert(alert.id)}
                      >
                        Acknowledge
                      </Button>
                    )
                  }
                >
                  <Typography variant="body1" fontWeight="bold">
                    {alert.title}
                  </Typography>
                  <Typography variant="body2">{alert.message}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(alert.timestamp).toLocaleString()}
                  </Typography>
                </Alert>
              ))}

              {alerts.length === 0 && (
                <Alert severity="success">
                  <Typography variant="body1" fontWeight="bold">
                    All Clear!
                  </Typography>
                  <Typography variant="body2">No active alerts at this time.</Typography>
                </Alert>
              )}
            </Box>
          )}

          {/* Logs */}
          {activeTab === 4 && (
            <Box>
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel>Log Level</InputLabel>
                  <Select defaultValue="all">
                    <MenuItem value="all">All Levels</MenuItem>
                    <MenuItem value="error">Error</MenuItem>
                    <MenuItem value="warn">Warning</MenuItem>
                    <MenuItem value="info">Info</MenuItem>
                    <MenuItem value="debug">Debug</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  size="small"
                  placeholder="Search logs..."
                  sx={{ flexGrow: 1 }}
                />
              </Box>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Level</TableCell>
                    <TableCell>Source</TableCell>
                    <TableCell>Message</TableCell>
                    <TableCell>Timestamp</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Chip
                          label={log.level.toUpperCase()}
                          color={
                            log.level === 'error'
                              ? 'error'
                              : log.level === 'warn'
                              ? 'warning'
                              : 'default'
                          }
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{log.source}</TableCell>
                      <TableCell>{log.message}</TableCell>
                      <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {logs.length === 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  No logs available.
                </Alert>
              )}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
