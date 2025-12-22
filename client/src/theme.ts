import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#2196F3', // Generic Blue
            light: '#64b5f6',
            dark: '#1976d2',
            contrastText: '#ffffff',
        },
        secondary: {
            main: '#c49a68', // Shinobi Orange/Gold accent
            light: '#d4b085',
            dark: '#a7865f',
            contrastText: '#ffffff',
        },
        background: {
            default: '#122444', // Shinobi Header/BG Blue
            paper: '#1b2d4c',  // Shinobi Drawer Blue
        },
        text: {
            primary: '#ffffff',
            secondary: '#b0bec5',
        },
        divider: 'rgba(255, 255, 255, 0.12)',
    },
    typography: {
        fontFamily: [
            '-apple-system',
            'BlinkMacSystemFont',
            '"Segoe UI"',
            'Roboto',
            '"Helvetica Neue"',
            'Arial',
            'sans-serif',
        ].join(','),
        // Significantly increase base font size
        fontSize: 18,
        htmlFontSize: 18,
        h1: { fontSize: '2.5rem', fontWeight: 600, color: '#ffffff' },
        h2: { fontSize: '2.25rem', fontWeight: 600, color: '#ffffff' },
        h3: { fontSize: '2rem', fontWeight: 600, color: '#ffffff' },
        h4: {
            fontWeight: 600,
            letterSpacing: '-0.02em',
            fontSize: '1.75rem',
            color: '#ffffff',
        },
        h5: {
            fontWeight: 600,
            letterSpacing: '-0.01em',
            fontSize: '1.5rem',
            color: '#ffffff',
        },
        h6: {
            fontWeight: 600,
            fontSize: '1.25rem',
            color: '#ffffff',
        },
        body1: {
            fontSize: '1rem',
            color: '#ffffff',
        },
        body2: {
            fontSize: '0.9rem',
            color: '#b0bec5',
        },
        button: {
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '1rem',
        },
        subtitle1: {
            fontSize: '1rem',
            color: '#ffffff',
        },
        subtitle2: {
            fontSize: '0.9rem',
            color: '#b0bec5',
        },
        caption: {
            fontSize: '0.8rem',
            color: '#b0bec5',
        }
    },
    shape: {
        borderRadius: 4,
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    color: '#ffffff',
                    backgroundColor: '#122444',
                },
            },
        },
        MuiTypography: {
            styleOverrides: {
                root: {
                    // color: 'inherit', // Removed to allow default text.primary (white) to apply
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    backgroundColor: '#1b2d4c',
                    border: '1px solid #2b3a50',
                    color: '#ffffff',
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    backgroundColor: '#1b2d4c',
                    color: '#ffffff',
                },
            },
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    backgroundColor: '#1b2d4c',
                    borderRight: '1px solid #122444',
                    color: '#ffffff',
                },
            },
        },
        MuiInputBase: {
            styleOverrides: {
                root: {
                    color: '#ffffff', // Ensure input text is white
                },
            },
        },
        MuiFormLabel: {
            styleOverrides: {
                root: {
                    color: '#b0bec5', // Lighter for labels
                    '&.Mui-focused': {
                        color: '#2196F3',
                    },
                },
            },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                notchedOutline: {
                    borderColor: 'rgba(255, 255, 255, 0.23)',
                },
                root: {
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#ffffff',
                    },
                },
            },
        },
    },
});
