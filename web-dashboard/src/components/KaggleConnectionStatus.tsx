import React, { useState, useEffect } from 'react';
import { Box, Chip, Tooltip, CircularProgress } from '@mui/material';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';

interface KaggleStatus {
  connected: boolean;
  latencyMs: number;
  kaggleUrl: string | null;
  timestamp: string;
  fallbackActive: boolean;
  message: string;
}

export const KaggleConnectionStatus: React.FC = () => {
  const [status, setStatus] = useState<KaggleStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial check
    checkKaggleStatus();

    // Poll every 10 seconds to keep status fresh
    const interval = setInterval(checkKaggleStatus, 10000);

    return () => clearInterval(interval);
  }, []);

  const checkKaggleStatus = async () => {
    try {
      const response = await fetch('/kaggle/health');
      if (response.ok) {
        const data = (await response.json()) as KaggleStatus;
        setStatus(data);
      }
    } catch (error) {
      console.error('Failed to check Kaggle status:', error);
      setStatus({
        connected: false,
        latencyMs: 0,
        kaggleUrl: null,
        timestamp: new Date().toISOString(),
        fallbackActive: true,
        message: 'Failed to check Kaggle status',
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Tooltip title="Checking Kaggle connection...">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={20} />
        </Box>
      </Tooltip>
    );
  }

  if (!status) {
    return null;
  }

  const isConnected = status.connected;
  const color = isConnected ? '#4CAF50' : '#FF9800';
  const bgColor = isConnected ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 152, 0, 0.1)';

  return (
    <Tooltip
      title={
        <Box sx={{ whiteSpace: 'pre-wrap', maxWidth: 300 }}>
          {`${isConnected ? '✅ Kaggle Connected' : '⚠️ Kaggle Offline'}\n\n`}
          {`Status: ${isConnected ? 'Online' : 'Offline (Using Fallback)}\n`}
          {`Latency: ${status.latencyMs}ms\n`}
          {status.kaggleUrl && `URL: ${status.kaggleUrl}\n`}
          {`Last checked: ${new Date(status.timestamp).toLocaleTimeString()}\n\n`}
          {status.message}
        </Box>
      }
    >
      <Chip
        icon={<FiberManualRecordIcon sx={{ color }} />}
        label={isConnected ? 'Kaggle Online' : 'Kaggle Offline'}
        size="small"
        variant="outlined"
        sx={{
          backgroundColor: bgColor,
          borderColor: color,
          color: isConnected ? '#2E7D32' : '#E65100',
          fontWeight: 500,
          cursor: 'pointer',
          '& .MuiChip-deleteIcon': {
            color: color,
          },
        }}
        onClick={checkKaggleStatus}
      />
    </Tooltip>
  );
};
