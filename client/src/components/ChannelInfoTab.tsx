import React, { useState, useEffect } from 'react';
import { Typography, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from '@mui/material';
import { getApiBaseUrl } from '../utils/apiConfig';
import { authenticatedFetch } from '../utils/api';

interface ChannelInfo {
  channel: string;
  name?: string;
  earliest: {
    timestamp: number;
    formatted: string;
  } | null;
  latest: {
    timestamp: number;
    formatted: string;
  } | null;
}

const ChannelInfoTab: React.FC = () => {
  const [channelData, setChannelData] = useState<ChannelInfo[]>([]);
  const apiUrl = `${getApiBaseUrl()}/api/channels/timeframe`;

  useEffect(() => {
    const fetchChannelInfo = async () => {
      try {
        const response = await authenticatedFetch(apiUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: ChannelInfo[] = await response.json();
        setChannelData(data);
      } catch (error) {
        console.error('Error fetching channel info:', error);
        // Optionally display an error message to the user
      }
    };

    fetchChannelInfo(); // Initial fetch

    const intervalId = setInterval(fetchChannelInfo, 5000); // Fetch every 5 seconds

    return () => clearInterval(intervalId); // Cleanup on unmount
  }, [apiUrl]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" color="text.primary" gutterBottom>Channel Information</Typography>
      {channelData.length > 0 ? (
        <TableContainer component={Paper}>
          <Table aria-label="channel info table">
            <TableHead>
              <TableRow>
                <TableCell>Channel</TableCell>
                <TableCell align="right">Earliest Timestamp</TableCell>
                <TableCell align="right">Earliest Formatted</TableCell>
                <TableCell align="right">Latest Timestamp</TableCell>
                <TableCell align="right">Latest Formatted</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {channelData.map((channelInfo) => (
                <TableRow key={channelInfo.channel}>
                  <TableCell component="th" scope="row">
                    {channelInfo.name || channelInfo.channel}
                  </TableCell>
                  <TableCell align="right">{channelInfo.earliest?.timestamp ?? 'N/A'}</TableCell>
                  <TableCell align="right">{channelInfo.earliest?.formatted ?? 'N/A'}</TableCell>
                  <TableCell align="right">{channelInfo.latest?.timestamp ?? 'N/A'}</TableCell>
                  <TableCell align="right">{channelInfo.latest?.formatted ?? 'N/A'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography>Loading channel information...</Typography>
      )}
    </Box>
  );
};

export default ChannelInfoTab;