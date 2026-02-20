import React from 'react';
import {
  Paper,
  Typography,
  Box,
  Alert,
} from '@mui/material';
import { Info } from '@mui/icons-material';

export default function EncounterHistory() {
  return (
    <Paper sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom>
        Encounter History
      </Typography>
      
      <Alert severity="info" icon={<Info />} sx={{ mt: 3 }}>
        <Typography variant="body1">
          Encounter history feature coming soon. This will display:
        </Typography>
        <ul>
          <li>Past patient encounters</li>
          <li>Triage results and levels</li>
          <li>Generated referrals</li>
          <li>Search and filter capabilities</li>
        </ul>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          For now, you can access individual encounters by their ID through the API.
        </Typography>
      </Alert>
    </Paper>
  );
}
