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
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Avatar,
  LinearProgress,
} from '@mui/material';
import {
  Save,
  Refresh,
  Add,
  Delete,
  Edit,
  Person,
  Block,
  CheckCircle,
  VpnKey,
  TrendingUp,
  School,
} from '@mui/icons-material';
import api from '../../services/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'chw' | 'admin' | 'doctor' | 'supervisor';
  status: 'active' | 'inactive' | 'suspended';
  lastLogin: string;
  assessmentsCompleted: number;
  successRate: number;
  trainingCompletion: number;
  location: string;
}

interface Role {
  id: string;
  name: string;
  permissions: string[];
  userCount: number;
}

interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  timestamp: string;
  details: string;
}

export default function UserManagement() {
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  const [addUserDialog, setAddUserDialog] = useState(false);
  const [editUserDialog, setEditUserDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [usersRes, rolesRes, logsRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/users/roles'),
        api.get('/admin/users/activity'),
      ]);
      setUsers(usersRes.data);
      setRoles(rolesRes.data);
      setActivityLogs(logsRes.data);
    } catch (err) {
      console.error('Failed to load user data:', err);
    }
  };

  const handleDeactivateUser = async (id: string) => {
    try {
      await api.put(`/admin/users/${id}`, { status: 'inactive' });
      setSuccess(true);
      loadData();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError('Failed to deactivate user');
    }
  };

  const handleResetPassword = async (id: string) => {
    try {
      await api.post(`/admin/users/${id}/reset-password`);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError('Failed to reset password');
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      await api.delete(`/admin/users/${id}`);
      loadData();
    } catch (err: any) {
      setError('Failed to delete user');
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'error';
      case 'doctor':
        return 'primary';
      case 'supervisor':
        return 'warning';
      case 'chw':
        return 'success';
      default:
        return 'default';
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">User Management</Typography>
        <Box>
          <Button startIcon={<Refresh />} onClick={loadData} sx={{ mr: 1 }}>
            Reload
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setAddUserDialog(true)}
          >
            Add User
          </Button>
        </Box>
      </Box>

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          User management action completed successfully!
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="User List" />
          <Tab label="Roles & Permissions" />
          <Tab label="Activity Logs" />
          <Tab label="Performance" />
          <Tab label="Training" />
        </Tabs>

        <CardContent>
          {/* User List */}
          {activeTab === 0 && (
            <Box>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Last Login</TableCell>
                    <TableCell>Assessments</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Avatar>
                            <Person />
                          </Avatar>
                          <Box>
                            <Typography variant="body2" fontWeight="bold">
                              {user.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {user.email}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={user.role.toUpperCase()}
                          color={getRoleColor(user.role)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{user.location}</TableCell>
                      <TableCell>
                        <Chip
                          label={user.status}
                          color={user.status === 'active' ? 'success' : 'default'}
                          size="small"
                          icon={user.status === 'active' ? <CheckCircle /> : <Block />}
                        />
                      </TableCell>
                      <TableCell>
                        {user.lastLogin
                          ? new Date(user.lastLogin).toLocaleDateString()
                          : 'Never'}
                      </TableCell>
                      <TableCell>{user.assessmentsCompleted}</TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => {
                            setSelectedUser(user);
                            setEditUserDialog(true);
                          }}
                        >
                          <Edit />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleResetPassword(user.id)}
                          title="Reset Password"
                        >
                          <VpnKey />
                        </IconButton>
                        {user.status === 'active' ? (
                          <IconButton
                            size="small"
                            color="warning"
                            onClick={() => handleDeactivateUser(user.id)}
                            title="Deactivate"
                          >
                            <Block />
                          </IconButton>
                        ) : (
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteUser(user.id)}
                            title="Delete"
                          >
                            <Delete />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {users.length === 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  No users found. Add users to get started.
                </Alert>
              )}
            </Box>
          )}

          {/* Roles & Permissions */}
          {activeTab === 1 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Role Definitions
              </Typography>

              <Grid container spacing={3}>
                {roles.map((role) => (
                  <Grid item xs={12} md={6} key={role.id}>
                    <Card variant="outlined">
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                          <Typography variant="h6">{role.name}</Typography>
                          <Chip label={`${role.userCount} users`} size="small" />
                        </Box>

                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          Permissions:
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {role.permissions.map((permission) => (
                            <Chip key={permission} label={permission} size="small" />
                          ))}
                        </Box>

                        <Box sx={{ mt: 2 }}>
                          <Button size="small" startIcon={<Edit />}>
                            Edit Permissions
                          </Button>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>

              <Alert severity="info" sx={{ mt: 3 }}>
                <strong>Role Hierarchy:</strong> Admin → Supervisor → Doctor → CHW
                <br />
                Higher roles inherit all permissions from lower roles.
              </Alert>
            </Box>
          )}

          {/* Activity Logs */}
          {activeTab === 2 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Recent Activity
              </Typography>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell>Action</TableCell>
                    <TableCell>Details</TableCell>
                    <TableCell>Timestamp</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activityLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{log.userName}</TableCell>
                      <TableCell>
                        <Chip label={log.action} size="small" />
                      </TableCell>
                      <TableCell>{log.details}</TableCell>
                      <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {activityLogs.length === 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  No recent activity.
                </Alert>
              )}
            </Box>
          )}

          {/* Performance */}
          {activeTab === 3 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                User Performance Metrics
              </Typography>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell>Assessments</TableCell>
                    <TableCell>Success Rate</TableCell>
                    <TableCell>Avg. Time</TableCell>
                    <TableCell>Performance</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.name}</TableCell>
                      <TableCell>{user.assessmentsCompleted}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={user.successRate}
                            sx={{ width: 100 }}
                          />
                          <Typography variant="body2">{user.successRate}%</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>5.2 min</TableCell>
                      <TableCell>
                        <Chip
                          label={
                            user.successRate >= 90
                              ? 'Excellent'
                              : user.successRate >= 75
                              ? 'Good'
                              : 'Needs Improvement'
                          }
                          color={
                            user.successRate >= 90
                              ? 'success'
                              : user.successRate >= 75
                              ? 'primary'
                              : 'warning'
                          }
                          size="small"
                          icon={<TrendingUp />}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}

          {/* Training */}
          {activeTab === 4 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Training Status
              </Typography>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Training Progress</TableCell>
                    <TableCell>Certifications</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.name}</TableCell>
                      <TableCell>
                        <Chip label={user.role.toUpperCase()} size="small" />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={user.trainingCompletion}
                            sx={{ width: 150 }}
                          />
                          <Typography variant="body2">{user.trainingCompletion}%</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        {user.trainingCompletion === 100 ? (
                          <Chip
                            label="Certified"
                            color="success"
                            size="small"
                            icon={<CheckCircle />}
                          />
                        ) : (
                          <Chip label="In Progress" size="small" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="small" startIcon={<School />}>
                          View Training
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Alert severity="info" sx={{ mt: 2 }}>
                All CHWs must complete training before conducting assessments. Training includes IMCI
                guidelines, danger signs, and system usage.
              </Alert>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={addUserDialog} onClose={() => setAddUserDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New User</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField fullWidth label="Full Name" required />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Email" type="email" required />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth required>
                <InputLabel>Role</InputLabel>
                <Select defaultValue="chw">
                  <MenuItem value="chw">Community Health Worker</MenuItem>
                  <MenuItem value="doctor">Doctor</MenuItem>
                  <MenuItem value="supervisor">Supervisor</MenuItem>
                  <MenuItem value="admin">Administrator</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Location" />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Phone Number" />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Initial Password" type="password" required />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddUserDialog(false)}>Cancel</Button>
          <Button variant="contained">Add User</Button>
        </DialogActions>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog
        open={editUserDialog}
        onClose={() => setEditUserDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit User</DialogTitle>
        <DialogContent>
          {selectedUser && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <TextField fullWidth label="Full Name" defaultValue={selectedUser.name} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Email" defaultValue={selectedUser.email} disabled />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Role</InputLabel>
                  <Select defaultValue={selectedUser.role}>
                    <MenuItem value="chw">Community Health Worker</MenuItem>
                    <MenuItem value="doctor">Doctor</MenuItem>
                    <MenuItem value="supervisor">Supervisor</MenuItem>
                    <MenuItem value="admin">Administrator</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Location" defaultValue={selectedUser.location} />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditUserDialog(false)}>Cancel</Button>
          <Button variant="contained">Save Changes</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
