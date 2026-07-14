import axios, { AxiosInstance } from 'axios';
import { z } from 'zod';

import { TIMEOUT_MS, resolveEnvironments, type Environment } from './config.js';

// Shared zod field spread into every API-touching tool's inputSchema.
export const environmentParam = {
  environment: z
    .enum(['sandbox', 'production'])
    .optional()
    .describe(
      "Which Billforward environment to target. Required when both sandbox and production are configured; " +
        "if only one is configured it is used automatically. Ask the user if you're unsure which to use."
    ),
};

function createClient(token: string, baseUrl: string): AxiosInstance {
  const client = axios.create({
    baseURL: baseUrl,
    timeout: TIMEOUT_MS,
    params: { access_token: token },
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  // Interceptor for logging, debugging and resilience
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error.response?.status;
      const data = error.response?.data;

      if (status === 429) {
        const retryAfter = error.response?.headers['retry-after'];
        const message = `Rate limit exceeded (429). ${
          retryAfter ? `Please wait ${retryAfter} seconds before retrying.` : 'Please wait a few moments before retrying.'
        }`;
        console.error(`Billforward API [429]: ${message}`);
        error.message = message;
      } else {
        const apiMessage = data?.errorMessage || data?.message || error.message;
        console.error(
          `Billforward API Error [${status || 'NETWORK'}]:`,
          status ? JSON.stringify(data, null, 2) : error.message
        );
        error.message = apiMessage;
      }

      throw error;
    }
  );

  return client;
}

// Resolve the axios client for a tool call. Throws an LLM-readable Error on
// ambiguity/misconfiguration; tool try/catch turns that into an isError response.
export function getClient(environment?: Environment): AxiosInstance {
  const envs = resolveEnvironments();
  const available = [...envs.keys()];

  if (environment) {
    const cfg = envs.get(environment);
    if (!cfg) {
      const hint = available.length
        ? ` Available: ${available.join(', ')}.`
        : ' No Billforward token is configured.';
      throw new Error(`The '${environment}' environment is not configured on this server.${hint}`);
    }
    return createClient(cfg.token, cfg.baseUrl);
  }

  if (available.length === 0) {
    throw new Error(
      'No Billforward token is configured. Ask the user to set BILLFORWARD_SANDBOX_ACCESS_TOKEN and/or BILLFORWARD_PRODUCTION_ACCESS_TOKEN.'
    );
  }
  if (available.length > 1) {
    throw new Error(
      `Two environments are configured (${available.join(', ')}). Re-call this tool with the \`environment\` parameter set to one of them.`
    );
  }

  const only = envs.get(available[0])!;
  return createClient(only.token, only.baseUrl);
}
