import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  Alert,
  Tabs,
  Tab,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
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
  CircularProgress,
} from '@mui/material';
import {
  Save,
  Refresh,
  PlayArrow,
  CheckCircle,
  Error as ErrorIcon,
  TrendingUp,
  Speed,
  AttachMoney,
} from '@mui/icons-material';
import api from '../../services/api';

interface AIProviderConfig {
  activeProvider: 'bedrock' | 'vertexai' | 'openai' | 'kaggle' | 'huggingface';
  bedrock: {
    region: string;
    modelId: string;
    maxTokens: number;
    temperature: number;
  };
  vertexai: {
    projectId: string;
    region: string;
    modelId: string;
    accessToken: string;
    maxTokens: number;
    temperature: number;
  };
  kaggle: {
    endpoint: string;
    apiKey: string;
    modelId: string;
    maxTokens: number;
    temperature: number;
  };
  huggingface: {
    endpoint: string;
    apiKey: string;
    modelId: string;
    maxTokens: number;
    temperature: number;
  };
  openai: {
    apiKey: string;
    modelId: string;
    maxTokens: number;
    temperature: number;
  };
  fallback: {
    enabled: boolean;
    chain: string[];
    failureThreshold: number;
  };
}

interface TestResult {
  provider: string;
  success: boolean;
  latency: number;
  cost: number;
  response: string;
  error?: string;
}

