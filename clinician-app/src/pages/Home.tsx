import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Box,
} from '@mui/material';
import {
  PersonAdd,
  History,
  LocalHospital,
  Assessment,
  Phone,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Welcome, {user?.name}
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        FirstLine Clinical Triage System - Start a new patient encounter or review history
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <PersonAdd sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                <Typography variant="h5" component="div">
                  New Patient
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Start a new triage session for a patient. Collect demographics, symptoms,
                and vitals to get AI-powered clinical recommendations.
              </Typography>
            </CardContent>
            <CardActions>
              <Button
                size="large"
                variant="contained"
                onClick={() => navigate('/new-encounter')}
              >
                Start New Encounter
              </Button>
            </CardActions>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <History sx={{ fontSize: 40, mr: 2, color: 'secondary.main' }} />
                <Typography variant="h5" component="div">
                  Encounter History
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                View past patient encounters, triage results, and referrals.
                Review clinical decisions and outcomes.
              </Typography>
            </CardContent>
            <CardActions>
              <Button
                size="large"
                variant="outlined"
                onClick={() => navigate('/history')}
              >
                View History
              </Button>
            </CardActions>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <LocalHospital sx={{ fontSize: 40, mr: 2, color: 'success.main' }} />
                <Typography variant="h5" component="div">
                  Quick Reference
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                <strong>Triage Levels:</strong><br />
                🔴 RED - Immediate emergency care required<br />
                🟡 YELLOW - Urgent care within 24 hours<br />
                🟢 GREEN - Routine care, self-care possible
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Phone sx={{ fontSize: 40, mr: 2, color: 'warning.main' }} />
                <Typography variant="h5" component="div">
                  Voice IVR Demo
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Try the interactive voice triage system. Simulates toll-free number
                experience with voice-driven menu and SMS results.
              </Typography>
            </CardContent>
            <CardActions>
              <Button
                size="large"
                variant="outlined"
                onClick={() => navigate('/voice-ivr')}
              >
                Demo Voice Triage
              </Button>
            </CardActions>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Assessment sx={{ fontSize: 40, mr: 2, color: 'info.main' }} />
                <Typography variant="h5" component="div">
                  System Info
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                <strong>Organization:</strong> {user?.organization}<br />
                <strong>Role:</strong> {user?.role}<br />
                <strong>Channel:</strong> Web Application
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
