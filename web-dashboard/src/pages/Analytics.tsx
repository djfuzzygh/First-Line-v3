import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Download as DownloadIcon,
  DateRange as DateRangeIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

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

export default function Analytics() {
  const [timeRange, setTimeRange] = useState('7days');
  const [tabValue, setTabValue] = useState(0);

  // Mock data for trends
  const encounterTrends = [
    { date: '2024-01-01', total: 45, red: 5, yellow: 20, green: 20 },
    { date: '2024-01-02', total: 52, red: 8, yellow: 22, green: 22 },
    { date: '2024-01-03', total: 48, red: 6, yellow: 18, green: 24 },
    { date: '2024-01-04', total: 61, red: 10, yellow: 25, green: 26 },
    { date: '2024-01-05', total: 55, red: 7, yellow: 23, green: 25 },
    { date: '2024-01-06', total: 58, red: 9, yellow: 24, green: 25 },
    { date: '2024-01-07', total: 63, red: 11, yellow: 26, green: 26 },
  ];

  const channelTrends = [
    { date: '2024-01-01', app: 25, voice: 10, sms: 7, ussd: 3 },
    { date: '2024-01-02', app: 28, voice: 12, sms: 8, ussd: 4 },
    { date: '2024-01-03', app: 26, voice: 11, sms: 8, ussd: 3 },
    { date: '2024-01-04', app: 32, voice: 15, sms: 10, ussd: 4 },
    { date: '2024-01-05', app: 30, voice: 13, sms: 9, ussd: 3 },
    { date: '2024-01-06', app: 31, voice: 14, sms: 9, ussd: 4 },
    { date: '2024-01-07', app: 34, voice: 15, sms: 10, ussd: 4 },
  ];

  const handleExport = (format: 'csv' | 'pdf') => {
    // TODO: Implement export functionality
    console.log(`Exporting as ${format}`);
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Analytics & Reports</Typography>
        <Box display="flex" gap={2}>
          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>Time Range</InputLabel>
            <Select
              value={timeRange}
              label="Time Range"
              onChange={(e) => setTimeRange(e.target.value)}
              startAdornment={<DateRangeIcon sx={{ mr: 1, color: 'action.active' }} />}
            >
              <MenuItem value="24hours">Last 24 Hours</MenuItem>
              <MenuItem value="7days">Last 7 Days</MenuItem>
              <MenuItem value="30days">Last 30 Days</MenuItem>
              <MenuItem value="90days">Last 90 Days</MenuItem>
              <MenuItem value="custom">Custom Range</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => handleExport('csv')}
          >
            Export CSV
          </Button>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={() => handleExport('pdf')}
          >
            Export PDF
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Avg Response Time
              </Typography>
              <Typography variant="h4">2.3s</Typography>
              <Typography variant="body2" color="success.main">
                ↓ 15% from last week
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Completion Rate
              </Typography>
              <Typography variant="h4">94%</Typography>
              <Typography variant="body2" color="success.main">
                ↑ 3% from last week
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Referral Rate
              </Typography>
              <Typography variant="h4">18%</Typography>
              <Typography variant="body2" color="text.secondary">
                → No change
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Offline Syncs
              </Typography>
              <Typography variant="h4">127</Typography>
              <Typography variant="body2" color="warning.main">
                ↑ 8% from last week
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
          <Tab label="Encounter Trends" />
          <Tab label="Channel Usage" />
          <Tab label="Performance" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <Box p={2}>
            <Typography variant="h6" gutterBottom>
              Encounter Volume by Triage Level
            </Typography>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={encounterTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="red"
                  stackId="1"
                  stroke="#F44336"
                  fill="#F44336"
                  name="RED"
                />
                <Area
                  type="monotone"
                  dataKey="yellow"
                  stackId="1"
                  stroke="#FF9800"
                  fill="#FF9800"
                  name="YELLOW"
                />
                <Area
                  type="monotone"
                  dataKey="green"
                  stackId="1"
                  stroke="#4CAF50"
                  fill="#4CAF50"
                  name="GREEN"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Box p={2}>
            <Typography variant="h6" gutterBottom>
              Channel Usage Over Time
            </Typography>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={channelTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="app" stroke="#2196F3" name="App" />
                <Line type="monotone" dataKey="voice" stroke="#9C27B0" name="Voice" />
                <Line type="monotone" dataKey="sms" stroke="#FF5722" name="SMS" />
                <Line type="monotone" dataKey="ussd" stroke="#607D8B" name="USSD" />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Box p={2}>
            <Typography variant="h6" gutterBottom>
              System Performance Metrics
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" color="textSecondary">
                      AI Engine Latency
                    </Typography>
                    <Typography variant="h5">1.8s avg</Typography>
                    <Typography variant="body2">
                      95th percentile: 3.2s
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" color="textSecondary">
                      Database Query Time
                    </Typography>
                    <Typography variant="h5">45ms avg</Typography>
                    <Typography variant="body2">
                      95th percentile: 120ms
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" color="textSecondary">
                      API Success Rate
                    </Typography>
                    <Typography variant="h5">99.7%</Typography>
                    <Typography variant="body2">
                      3 errors in last 1000 requests
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" color="textSecondary">
                      Offline Sync Success
                    </Typography>
                    <Typography variant="h5">98.2%</Typography>
                    <Typography variant="body2">
                      2 failed syncs in last 100
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>
        </TabPanel>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Quick Reports
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={4}>
            <Button fullWidth variant="outlined">
              Daily Summary Report
            </Button>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Button fullWidth variant="outlined">
              Weekly Performance Report
            </Button>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Button fullWidth variant="outlined">
              Monthly Statistics Report
            </Button>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Button fullWidth variant="outlined">
              Danger Signs Report
            </Button>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Button fullWidth variant="outlined">
              Channel Performance Report
            </Button>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Button fullWidth variant="outlined">
              User Activity Report
            </Button>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}

