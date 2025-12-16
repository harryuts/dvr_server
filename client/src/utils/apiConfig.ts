const API_PORT = 3006
export const getApiBaseUrl = () => {
    const appProtocol = "https";
    const appHostname = window.location.hostname;
  
    let apiHostname = appHostname;
  
    if (appHostname === 'localhost' || appHostname === '127.0.0.1') {
      apiHostname = 'poslocal.mammam.com.au';
    }
  
    return `${appProtocol}://${apiHostname}:${API_PORT}`; // Assuming your API runs on port 3006
  };

