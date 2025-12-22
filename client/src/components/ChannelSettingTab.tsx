import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  TextField,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Alert,
  CircularProgress,
} from "@mui/material";
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
} from "@mui/icons-material";
import { getApiBaseUrl } from "../utils/apiConfig"; // Adjust path
import { authenticatedFetch } from "../utils/api";

interface ChannelConfig {
  channel: string;
  recordUrl: string;
  name?: string;
  type?: "standard" | "dahua";
  playbackUrl?: string;
}

const ChannelSettingsTab: React.FC = () => {
  const [channelConfigs, setChannelConfigs] = useState<ChannelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editConfig, setEditConfig] = useState<ChannelConfig>({
    channel: "",
    recordUrl: "",
    name: "",
    type: "standard",
    playbackUrl: "",
  });
  const [originalChannelId, setOriginalChannelId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newConfig, setNewConfig] = useState<ChannelConfig>({
    channel: "",
    recordUrl: "",
    name: "",
    type: "standard",
    playbackUrl: "",
  });
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    fetchChannelConfigurations();
  }, []);

  const fetchChannelConfigurations = async () => {
    setLoading(true);
    setError(null);
    setActionMessage(null);
    setActionError(null);
    try {
      const response = await authenticatedFetch(
        `${getApiBaseUrl()}/api/channels/config`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: { channel: string; recordUrl: string; name?: string }[] =
        await response.json();
      // Add the 'name' property if it's not already there
      const updatedData = data.map((config) => ({
        ...config,
        name: config.name !== undefined ? config.name : config.channel,
        type: (config as any).type || "standard",
        playbackUrl: (config as any).playbackUrl || "",
      }));
      setChannelConfigs(updatedData);
    } catch (err: unknown) {
      console.error("Error fetching channel configurations:", err);
      setError("Failed to load channel configurations.");
    } finally {
      setLoading(false);
    }
  };

  const handleEditOpen = (config: ChannelConfig) => {
    setEditConfig({ ...config });
    setOriginalChannelId(config.channel);
    setEditDialogOpen(true);
  };

  const handleEditClose = () => {
    setEditDialogOpen(false);
    setEditConfig({ channel: "", recordUrl: "", name: "", type: "standard", playbackUrl: "" });
    setOriginalChannelId(null);
    setActionMessage(null);
    setActionError(null);
  };

  const handleEditInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = event.target;
    setEditConfig((prevConfig) => ({ ...prevConfig, [name]: value }));
  };

  const handleUpdateConfig = async () => {
    setActionMessage(null);
    setActionError(null);
    try {
      const response = await authenticatedFetch(
        `${getApiBaseUrl()}/api/channels/config/${encodeURIComponent(originalChannelId || '')}`,
        "PUT",
        editConfig
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }
      setActionMessage("Channel configuration updated successfully!");
      fetchChannelConfigurations();
      handleEditClose();
    } catch (err: unknown) {
      console.error("Error updating channel configuration:", err);
      setActionError("Failed to update channel configuration.");
    }
  };

  const handleDeleteConfig = async (channelToDelete: string) => {
    if (
      window.confirm(
        `Are you sure you want to delete configuration for channel "${channelToDelete}"?`
      )
    ) {
      setActionMessage(null);
      setActionError(null);
      try {
        const response = await authenticatedFetch(
          `${getApiBaseUrl()}/api/channels/config/${channelToDelete}`,
          "DELETE"
        );
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message || `HTTP error! status: ${response.status}`
          );
        }
        setActionMessage(`Channel "${channelToDelete}" deleted successfully!`);
        fetchChannelConfigurations();
      } catch (err: unknown) {
        console.error("Error deleting channel configuration:", err);
        setActionError("Failed to delete channel configuration.");
      }
    }
  };

  const handleAddOpen = () => {
    setNewConfig({ channel: "", recordUrl: "", name: "" });
    setAddDialogOpen(true);
  };

  const handleAddClose = () => {
    setAddDialogOpen(false);
    setNewConfig({ channel: "", recordUrl: "", name: "", type: "standard", playbackUrl: "" });
    setActionMessage(null);
    setActionError(null);
  };

  const handleAddInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setNewConfig((prevConfig) => ({ ...prevConfig, [name]: value }));
  };

  const handleAddConfig = async () => {
    setActionMessage(null);
    setActionError(null);
    try {
      const response = await authenticatedFetch(
        `${getApiBaseUrl()}/api/channels/config`,
        "POST",
        newConfig
      );
      if (!response.ok) {
        const errorData = await response.json();
        // For duplicate errors (409), show the specific error message
        if (response.status === 409) {
          setActionError(errorData.message || "Duplicate channel detected");
          return; // Keep dialog open for user to correct
        }
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }
      setActionMessage("New channel configuration added successfully!");
      fetchChannelConfigurations();
      handleAddClose();
    } catch (err: unknown) {
      console.error("Error adding channel configuration:", err);
      setActionError("Failed to add new channel configuration.");
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" color="text.primary" gutterBottom>
        Channel Configuration
      </Typography>

      {actionMessage && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {actionMessage}
        </Alert>
      )}
      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <CircularProgress />
      ) : (
        <TableContainer component={Paper}>
          <Table aria-label="channel configuration table">
            <TableHead>
              <TableRow>
                <TableCell>Channel</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Record URL (Live)</TableCell>
                <TableCell>Playback URL</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {channelConfigs.map((config) => (
                <TableRow
                  key={config.channel}
                  hover
                  onClick={() => handleEditOpen(config)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell component="th" scope="row">
                    {config.channel}
                  </TableCell>
                  <TableCell>{config.name}</TableCell>
                  <TableCell>{config.type || "standard"}</TableCell>
                  <TableCell>{config.recordUrl}</TableCell>
                  <TableCell>{config.playbackUrl || "-"}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      aria-label="edit"
                      onClick={() => handleEditOpen(config)}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      aria-label="delete"
                      onClick={() => handleDeleteConfig(config.channel)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Button
        variant="contained"
        color="primary"
        startIcon={<AddIcon />}
        onClick={handleAddOpen}
        sx={{ mt: 2 }}
      >
        Add New Channel
      </Button>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={handleEditClose}>
        <DialogTitle>Edit Channel Configuration</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            id="channel"
            name="channel"
            label="Channel"
            type="text"
            fullWidth
            value={editConfig.channel}
            onChange={handleEditInputChange}
          />
          <TextField
            margin="dense"
            id="name"
            name="name"
            label="Name"
            type="text"
            fullWidth
            value={editConfig.name}
            onChange={handleEditInputChange}
          />
          <TextField
            select
            margin="dense"
            id="type"
            name="type"
            label="Type"
            fullWidth
            value={editConfig.type}
            onChange={handleEditInputChange}
            SelectProps={{
              native: true,
            }}
          >
            <option value="standard">Standard</option>
            <option value="dahua">Dahua</option>
          </TextField>
          <TextField
            margin="dense"
            id="recordUrl"
            name="recordUrl"
            label="Record URL (Live)"
            type="text"
            fullWidth
            value={editConfig.recordUrl}
            onChange={handleEditInputChange}
          />
          {editConfig.type === 'dahua' && (
            <TextField
              margin="dense"
              id="playbackUrl"
              name="playbackUrl"
              label="Playback URL"
              type="text"
              fullWidth
              value={editConfig.playbackUrl}
              onChange={handleEditInputChange}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEditClose}>Cancel</Button>
          <Button onClick={handleUpdateConfig} color="primary">
            Update
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add New Channel Dialog */}
      <Dialog open={addDialogOpen} onClose={handleAddClose}>
        <DialogTitle>Add New Channel Configuration</DialogTitle>
        <DialogContent>
          {actionError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {actionError}
            </Alert>
          )}
          <TextField
            autoFocus
            margin="dense"
            id="newChannel"
            name="channel"
            label="Channel"
            type="text"
            fullWidth
            value={newConfig.channel}
            onChange={handleAddInputChange}
          />
          <TextField
            margin="dense"
            id="newName"
            name="name"
            label="Name"
            type="text"
            fullWidth
            value={newConfig.name}
            onChange={handleAddInputChange}
          />
          <TextField
            select
            margin="dense"
            id="newType"
            name="type"
            label="Type"
            fullWidth
            value={newConfig.type}
            onChange={handleAddInputChange}
            SelectProps={{
              native: true,
            }}
          >
            <option value="standard">Standard</option>
            <option value="dahua">Dahua</option>
          </TextField>
          <TextField
            margin="dense"
            id="newRecordUrl"
            name="recordUrl"
            label="Record URL (Live)"
            type="text"
            fullWidth
            value={newConfig.recordUrl}
            onChange={handleAddInputChange}
          />
          {newConfig.type === 'dahua' && (
            <TextField
              margin="dense"
              id="newPlaybackUrl"
              name="playbackUrl"
              label="Playback URL"
              type="text"
              fullWidth
              value={newConfig.playbackUrl}
              onChange={handleAddInputChange}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleAddClose}>Cancel</Button>
          <Button onClick={handleAddConfig} color="primary">
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChannelSettingsTab;
