import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box } from '@mui/material';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Encounters from './pages/Encounters';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import {
  SystemConfig,
  AIProviders,
  VoiceSystem,
  EdgeDevices,
  TelecomIntegration,
  ProtocolConfig,
  UserManagement,
  Monitoring,
  Deployment,
} from './pages/admin';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Box sx={{ display: 'flex' }}>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/encounters" element={<Encounters />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/settings" element={<Settings />} />
                    
                    {/* Admin Routes */}
                    <Route path="/admin/system-config" element={<SystemConfig />} />
                    <Route path="/admin/ai-providers" element={<AIProviders />} />
                    <Route path="/admin/voice-system" element={<VoiceSystem />} />
                    <Route path="/admin/edge-devices" element={<EdgeDevices />} />
                    <Route path="/admin/telecom" element={<TelecomIntegration />} />
                    <Route path="/admin/protocols" element={<ProtocolConfig />} />
                    <Route path="/admin/users" element={<UserManagement />} />
                    <Route path="/admin/monitoring" element={<Monitoring />} />
                    <Route path="/admin/deployment" element={<Deployment />} />
                  </Routes>
                </Layout>
              </Box>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
