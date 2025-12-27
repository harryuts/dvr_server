import React, { useState, useEffect } from "react";
import { 
  Box, 
  Typography, 
  CircularProgress, 
  Grid, 
  Paper, 
  Card, 
  CardContent, 
  Divider,
  Modal,
  Backdrop,
  IconButton,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import FolderIcon from "@mui/icons-material/Folder";
import FolderSpecialIcon from "@mui/icons-material/FolderSpecial";
import VideoFileIcon from "@mui/icons-material/VideoFile";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import ImageIcon from "@mui/icons-material/Image";
import CloseIcon from "@mui/icons-material/Close";
import { getApiBaseUrl } from "../utils/apiConfig";
import { authenticatedFetch } from "../utils/api";

interface DiskUsageData {
  diskUsagePercent: number;
  directories: {
    videoOutput: {
      path: string;
      sizeBytes: number;
    };
    evidence: {
      path: string;
      sizeBytes: number;
    };
  };
}

interface FileInfo {
  filename: string;
  size: number;
  modified: number;
  isDirectory: boolean;
}

interface DirectoryFilesResponse {
  directory: string;
  path: string;
  files: FileInfo[];
}

const DiskSpaceTab: React.FC = () => {
  const [diskData, setDiskData] = useState<DiskUsageData | null>(null);
  const [error, setError] = useState<boolean>(false);
  const [filesModalOpen, setFilesModalOpen] = useState<boolean>(false);
  const [currentDirectory, setCurrentDirectory] = useState<string>("");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [videoModalOpen, setVideoModalOpen] = useState<boolean>(false);
  const [selectedVideoFile, setSelectedVideoFile] = useState<string>("");
  const [imageModalOpen, setImageModalOpen] = useState<boolean>(false);
  const [selectedImageFile, setSelectedImageFile] = useState<string>("");
  const apiUrl = `${getApiBaseUrl()}/api/disk/usage`;

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  const handleDirectoryClick = async (directory: 'video_output' | 'evidence') => {
    setCurrentDirectory(directory);
    setFilesModalOpen(true);
    setLoadingFiles(true);
    
    try {
      const response = await authenticatedFetch(
        `${getApiBaseUrl()}/admin/directory-files?directory=${directory}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: DirectoryFilesResponse = await response.json();
      setFiles(data.files);
    } catch (error) {
      console.error("Error fetching directory files:", error);
      setFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleFileClick = (file: FileInfo) => {
    const filenameLower = file.filename.toLowerCase();
    if (filenameLower.endsWith('.mp4')) {
      setSelectedVideoFile(file.filename);
      setVideoModalOpen(true);
    } else if (filenameLower.endsWith('.jpg') || filenameLower.endsWith('.jpeg')) {
      setSelectedImageFile(file.filename);
      setImageModalOpen(true);
    }
  };

  const getVideoUrl = (filename: string): string => {
    const baseUrl = currentDirectory === 'video_output' 
      ? `${getApiBaseUrl()}/cctv/${filename}`
      : `${getApiBaseUrl()}/cctv_evidence/${filename}`;
    return baseUrl;
  };

  const getImageUrl = (filename: string): string => {
    const baseUrl = currentDirectory === 'video_output' 
      ? `${getApiBaseUrl()}/cctv/${filename}`
      : `${getApiBaseUrl()}/cctv_evidence/${filename}`;
    return baseUrl;
  };

  const isImageFile = (filename: string): boolean => {
    const filenameLower = filename.toLowerCase();
    return filenameLower.endsWith('.jpg') || filenameLower.endsWith('.jpeg');
  };

  const isVideoFile = (filename: string): boolean => {
    return filename.toLowerCase().endsWith('.mp4');
  };

  useEffect(() => {
    const fetchDiskUsage = async () => {
      try {
        const response = await authenticatedFetch(apiUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: DiskUsageData = await response.json();
        setDiskData(data);
        setError(false);
      } catch (error) {
        console.error("Error fetching disk usage:", error);
        setError(true);
      }
    };

    fetchDiskUsage(); // Initial fetch

    const intervalId = setInterval(fetchDiskUsage, 5000); // Fetch every 5 seconds

    return () => clearInterval(intervalId); // Cleanup on unmount
  }, [apiUrl]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" color="text.primary" gutterBottom>
        Recording Storage Usage
      </Typography>

      {error ? (
        <Typography color="error">
          Error loading disk usage
        </Typography>
      ) : !diskData ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* @ts-ignore */}
          <Grid container spacing={3}>
            {/* @ts-ignore */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="subtitle1" gutterBottom align="center">
                  Disk Usage
                </Typography>
                <Box sx={{ position: "relative", width: 200, height: 200, mx: "auto", mb: 2 }}>
                  <CircularProgressbar
                    value={diskData.diskUsagePercent}
                    text={`${diskData.diskUsagePercent.toFixed(1)}%`}
                    styles={buildStyles({
                      textColor: diskData.diskUsagePercent > 90 ? "#f44336" : "#3f51b5",
                      pathColor: diskData.diskUsagePercent > 90 ? "#f44336" : "#3f51b5",
                      trailColor: "#d3d3d3",
                    })}
                  />
                </Box>
                <Typography variant="body2" color="text.secondary" align="center">
                  Overall disk space usage
                </Typography>
              </Paper>
            </Grid>

            {/* @ts-ignore */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, height: '100%' }}>
                <Typography variant="subtitle1" gutterBottom>
                  Directory Sizes
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                <Card 
                  variant="outlined" 
                  sx={{ 
                    mb: 2, 
                    cursor: 'pointer',
                    '&:hover': {
                      boxShadow: 3,
                      backgroundColor: 'action.hover'
                    }
                  }}
                  onClick={() => handleDirectoryClick('video_output')}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <FolderIcon sx={{ mr: 1, color: 'primary.main' }} />
                      <Typography variant="body2" fontWeight="bold">
                        Video Output
                      </Typography>
                    </Box>
                    <Typography variant="h6" color="primary">
                      {formatBytes(diskData.directories.videoOutput.sizeBytes)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {diskData.directories.videoOutput.path}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      Click to view files
                    </Typography>
                  </CardContent>
                </Card>

                <Card 
                  variant="outlined"
                  sx={{ 
                    cursor: 'pointer',
                    '&:hover': {
                      boxShadow: 3,
                      backgroundColor: 'action.hover'
                    }
                  }}
                  onClick={() => handleDirectoryClick('evidence')}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <FolderSpecialIcon sx={{ mr: 1, color: 'secondary.main' }} />
                      <Typography variant="body2" fontWeight="bold">
                        Evidence
                      </Typography>
                    </Box>
                    <Typography variant="h6" color="secondary">
                      {formatBytes(diskData.directories.evidence.sizeBytes)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {diskData.directories.evidence.path}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      Click to view files
                    </Typography>
                  </CardContent>
                </Card>
              </Paper>
            </Grid>
          </Grid>
        </>
      )}

      {/* Files List Modal */}
      <Modal
        open={filesModalOpen}
        onClose={() => setFilesModalOpen(false)}
        aria-labelledby="files-modal-title"
        aria-describedby="files-modal-description"
        closeAfterTransition
        slots={{ backdrop: Backdrop }}
        slotProps={{
          backdrop: {
            timeout: 500,
          },
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "90%",
            maxWidth: 800,
            maxHeight: "90vh",
            bgcolor: "background.paper",
            border: "2px solid #000",
            boxShadow: 24,
            p: 3,
            overflow: "auto",
          }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography id="files-modal-title" variant="h6" component="h2">
              {currentDirectory === 'video_output' ? 'Video Output' : 'Evidence'} Files
            </Typography>
            <IconButton onClick={() => setFilesModalOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
          
          {loadingFiles ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : files.length === 0 ? (
            <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
              No files found in this directory
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>File Name</TableCell>
                    <TableCell align="right">Size</TableCell>
                    <TableCell>Modified</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {files.map((file) => {
                    const isClickable = isVideoFile(file.filename) || isImageFile(file.filename);
                    return (
                      <TableRow
                        key={file.filename}
                        sx={{
                          cursor: isClickable ? 'pointer' : 'default',
                          '&:hover': isClickable ? {
                            backgroundColor: 'action.hover'
                          } : {}
                        }}
                        onClick={() => handleFileClick(file)}
                      >
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {isVideoFile(file.filename) ? (
                              <VideoFileIcon color="primary" />
                            ) : isImageFile(file.filename) ? (
                              <ImageIcon color="secondary" />
                            ) : (
                              <InsertDriveFileIcon />
                            )}
                            <Typography variant="body2">{file.filename}</Typography>
                            {isVideoFile(file.filename) && (
                              <Chip label="Video" size="small" color="primary" />
                            )}
                            {isImageFile(file.filename) && (
                              <Chip label="Image" size="small" color="secondary" />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">{formatBytes(file.size)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{formatDate(file.modified)}</Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Modal>

      {/* Video Player Modal */}
      <Modal
        open={videoModalOpen}
        onClose={() => {
          setVideoModalOpen(false);
          setSelectedVideoFile("");
        }}
        aria-labelledby="video-modal-title"
        closeAfterTransition
        slots={{ backdrop: Backdrop }}
        slotProps={{
          backdrop: {
            timeout: 500,
          },
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "90%",
            maxWidth: 1000,
            bgcolor: "background.paper",
            border: "2px solid #000",
            boxShadow: 24,
            p: 3,
          }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography id="video-modal-title" variant="h6" component="h2">
              {selectedVideoFile}
            </Typography>
            <IconButton onClick={() => {
              setVideoModalOpen(false);
              setSelectedVideoFile("");
            }}>
              <CloseIcon />
            </IconButton>
          </Box>
          <Box sx={{ width: "100%", height: "auto" }}>
            <video
              controls
              autoPlay
              style={{ width: "100%", height: "auto", maxHeight: "70vh" }}
              src={getVideoUrl(selectedVideoFile)}
            >
              Your browser does not support the video tag.
            </video>
          </Box>
        </Box>
      </Modal>

      {/* Image Viewer Modal */}
      <Modal
        open={imageModalOpen}
        onClose={() => {
          setImageModalOpen(false);
          setSelectedImageFile("");
        }}
        aria-labelledby="image-modal-title"
        closeAfterTransition
        slots={{ backdrop: Backdrop }}
        slotProps={{
          backdrop: {
            timeout: 500,
          },
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "90%",
            maxWidth: 1000,
            bgcolor: "background.paper",
            border: "2px solid #000",
            boxShadow: 24,
            p: 3,
          }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography id="image-modal-title" variant="h6" component="h2">
              {selectedImageFile}
            </Typography>
            <IconButton onClick={() => {
              setImageModalOpen(false);
              setSelectedImageFile("");
            }}>
              <CloseIcon />
            </IconButton>
          </Box>
          <Box sx={{ 
            width: "100%", 
            display: "flex", 
            justifyContent: "center",
            alignItems: "center",
            maxHeight: "70vh",
            overflow: "auto"
          }}>
            <img
              src={getImageUrl(selectedImageFile)}
              alt={selectedImageFile}
              style={{ 
                maxWidth: "100%", 
                maxHeight: "70vh", 
                height: "auto",
                objectFit: "contain"
              }}
              onError={(e) => {
                console.error("Error loading image:", selectedImageFile);
                (e.target as HTMLImageElement).alt = "Failed to load image";
              }}
            />
          </Box>
        </Box>
      </Modal>
    </Box>
  );
};

export default DiskSpaceTab;
