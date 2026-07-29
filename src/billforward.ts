import axios, { AxiosInstance } from 'axios';
import { z } from 'zod';

import {
  ENVIRONMENT_NAME_PATTERN,
  TIMEOUT_MS,
  resolveEnvironments,
  type Environment,
} from './config.js';

// Shared zod field spread into every API-touching tool's inputSchema.
export const environmentParam = {
  environment: z
    .string()
    .regex(ENVIRONMENT_NAME_PATTERN)
    .optional()
    .describe(
      "Named Billforward environment to target, such as dev, staging, or production. " +
        "Required when multiple environments are configured; if only one is configured it is used automatically. " +
        "Use help to see configured names and ask the user if unsure.",
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
export function getClient(
  environment?: Environment,
  options: { write?: boolean } = {},
): AxiosInstance {
  const environments = resolveEnvironments();
  const available = [...environments.keys()];
  let selected: Environment;

  if (environment) {
    selected = environment;
    if (!environments.has(selected)) {
      const hint = available.length
        ? ` Available: ${available.join(', ')}.${available.length === 1 ? ` Omit the \`environment\` parameter to use ${available[0]} automatically.` : ''}`
        : ' No Billforward token is configured.';
      throw new Error(`The '${selected}' environment is not configured on this server.${hint}`);
    }
  } else {
    if (available.length === 0) {
      throw new Error(
        'No Billforward token is configured. Ask the user to set BILLFORWARD_ENVIRONMENTS, ' +
          'BILLFORWARD_SANDBOX_ACCESS_TOKEN, BILLFORWARD_PRODUCTION_ACCESS_TOKEN, or BILLFORWARD_ACCESS_TOKEN.',
      );
    }
    if (available.length > 1) {
      throw new Error(
        `Multiple environments are configured (${available.join(', ')}). ` +
          'Re-call this tool with the `environment` parameter set to one of them.',
      );
    }
    selected = available[0];
  }

  const config = environments.get(selected)!;
  if (options.write && config.readonly) {
    throw new Error(
      `The '${selected}' environment is read-only. Write operations are disabled for this environment.`,
    );
  }
  return createClient(config.token, config.baseUrl);
}
