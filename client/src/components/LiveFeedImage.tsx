import React, { useState, useEffect, useRef } from "react";
import { Box, Typography, Skeleton, CircularProgress } from "@mui/material";

interface LiveFeedImageProps {
    src: string;
    alt: string;
    sx?: any;
    className?: string;
    onClick?: () => void;
    onLoadComplete?: () => void;
}

const LiveFeedImage: React.FC<LiveFeedImageProps> = ({ src, alt, sx, className, onClick, onLoadComplete }) => {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [isStale, setIsStale] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<boolean>(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        const fetchImage = async () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }

            const controller = new AbortController();
            abortControllerRef.current = controller;
            setLoading(true);
            setError(false);

            try {
                const response = await fetch(src, {
                    signal: controller.signal,
                    // If your API requires auth headers and you are not counting on cookie/browser session,
                    // you might need to handle them here. However, typical <img> tags don't send auth headers,
                    // so if src includes a token query param, this fetch will work similarly.
                });

                if (!response.ok) {
                    throw new Error(`Failed to load image: ${response.status}`);
                }

                // Check for stale header
                const staleHeader = response.headers.get("X-Live-Image-Stale");
                setIsStale(staleHeader === "true");

                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                setImageSrc(objectUrl);
            } catch (err: any) {
                if (err.name !== "AbortError") {
                    console.error("Error fetching live image:", err);
                    setError(true);
                }
            } finally {
                setLoading(false);
                if (onLoadComplete && !controller.signal.aborted) {
                    onLoadComplete();
                }
            }
        };

        fetchImage();

        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            if (imageSrc) {
                URL.revokeObjectURL(imageSrc);
            }
        };
    }, [src]);


    console.log(`LiveFeedImage Render: loading=${loading}, hasImage=${!!imageSrc}, isStale=${isStale}`);

    return (
        <Box
            sx={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "hidden",
                ...sx
            }}
            className={className}
            onClick={onClick}
        >
            {(!imageSrc && !error) && (
                <Box sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'rgba(20, 20, 20, 1)',
                    zIndex: 10,
                    color: 'white'
                }}>
                    <CircularProgress sx={{ color: '#00ff00' }} size={60} thickness={4} />
                    <Typography variant="h6" sx={{ mt: 2, color: '#fff', fontWeight: 'bold' }}>
                        Loading Stream...
                    </Typography>
                </Box>
            )}

            {imageSrc && !error && (
                <Box
                    component="img"
                    src={imageSrc}
                    alt={alt}
                    sx={{
                        width: "100%",
                        height: "100%",
                        objectFit: sx?.objectFit || "cover", // respect passed objectFit or default to cover
                        opacity: isStale ? 0.5 : 1, // Dim if stale
                        transition: "opacity 0.3s ease",
                        display: "block"
                    }}
                />
            )}
            {/* Fallback for error */}
            {error && (
                <Box sx={{ width: "100%", height: "100%", bgcolor: "grey.900", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Typography variant="caption" color="error">Image Error</Typography>
                </Box>
            )}

            {/* Stale Overlay */}
            {isStale && (
                <Box
                    sx={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none", // Allow clicks to pass through to the image card if needed
                    }}
                >
                    <Typography
                        variant="h6"
                        sx={{
                            color: "yellow",
                            fontWeight: "bold",
                            textAlign: "center",
                            textShadow: "0px 2px 4px rgba(0,0,0,0.8)",
                            bgcolor: "rgba(0,0,0,0.5)",
                            p: 2,
                            borderRadius: 1
                        }}
                    >
                        Live Image not available
                    </Typography>
                </Box>
            )}
        </Box>
    );
};

export default LiveFeedImage;
