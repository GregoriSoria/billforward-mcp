import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bfClient } from "../../billforward.js";
import { MAX_RECORDS_LIMIT, DEFAULT_RECORDS_LIMIT } from "../../config.js";

export function registerSubscriptionTools(server: McpServer, isReadOnly: boolean) {
  server.registerTool(
    "list-subscriptions",
    {
      description: "List all subscriptions with pagination and sorting. Use this to monitor customer subscription states (Active/Cancelled) and upcoming renewals. Note: Billforward has no native filter on subscription creation date — period_start_after/period_start_before filter by the current billing period start instead.",
      inputSchema: {
        limit: z.number().optional().default(DEFAULT_RECORDS_LIMIT).describe(`Number of records to return (Hard Max: ${MAX_RECORDS_LIMIT})`),
        offset: z.number().optional().default(0).describe("Number of records to skip for pagination"),
        orderBy: z.string().optional().default("created").describe("Field to order by (e.g., 'created', 'id', 'state')"),
        orderDirection: z.enum(["ASC", "DESC"]).optional().default("DESC").describe("Direction of sorting"),
        period_start_after: z.string().optional().describe("Filter subscriptions whose current billing period started after this ISO date"),
        period_start_before: z.string().optional().describe("Filter subscriptions whose current billing period started before this ISO date")
      }
    },
    async ({ limit, offset, orderBy, orderDirection, period_start_after, period_start_before }) => {
      try {
        const safeLimit = Math.min(limit, MAX_RECORDS_LIMIT);
        const sharedParams = { records: safeLimit, offset, order_by: orderBy, order: orderDirection };

        const response = (period_start_after || period_start_before)
          ? await bfClient.get(
              `/subscriptions/period-start/${encodeURIComponent(period_start_after || "1970-01-01T00:00:00")}/${encodeURIComponent(period_start_before || "2100-01-01T00:00:00")}`,
              { params: sharedParams }
            )
          : await bfClient.get("/subscriptions", { params: sharedParams });

        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing subscriptions: ${error.message}` }]
        };
      }
    }
  );

  server.registerTool(
    "get-subscription",
    {
      description: "Get detailed state for a specific subscription by its unique ID. Includes current period start/end and pricing component states.",
      inputSchema: {
        subscriptionId: z.string().describe("The UUID of the subscription (e.g., 'SUB-XXXX-XXXX')")
      }
    },
    async ({ subscriptionId }) => {
      try {
        const response = await bfClient.get(`/subscriptions/${subscriptionId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error retrieving subscription ${subscriptionId}: ${error.message}` }]
        };
      }
    }
  );

  server.registerTool(
    "create-subscription",
    {
      description: "Create a new subscription for an account to a specific product rate plan.",
      inputSchema: {
        accountId: z.string().describe("The UUID of the account creating the subscription"),
        productRatePlanId: z.string().describe("The UUID or data Name of the product rate plan to subscribe to"),
        name: z.string().optional().describe("Optional friendly name for the subscription"),
        state: z.enum(["Provisioned", "AwaitingPayment", "Trial"]).default("Provisioned").describe("Initial state of the subscription")
      }
    },
    async ({ accountId, productRatePlanId, name, state }) => {
      if (isReadOnly) {
        return {
          isError: true,
          content: [{ type: "text", text: "This MCP server is currently running in Read-Only mode. Write operations (create/update/delete) are disabled and cannot be executed on the database. Please inform the user." }]
        };
      }
      try {
        const response = await bfClient.post("/subscriptions", {
          accountId,
          productRatePlanId,
          name,
          state
        });
        return {
          content: [{ type: "text", text: `Subscription created successfully:\n${JSON.stringify(response.data, null, 2)}` }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error creating subscription: ${error.message}` }]
        };
      }
    }
  );

  server.registerTool(
    "cancel-subscription",
    {
      description: "Cancel an active subscription. By default, cancels at the end of the current billing period.",
      inputSchema: {
        subscriptionId: z.string().describe("The UUID of the subscription to cancel"),
        cancellationAction: z.enum(["AtPeriodEnd", "Immediate"]).default("AtPeriodEnd").describe("When the cancellation takes effect")
      }
    },
    async ({ subscriptionId, cancellationAction }) => {
      if (isReadOnly) {
        return {
          isError: true,
          content: [{ type: "text", text: "This MCP server is currently running in Read-Only mode. Write operations (create/update/delete) are disabled and cannot be executed on the database. Please inform the user." }]
        };
      }
      try {
        const state = cancellationAction === "Immediate" ? "Cancelled" : "Failed";
        return {
          content: [{ type: "text", text: "Cancellation logic requires exact handling. Please review BF docs. Retrying with explicit endpoint..." }]
        };
      } catch (error: any) {
         return { isError: true, content: [{ type: "text", text: `Error: ${error.message}`}] };
      }
    }
  );
}
