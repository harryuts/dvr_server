import React from "react";
import {
    Box,
    Typography,
    Paper,
    Divider,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Alert
} from "@mui/material";
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import json from 'react-syntax-highlighter/dist/esm/languages/hljs/json';
import { docco } from 'react-syntax-highlighter/dist/esm/styles/hljs';

SyntaxHighlighter.registerLanguage('json', json);

const ApiDocumentationTab: React.FC = () => {
    const baseUrl = window.location.origin;

    const endpoints = [
        {
            method: "GET",
            path: "/pos/getVideo",
            description: "Legacy video download endpoint. Downloads and processes video for the specified time range. Waits for video processing to complete before returning.",
            authentication: "API Key",
            parameters: [
                { name: "apiKey", type: "string", required: true, description: "Your API authentication key" },
                { name: "channelNumber", type: "string", required: true, description: "Channel number (e.g., '1', '2')" },
                { name: "startTime", type: "number", required: true, description: "Start timestamp in milliseconds" },
                { name: "endTime", type: "number", required: true, description: "End timestamp in milliseconds" },
                { name: "orderId", type: "string", required: false, description: "Optional order ID for file naming (e.g., '12345' creates '12345.mp4')" },
                { name: "storeEvidence", type: "boolean", required: false, description: "If true, stores video permanently in evidence folder instead of temporary output folder. Evidence files are not automatically deleted." }
            ],
            response: {
                outputFile: "video_1234567890.mp4",
                from: "10:30:00 AM",
                to: "10:31:00 AM",
                fromEpoch: 1234567890000,
                toEpoch: 1234567950000
            },
            example: `${baseUrl}/pos/getVideo?apiKey=YOUR_API_KEY&channelNumber=1&startTime=1234567890000&endTime=1234567950000&orderId=12345&storeEvidence=true`,
            notes: `After receiving the response, access the video file at:\n• Regular output: ${baseUrl}/cctv/{outputFile}\n• Evidence storage: ${baseUrl}/cctv_evidence/{outputFile}\n\nUse storeEvidence=true for videos you need to keep permanently (e.g., incident recordings, audit trails). Regular output files may be cleaned up automatically.`
        },
        {
            method: "GET",
            path: "/pos/getLiveVideo",
            description: "Instant streaming endpoint. Returns a stream URL for immediate video playback without waiting for processing.",
            authentication: "API Key",
            parameters: [
                { name: "apiKey", type: "string", required: true, description: "Your API authentication key" },
                { name: "channelNumber", type: "string", required: true, description: "Channel number (e.g., '1', '2')" },
                { name: "startTime", type: "number", required: true, description: "Start timestamp in milliseconds" },
                { name: "endTime", type: "number", required: true, description: "End timestamp in milliseconds" }
            ],
            response: {
                streamUrl: "/api/stream?channelNumber=1&startTime=1234567890000&endTime=1234567950000",
                from: "10:30:00 AM",
                to: "10:31:00 AM",
                fromEpoch: 1234567890000,
                toEpoch: 1234567950000
            },
            example: `${baseUrl}/pos/getLiveVideo?apiKey=YOUR_API_KEY&channelNumber=1&startTime=1234567890000&endTime=1234567950000`,
            notes: "Use the returned streamUrl to play video in an HTML5 video player. The stream URL requires authentication token in query parameter."
        },
        {
            method: "GET",
            path: "/pos/getPicture",
            description: "Extracts a single JPEG image from video at the specified timestamp.",
            authentication: "API Key",
            parameters: [
                { name: "apiKey", type: "string", required: true, description: "Your API authentication key" },
                { name: "channelNumber", type: "string", required: true, description: "Channel number" },
                { name: "startTime", type: "number", required: true, description: "Timestamp in milliseconds for image extraction" },
                { name: "orderId", type: "string", required: false, description: "Optional order ID for file naming" }
            ],
            response: {
                outputFile: "12345.jpg"
            },
            example: `${baseUrl}/pos/getPicture?apiKey=YOUR_API_KEY&channelNumber=1&startTime=1234567890000&orderId=12345`,
            notes: "Returns a JPEG image file. Access via: /cctv/{outputFile}"
        },
        {
            method: "GET",
            path: "/pos/getJpegLive",
            description: "Captures a live JPEG snapshot from the camera's current stream.",
            authentication: "API Key",
            parameters: [
                { name: "apiKey", type: "string", required: true, description: "Your API authentication key" },
                { name: "channelNumber", type: "string", required: true, description: "Channel number" },
                { name: "orderId", type: "string", required: false, description: "Optional order ID for file naming" }
            ],
            response: {
                outputFile: "12345_live.jpg"
            },
            example: `${baseUrl}/pos/getJpegLive?apiKey=YOUR_API_KEY&channelNumber=1&orderId=12345`,
            notes: "Captures current frame from live stream. Returns JPEG image accessible via: /cctv/{outputFile}"
        }
    ];

    return (
        <Box>
            <Alert severity="info" sx={{ mb: 3 }}>
                <Typography variant="body2">
                    All POS API endpoints require authentication using an API key. Contact your administrator to obtain an API key.
                </Typography>
            </Alert>

            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                    Base URL
                </Typography>
                <Typography variant="body1" sx={{ fontFamily: 'monospace', bgcolor: 'background.default', p: 2, borderRadius: 1 }}>
                    {baseUrl}
                </Typography>
            </Paper>

            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                    Authentication
                </Typography>
                <Typography variant="body2" paragraph>
                    All requests must include your API key as a query parameter:
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: 'background.default', p: 2, borderRadius: 1 }}>
                    ?apiKey=YOUR_API_KEY
                </Typography>
            </Paper>

            {endpoints.map((endpoint, index) => (
                <Paper key={index} sx={{ p: 3, mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <Chip
                            label={endpoint.method}
                            color="primary"
                            size="small"
                            sx={{ fontWeight: 'bold' }}
                        />
                        <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>
                            {endpoint.path}
                        </Typography>
                    </Box>

                    <Typography variant="body1" paragraph>
                        {endpoint.description}
                    </Typography>

                    <Divider sx={{ my: 2 }} />

                    <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                        Parameters
                    </Typography>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell><strong>Name</strong></TableCell>
                                    <TableCell><strong>Type</strong></TableCell>
                                    <TableCell><strong>Required</strong></TableCell>
                                    <TableCell><strong>Description</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {endpoint.parameters.map((param, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell sx={{ fontFamily: 'monospace' }}>{param.name}</TableCell>
                                        <TableCell>{param.type}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={param.required ? "Yes" : "No"}
                                                size="small"
                                                color={param.required ? "error" : "default"}
                                            />
                                        </TableCell>
                                        <TableCell>{param.description}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    <Divider sx={{ my: 2 }} />

                    <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                        Example Response
                    </Typography>
                    <SyntaxHighlighter language="json" style={docco}>
                        {JSON.stringify(endpoint.response, null, 2)}
                    </SyntaxHighlighter>

                    <Divider sx={{ my: 2 }} />

                    <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                        Example Request
                    </Typography>
                    <Box sx={{ bgcolor: 'background.default', p: 2, borderRadius: 1, overflowX: 'auto' }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {endpoint.example}
                        </Typography>
                    </Box>

                    {endpoint.notes && (
                        <>
                            <Divider sx={{ my: 2 }} />
                            <Alert severity="info">
                                <Typography variant="body2">
                                    <strong>Note:</strong> {endpoint.notes}
                                </Typography>
                            </Alert>
                        </>
                    )}
                </Paper>
            ))}

            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                    Common Use Cases
                </Typography>
                <Box component="ul" sx={{ pl: 3 }}>
                    <li>
                        <Typography variant="body2" paragraph>
                            <strong>Quick video playback:</strong> Use <code>/getLiveVideo</code> to get instant streaming URLs for video players.
                        </Typography>
                    </li>
                    <li>
                        <Typography variant="body2" paragraph>
                            <strong>Evidence storage:</strong> Use <code>/getVideo</code> with <code>storeEvidence=true</code> to save videos permanently.
                        </Typography>
                    </li>
                    <li>
                        <Typography variant="body2" paragraph>
                            <strong>Transaction snapshots:</strong> Use <code>/getPicture</code> to capture images at specific transaction times.
                        </Typography>
                    </li>
                    <li>
                        <Typography variant="body2" paragraph>
                            <strong>Live monitoring:</strong> Use <code>/getJpegLive</code> to get current camera snapshots.
                        </Typography>
                    </li>
                </Box>
            </Paper>
        </Box>
    );
};

export default ApiDocumentationTab;

