import axios from 'axios';

const token = process.env.BILLFORWARD_ACCESS_TOKEN;
if (!token) {
  console.error("Missing token");
  process.exit(1);
}

const client = axios.create({
  baseURL: "https://api-sandbox.billforward.net/v1",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json"
  },
  validateStatus: () => true
});

async function testEndpoints() {
  const endpoints = [
    "/metadata",
    "/entities",
    "/schema",
    "/accounts/metadata",
    "/accounts/schema",
    "/accounts/123/metadata" // fake ID
  ];

  for (const ep of endpoints) {
    console.log(`\n--- Testing GET ${ep} ---`);
    const res = await client.get(ep);
    console.log(`Status: ${res.status}`);
    if (res.status === 200) {
      console.log("Data (sample):", JSON.stringify(res.data).substring(0, 300));
    } else {
      console.log("Error response:", JSON.stringify(res.data).substring(0, 150));
    }
  }
}

testEndpoints();
