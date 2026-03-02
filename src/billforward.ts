import axios from 'axios';

const accessToken = process.env.BILLFORWARD_ACCESS_TOKEN;
const env = (process.env.BILLFORWARD_ENVIRONMENT || 'sandbox').toLowerCase();

const baseUrl = env === 'production' 
  ? 'https://app.billforward.net/v1/' 
  : 'https://app-sandbox.billforward.net/v1/';

// Basic interfaces for Billforward API responses
export interface BfResponse<T> {
  results: T[];
}

export interface BfAccount {
  id: string;
  name?: string;
  email?: string;
  [key: string]: any;
}

export interface BfSubscription {
  id: string;
  accountId: string;
  state: string;
  [key: string]: any;
}

export interface BfInvoice {
  id: string;
  accountId: string;
  subscriptionId?: string;
  state: string;
  invoiceCost: number;
  [key: string]: any;
}

export interface BfProfile {
  id: string;
  accountId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  [key: string]: any;
}

export interface BfProduct {
  id: string;
  name: string;
  description?: string;
  [key: string]: any;
}

export interface BfProductRatePlan {
  id: string;
  productId: string;
  name: string;
  [key: string]: any;
}

// Access Token is required for the MCP server to function
export const bfClient = axios.create({
  baseURL: baseUrl,
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
