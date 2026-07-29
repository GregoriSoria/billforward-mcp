import { z } from "zod";

export const MAX_RECORDS_LIMIT = process.env.BILLFORWARD_MAX_RESULTS
  ? parseInt(process.env.BILLFORWARD_MAX_RESULTS, 10)
  : 200;

export const DEFAULT_RECORDS_LIMIT = process.env.BILLFORWARD_DEFAULT_RESULTS
  ? parseInt(process.env.BILLFORWARD_DEFAULT_RESULTS, 10)
  : 10;

export const TIMEOUT_MS = process.env.BILLFORWARD_TIMEOUT
  ? parseInt(process.env.BILLFORWARD_TIMEOUT, 10)
  : 15000;

export const ENVIRONMENT_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
export type Environment = string;
export type EnvironmentKind = "sandbox" | "production";
export type EnvironmentConfig = {
  token: string;
  baseUrl: string;
  type: EnvironmentKind;
  readonly: boolean;
};

const namedEnvironmentSchema = z.strictObject({
  token: z.string().min(1),
  type: z.enum(["sandbox", "production"]),
  readonly: z.boolean().optional().default(true),
  baseUrl: z
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
    .optional(),
});

function defaultUrl(type: EnvironmentKind): string {
  return type === "production"
    ? process.env.BILLFORWARD_PRODUCTION_URL || "https://app.billforward.net/v1/"
    : process.env.BILLFORWARD_SANDBOX_URL || "https://app-sandbox.billforward.net/v1/";
}

function namedEnvironments(): Map<Environment, EnvironmentConfig> {
  const raw = process.env.BILLFORWARD_ENVIRONMENTS;
  const environments = new Map<Environment, EnvironmentConfig>();
  if (raw === undefined) return environments;

  let catalog: unknown;
  try {
    catalog = JSON.parse(raw);
  } catch {
    throw new Error("BILLFORWARD_ENVIRONMENTS must be valid JSON.");
  }
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error("BILLFORWARD_ENVIRONMENTS must be a JSON object.");
  }

  for (const [name, value] of Object.entries(catalog)) {
    if (!ENVIRONMENT_NAME_PATTERN.test(name)) {
      throw new Error(
        "BILLFORWARD_ENVIRONMENTS contains an invalid environment name. " +
          "Use lowercase letters, numbers, underscores, or hyphens.",
      );
    }
    const parsed = namedEnvironmentSchema.safeParse(value);
    if (!parsed.success) {
      throw new Error(`BILLFORWARD_ENVIRONMENTS has invalid configuration for environment '${name}'.`);
    }
    environments.set(name, {
      token: parsed.data.token,
      type: parsed.data.type,
      readonly: parsed.data.readonly,
      baseUrl: parsed.data.baseUrl || defaultUrl(parsed.data.type),
    });
  }
  return environments;
}

function addEnvironment(
  environments: Map<Environment, EnvironmentConfig>,
  name: Environment,
  config: EnvironmentConfig,
): void {
  if (environments.has(name)) {
    throw new Error(`Duplicate environment name '${name}' in Billforward configuration.`);
  }
  environments.set(name, config);
}

export function resolveEnvironments(): Map<Environment, EnvironmentConfig> {
  const environments = namedEnvironments();
  const legacyToken = process.env.BILLFORWARD_ACCESS_TOKEN;
  const legacyEnvironment = (process.env.BILLFORWARD_ENVIRONMENT || "sandbox").toLowerCase();
  const readonly = process.env.BILLFORWARD_READ_ONLY !== "false";

  const sandboxToken =
    process.env.BILLFORWARD_SANDBOX_ACCESS_TOKEN ||
    (legacyEnvironment !== "production" ? legacyToken : undefined);
  const productionToken =
    process.env.BILLFORWARD_PRODUCTION_ACCESS_TOKEN ||
    (legacyEnvironment === "production" ? legacyToken : undefined);

  if (sandboxToken) {
    addEnvironment(environments, "sandbox", {
      token: sandboxToken,
      type: "sandbox",
      readonly,
      baseUrl: defaultUrl("sandbox"),
    });
  }
  if (productionToken) {
    addEnvironment(environments, "production", {
      token: productionToken,
      type: "production",
      readonly,
      baseUrl: defaultUrl("production"),
    });
  }
  return environments;
}
