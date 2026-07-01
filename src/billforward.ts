import axios from 'axios';

import { BASE_URL, TIMEOUT_MS } from './config.js';

const accessToken = process.env.BILLFORWARD_ACCESS_TOKEN;

// Access Token is required for the MCP server to function
export const bfClient = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT_MS,
  params: {
    access_token: accessToken // Authenticate via query parameter
  },
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
});


// Interceptor for logging, debugging and resilience
bfClient.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status;
    const data = error.response?.data;
    
    // Handle Rate Limiting (429) specifically
    if (status === 429) {
      const retryAfter = error.response?.headers['retry-after'];
      const message = `Rate limit exceeded (429). ${retryAfter ? `Please wait ${retryAfter} seconds before retrying.` : 'Please wait a few moments before retrying.'}`;
      console.error(`Billforward API [429]: ${message}`);
      error.message = message;
    } else {
      // Standard error formatting
      const apiMessage = data?.errorMessage || data?.message || error.message;
      console.error(`Billforward API Error [${status || 'NETWORK'}]:`, status ? JSON.stringify(data, null, 2) : error.message);
      error.message = apiMessage;
    }

    throw error;
  }
);
