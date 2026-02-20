import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  InputAdornment,
  Chip,
  IconButton,
  CircularProgress,
  Alert,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Search as SearchIcon,
  Visibility as VisibilityIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { encountersApi } from '../services/api';

interface Encounter {
  encounterId: string;
  age: number;
  sex: string;
  location: string;
  symptoms: string;
  channel: string;
  status: string;
  createdAt: string;
  triageLevel?: string;
}

export default function Encounters() {
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [triageFilter, setTriageFilter] = useState('all');

  useEffect(() => {
    loadEncounters();
  }, []);

  const loadEncounters = async () => {
    setLoading(true);
    try {
      const rows = await encountersApi.list(200);
      setEncounters(rows);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load encounters');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const getTriageColor = (level?: string) => {
    switch (level) {
      case 'RED': return 'error';
      case 'YELLOW': return 'warning';
      case 'GREEN': return 'success';
      default: return 'default';
    }
  };

  const getChannelColor = (channel: string) => {
    switch (channel) {
      case 'app': return 'primary';
      case 'voice': return 'secondary';
      case 'sms': return 'warning';
      case 'ussd': return 'info';
      default: return 'default';
    }
  };

  const filteredEncounters = encounters.filter(encounter => {
    const matchesSearch = 
      encounter.encounterId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      encounter.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      encounter.symptoms.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesChannel = channelFilter === 'all' || encounter.channel === channelFilter;
    const matchesTriage = triageFilter === 'all' || encounter.triageLevel === triageFilter;

    return matchesSearch && matchesChannel && matchesTriage;
  });

  const paginatedEncounters = filteredEncounters.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Encounters</Typography>
        <IconButton onClick={loadEncounters} color="primary">
          <RefreshIcon />
        </IconButton>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Box display="flex" gap={2} flexWrap="wrap">
          <TextField
            placeholder="Search encounters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ flexGrow: 1, minWidth: 200 }}
          />

          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>Channel</InputLabel>
            <Select
              value={channelFilter}
              label="Channel"
              onChange={(e) => setChannelFilter(e.target.value)}
            >
              <MenuItem value="all">All Channels</MenuItem>
              <MenuItem value="app">App</MenuItem>
              <MenuItem value="voice">Voice</MenuItem>
              <MenuItem value="sms">SMS</MenuItem>
              <MenuItem value="ussd">USSD</MenuItem>
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>Triage Level</InputLabel>
            <Select
              value={triageFilter}
              label="Triage Level"
              onChange={(e) => setTriageFilter(e.target.value)}
            >
              <MenuItem value="all">All Levels</MenuItem>
              <MenuItem value="RED">RED</MenuItem>
              <MenuItem value="YELLOW">YELLOW</MenuItem>
              <MenuItem value="GREEN">GREEN</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Encounter ID</TableCell>
              <TableCell>Patient</TableCell>
              <TableCell>Location</TableCell>
              <TableCell>Symptoms</TableCell>
              <TableCell>Channel</TableCell>
              <TableCell>Triage</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedEncounters.map((encounter) => (
              <TableRow key={encounter.encounterId} hover>
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace">
                    {encounter.encounterId.substring(0, 8)}...
                  </Typography>
                </TableCell>
                <TableCell>
                  {encounter.age}y, {encounter.sex}
                </TableCell>
                <TableCell>{encounter.location}</TableCell>
                <TableCell>
                  <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                    {encounter.symptoms}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={encounter.channel.toUpperCase()}
                    color={getChannelColor(encounter.channel) as any}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  {encounter.triageLevel ? (
                    <Chip
                      label={encounter.triageLevel}
                      color={getTriageColor(encounter.triageLevel) as any}
                      size="small"
                    />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Pending
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Chip
                    label={encounter.status}
                    variant="outlined"
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {new Date(encounter.createdAt).toLocaleDateString()}
                  </Typography>
                </TableCell>
                <TableCell>
                  <IconButton size="small" color="primary">
                    <VisibilityIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 50]}
          component="div"
          count={filteredEncounters.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </TableContainer>

      {filteredEncounters.length === 0 && (
        <Box textAlign="center" py={4}>
          <Typography color="text.secondary">
            No encounters found
          </Typography>
        </Box>
      )}
    </Box>
  );
}