export default function AIProviders() {
  const [config, setConfig] = useState<AIProviderConfig>({
    activeProvider: 'vertexai',
    bedrock: {
      region: 'us-east-1',
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      maxTokens: 500,
      temperature: 0.3,
    },
    vertexai: {
      projectId: '',
      region: 'us-central1',
      modelId: 'medgemma-2b',
      accessToken: '',
      maxTokens: 500,
      temperature: 0.3,
    },
    kaggle: {
      endpoint: '',
      apiKey: '',
      modelId: 'medgemma-kaggle',
      maxTokens: 500,
      temperature: 0.2,
    },
    huggingface: {
      endpoint: '',
      apiKey: '',
      modelId: 'google/medgemma-2b-it',
      maxTokens: 500,
      temperature: 0.2,
    },
    openai: {
      apiKey: '',
      modelId: 'gpt-4',
      maxTokens: 500,
      temperature: 0.3,
    },
    fallback: {
      enabled: true,
      chain: ['vertexai', 'bedrock'],
      failureThreshold: 3,
    },
  });

  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await api.get('/admin/ai-providers');
      setConfig(response.data);
    } catch (err) {
      console.error('Failed to load AI provider config:', err);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      await api.put('/admin/ai-providers', config);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResults([]);

    try {
      const response = await api.post('/admin/ai-providers/test', {
        providers: [config.activeProvider],
        testCase: {
          symptoms: 'fever and cough for 3 days',
          age: 35,
          sex: 'M',
        },
      });

      setTestResults(response.data.results);
    } catch (err: any) {
      setError('Test failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setTesting(false);
    }
  };

  const handleChange = (provider: string, field: string, value: any) => {
    setConfig((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider as keyof AIProviderConfig],
        [field]: value,
      },
    }));
  };

  const bedrockModels = [
    'anthropic.claude-3-haiku-20240307-v1:0',
    'anthropic.claude-3-sonnet-20240229-v1:0',
    'anthropic.claude-3-opus-20240229-v1:0',
    'amazon.titan-text-express-v1',
  ];

  const vertexaiModels = ['medgemma-2b', 'medgemma-7b', 'gemini-pro'];

  const openaiModels = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">AI Provider Configuration</Typography>
        <Box>
          <Button startIcon={<PlayArrow />} onClick={() => setTestDialogOpen(true)} sx={{ mr: 1 }}>
            Test
          </Button>
          <Button startIcon={<Refresh />} onClick={loadConfig} sx={{ mr: 1 }}>
            Reload
          </Button>
          <Button variant="contained" startIcon={<Save />} onClick={handleSave} disabled={loading}>
            Save Changes
          </Button>
        </Box>
      </Box>

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          AI provider configuration saved successfully!
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Active Provider
          </Typography>
          <FormControl fullWidth>
            <InputLabel>Select AI Provider</InputLabel>
            <Select
              value={config.activeProvider}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, activeProvider: e.target.value as any }))
              }
            >
              <MenuItem value="bedrock">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  AWS Bedrock (Claude)
                  <Chip label="Legacy Fallback" size="small" />
                </Box>
              </MenuItem>
              <MenuItem value="vertexai">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  Google Vertex AI (MedGemma)
                  <Chip label="Default" size="small" color="primary" />
                  <Chip label="Medical" size="small" color="success" />
                </Box>
              </MenuItem>
              <MenuItem value="kaggle">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  Kaggle Endpoint (MedGemma)
                  <Chip label="Demo/Test" size="small" color="warning" />
                </Box>
              </MenuItem>
              <MenuItem value="openai">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  OpenAI (GPT-4)
                  <Chip label="Coming Soon" size="small" />
                </Box>
              </MenuItem>
              <MenuItem value="huggingface">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  Hugging Face (MedGemma)
                  <Chip label="Endpoint/API" size="small" color="info" />
                </Box>
              </MenuItem>
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      <Card>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="Legacy Bedrock" />
          <Tab label="Google Vertex AI" />
          <Tab label="Kaggle" />
          <Tab label="OpenAI" />
          <Tab label="Fallback Chain" />
          <Tab label="Cost Analysis" />
        </Tabs>

        <CardContent>
          {/* AWS Bedrock */}
          {activeTab === 0 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Legacy Bedrock Configuration
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Optional fallback provider when Vertex AI is unavailable
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="AWS Region"
                  value={config.bedrock.region}
                  onChange={(e) => handleChange('bedrock', 'region', e.target.value)}
                  helperText="Region where Bedrock is available"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Model ID</InputLabel>
                  <Select
                    value={config.bedrock.modelId}
                    onChange={(e) => handleChange('bedrock', 'modelId', e.target.value)}
                  >
                    {bedrockModels.map((model) => (
                      <MenuItem key={model} value={model}>
                        {model}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Max Output Tokens"
                  value={config.bedrock.maxTokens}
                  onChange={(e) => handleChange('bedrock', 'maxTokens', parseInt(e.target.value))}
                  helperText="Maximum tokens in response (100-4000)"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Temperature"
                  value={config.bedrock.temperature}
                  onChange={(e) => handleChange('bedrock', 'temperature', parseFloat(e.target.value))}
                  inputProps={{ min: 0, max: 1, step: 0.1 }}
                  helperText="Randomness (0=deterministic, 1=creative)"
                />
              </Grid>

              <Grid item xs={12}>
                <Alert severity="info">
                  Use Bedrock only as a fallback path if you are standardizing on Google-hosted infrastructure.
                </Alert>
              </Grid>
            </Grid>
          )}

          {/* Google Vertex AI */}
          {activeTab === 1 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Google Vertex AI Configuration (MedGemma)
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Configure Google Vertex AI for medical-specific models
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="GCP Project ID"
                  value={config.vertexai.projectId}
                  onChange={(e) => handleChange('vertexai', 'projectId', e.target.value)}
                  helperText="Your Google Cloud project ID"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="GCP Region"
                  value={config.vertexai.region}
                  onChange={(e) => handleChange('vertexai', 'region', e.target.value)}
                  helperText="e.g., us-central1, europe-west1"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Model ID</InputLabel>
                  <Select
                    value={config.vertexai.modelId}
                    onChange={(e) => handleChange('vertexai', 'modelId', e.target.value)}
                  >
                    {vertexaiModels.map((model) => (
                      <MenuItem key={model} value={model}>
                        {model}
                        {model.includes('medgemma') && (
                          <Chip label="Medical" size="small" color="success" sx={{ ml: 1 }} />
                        )}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="password"
                  label="Access Token"
                  value={config.vertexai.accessToken}
                  onChange={(e) => handleChange('vertexai', 'accessToken', e.target.value)}
                  helperText="GCP access token or leave empty for metadata service"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Max Output Tokens"
                  value={config.vertexai.maxTokens}
                  onChange={(e) => handleChange('vertexai', 'maxTokens', parseInt(e.target.value))}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Temperature"
                  value={config.vertexai.temperature}
                  onChange={(e) => handleChange('vertexai', 'temperature', parseFloat(e.target.value))}
                  inputProps={{ min: 0, max: 1, step: 0.1 }}
                />
              </Grid>

              <Grid item xs={12}>
                <Alert severity="success">
                  <strong>Cost:</strong> MedGemma: lower token cost than most general-purpose LLMs
                  <br />
                  <strong>Typical triage:</strong> optimized for healthcare tasks and model governance
                  <br />
                  <strong>Benefit:</strong> Medical-specific training for better clinical accuracy
                </Alert>
              </Grid>

              <Grid item xs={12}>
                <Alert severity="info">
                  <strong>Setup:</strong> Run <code>gcloud auth print-access-token</code> to get access
                  token, or leave empty if running on GCP with service account.
                </Alert>
              </Grid>
            </Grid>
          )}

          {/* OpenAI */}
          {activeTab === 2 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Kaggle Endpoint Configuration
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Configure external Kaggle-hosted MedGemma inference endpoint
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Kaggle Inference Endpoint"
                  value={config.kaggle.endpoint}
                  onChange={(e) => handleChange('kaggle', 'endpoint', e.target.value)}
                  helperText="Public HTTPS endpoint that accepts POST JSON inference payloads"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="password"
                  label="API Key (optional)"
                  value={config.kaggle.apiKey}
                  onChange={(e) => handleChange('kaggle', 'apiKey', e.target.value)}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Model ID"
                  value={config.kaggle.modelId}
                  onChange={(e) => handleChange('kaggle', 'modelId', e.target.value)}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Max Output Tokens"
                  value={config.kaggle.maxTokens}
                  onChange={(e) => handleChange('kaggle', 'maxTokens', parseInt(e.target.value))}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Temperature"
                  value={config.kaggle.temperature}
                  onChange={(e) => handleChange('kaggle', 'temperature', parseFloat(e.target.value))}
                  inputProps={{ min: 0, max: 1, step: 0.1 }}
                />
              </Grid>
            </Grid>
          )}

          {/* OpenAI */}
          {activeTab === 3 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  OpenAI Configuration
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Configure OpenAI GPT models (Coming Soon)
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <Alert severity="warning">
                  OpenAI integration is coming soon. MedGemma and Claude are recommended for medical
                  triage.
                </Alert>
              </Grid>
            </Grid>
          )}

          {/* Fallback Chain */}
          {activeTab === 4 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Fallback Chain Configuration
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Configure automatic fallback when primary provider fails
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Primary Provider</InputLabel>
                  <Select value={config.activeProvider} disabled>
                    <MenuItem value="vertexai">Google Vertex AI</MenuItem>
                    <MenuItem value="bedrock">AWS Bedrock</MenuItem>
                    <MenuItem value="kaggle">Kaggle Endpoint</MenuItem>
                    <MenuItem value="openai">OpenAI</MenuItem>
                    <MenuItem value="huggingface">Hugging Face</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12}>
                <Typography variant="body2" gutterBottom>
                  Fallback Order:
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Chip label="1. Primary" color="primary" />
                  <Typography>→</Typography>
                  <Chip label="2. Vertex AI" />
                  <Typography>→</Typography>
                  <Chip label="3. Bedrock" />
                  <Typography>→</Typography>
                  <Chip label="4. Rule Engine" color="warning" />
                </Box>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  type="number"
                  label="Failure Threshold"
                  value={config.fallback.failureThreshold}
                  onChange={(e) =>
                    handleChange('fallback', 'failureThreshold', parseInt(e.target.value))
                  }
                  helperText="Number of failures before switching to fallback"
                />
              </Grid>

              <Grid item xs={12}>
                <Alert severity="info">
                  If primary provider fails {config.fallback.failureThreshold} times, system will
                  automatically switch to next provider in chain. Rule engine is always available as
                  final fallback.
                </Alert>
              </Grid>
            </Grid>
          )}

          {/* Cost Analysis */}
          {activeTab === 5 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Cost Analysis
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Provider</TableCell>
                      <TableCell>Model</TableCell>
                      <TableCell>Input Cost</TableCell>
                      <TableCell>Output Cost</TableCell>
                      <TableCell>Per Assessment</TableCell>
                      <TableCell>1000 Assessments</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell>Legacy Bedrock</TableCell>
                      <TableCell>Claude Haiku</TableCell>
                      <TableCell>$0.25/1M</TableCell>
                      <TableCell>$1.25/1M</TableCell>
                      <TableCell>$0.001</TableCell>
                      <TableCell>$1.00</TableCell>
                    </TableRow>
                    <TableRow sx={{ bgcolor: 'success.light' }}>
                      <TableCell>Vertex AI</TableCell>
                      <TableCell>MedGemma 2B</TableCell>
                      <TableCell>$0.125/1M</TableCell>
                      <TableCell>$0.375/1M</TableCell>
                      <TableCell>$0.0005</TableCell>
                      <TableCell>$0.50</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>OpenAI</TableCell>
                      <TableCell>GPT-4</TableCell>
                      <TableCell>$30/1M</TableCell>
                      <TableCell>$60/1M</TableCell>
                      <TableCell>$0.045</TableCell>
                      <TableCell>$45.00</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Grid>

              <Grid item xs={12}>
                <Alert severity="success">
                  <strong>Recommendation:</strong> Use MedGemma/Vertex AI as primary. Keep Bedrock only as optional fallback.
                </Alert>
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* Test Dialog */}
      <Dialog open={testDialogOpen} onClose={() => setTestDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Test AI Provider</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" gutterBottom>
              Testing {config.activeProvider} with sample triage case...
            </Typography>

            {testing && (
              <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
                <CircularProgress />
              </Box>
            )}

            {testResults.length > 0 && (
              <Box sx={{ mt: 2 }}>
                {testResults.map((result, index) => (
                  <Card key={index} sx={{ mb: 2 }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        {result.success ? (
                          <CheckCircle color="success" />
                        ) : (
                          <ErrorIcon color="error" />
                        )}
                        <Typography variant="h6">{result.provider}</Typography>
                      </Box>

                      <Grid container spacing={2}>
                        <Grid item xs={4}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Speed fontSize="small" />
                            <Typography variant="body2">
                              Latency: {result.latency}ms
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={4}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AttachMoney fontSize="small" />
                            <Typography variant="body2">Cost: ${result.cost.toFixed(4)}</Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={4}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TrendingUp fontSize="small" />
                            <Typography variant="body2">
                              Status: {result.success ? 'Success' : 'Failed'}
                            </Typography>
                          </Box>
                        </Grid>
                      </Grid>

                      {result.response && (
                        <Box sx={{ mt: 2 }}>
                          <Typography variant="body2" color="text.secondary">
                            Response:
                          </Typography>
                          <Typography variant="body2">{result.response}</Typography>
                        </Box>
                      )}

                      {result.error && (
                        <Alert severity="error" sx={{ mt: 2 }}>
                          {result.error}
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestDialogOpen(false)}>Close</Button>
          <Button variant="contained" onClick={handleTest} disabled={testing}>
            Run Test
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
