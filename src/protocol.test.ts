import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, '../build/index.js');

describe('MCP Protocol Compliance', () => {
  it('should have a clean stdout during initialization', async () => {
    const server = spawn('node', [serverPath], {
      env: { ...process.env, BILLFORWARD_ACCESS_TOKEN: 'test-token' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    const promise = new Promise((resolve, reject) => {
      server.stdout.on('data', (data) => {
        stdout += data.toString();
        // If we get a newline, we assume the first message is complete for this test
        if (stdout.includes('\n')) resolve(true);
      });

      server.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      server.on('error', reject);
      
      // Timeout after 5 seconds
      setTimeout(() => reject(new Error('Timeout waiting for server stdout')), 5000);
    });

    // Send initialize request
    const initReq = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" }
      }
    }) + '\n';

    server.stdin.write(initReq);

    await promise;
    server.kill();

    // The critical check: stdout must start with '{'
    // If it starts with anything else, it's a protocol violation
    const trimmedStdout = stdout.trim();
    
    if (!trimmedStdout.startsWith('{')) {
      const firstChar = trimmedStdout[0];
      const hex = firstChar.charCodeAt(0).toString(16);
      throw new Error(`Protocol Violation: stdout starts with invalid character '${firstChar}' (0x${hex}). Raw output: "${stdout.substring(0, 50)}..."`);
    }

    // It should be valid JSON
    try {
      JSON.parse(trimmedStdout);
    } catch (e) {
      throw new Error(`Protocol Violation: stdout is not valid JSON. Raw: "${stdout}"`);
    }

    expect(trimmedStdout.startsWith('{')).toBe(true);
  });
});
