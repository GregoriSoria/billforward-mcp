import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from 'fs';
import path from 'path';

// Define the environment variables for the MCP server process
const serverEnv = {
    ...process.env,
    BILLFORWARD_ACCESS_TOKEN: process.env.BILLFORWARD_ACCESS_TOKEN,
    BILLFORWARD_ENVIRONMENT: "sandbox"
};

async function generateMocks() {
    const transport = new StdioClientTransport({
        command: "node",
        args: ["./build/index.js", "--read-only"],
        env: serverEnv
    });

    const client = new Client(
        {
            name: "test-client",
            version: "1.0.0",
        },
        {
            capabilities: {}
        }
    );

    await client.connect(transport);
    console.log("Connected to MCP Server");

    const mocksDir = path.join(process.cwd(), 'src', 'tests', 'mocks');
    if (!fs.existsSync(mocksDir)) {
        fs.mkdirSync(mocksDir, { recursive: true });
    }

    const testCases = [
        { tool: "list-accounts", args: { limit: 1 } },
        { tool: "list-profiles", args: { limit: 1 } },
        { tool: "list-subscriptions", args: { limit: 1 } },
        { tool: "list-invoices", args: { limit: 1 } },
        { tool: "list-payments", args: { limit: 1 } },
        { tool: "list-receipts", args: { limit: 1 } },
        { tool: "list-products", args: { limit: 1 } },
        { tool: "list-product-rate-plans", args: { limit: 1 } }
    ];

    let accountId = null;
    let email = null;
    let subscriptionId = null;
    let invoiceId = null;
    let ratePlanId = null;

    for (const tc of testCases) {
        console.log(`\nExecuting ${tc.tool}...`);
        try {
            const result = await client.callTool({
                name: tc.tool,
                arguments: tc.args
            });
            
            const content = result.content[0].text;
            const data = JSON.parse(content);
            
            // Save mock
            fs.writeFileSync(path.join(mocksDir, `${tc.tool}.json`), JSON.stringify(data, null, 2));
            console.log(`Saved mock for ${tc.tool} (${data.results?.length || 0} records)`);

            // Extract IDs for detailed endpoint tests
            if (tc.tool === "list-accounts" && data.results?.length > 0) {
                accountId = data.results[0].id;
                email = data.results[0].profile?.email;
            } else if (tc.tool === "list-subscriptions" && data.results?.length > 0) {
                subscriptionId = data.results[0].id;
            } else if (tc.tool === "list-invoices" && data.results?.length > 0) {
                invoiceId = data.results[0].id;
            } else if (tc.tool === "list-product-rate-plans" && data.results?.length > 0) {
                ratePlanId = data.results[0].id;
            }

        } catch (error) {
            console.error(`Failed to execute ${tc.tool}:`, error);
        }
    }

    // Now run detailed endpoints if we found IDs
    const detailedTests = [
        { tool: "get-account", args: { accountId }, skip: !accountId },
        { tool: "get-account-by-email", args: { email }, skip: !email },
        { tool: "get-subscription", args: { subscriptionId }, skip: !subscriptionId },
        { tool: "get-invoice", args: { invoiceId }, skip: !invoiceId },
        { tool: "get-rate-plan", args: { ratePlanIdOrName: ratePlanId }, skip: !ratePlanId }
    ];

    for (const tc of detailedTests) {
        if (tc.skip) {
            console.log(`\nSkipping ${tc.tool} due to missing ID`);
            continue;
        }

        console.log(`\nExecuting ${tc.tool} with args:`, tc.args);
        try {
            const result = await client.callTool({
                name: tc.tool,
                arguments: tc.args as any
            });
            const content = result.content[0].text;
            const data = JSON.parse(content);
            
            fs.writeFileSync(path.join(mocksDir, `${tc.tool}.json`), JSON.stringify(data, null, 2));
            console.log(`Saved mock for ${tc.tool}`);
        } catch (error) {
            console.error(`Failed to execute ${tc.tool}:`, error);
        }
    }

    console.log("\nFinished generating mocks.");
    process.exit(0);
}

generateMocks();
