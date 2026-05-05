import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const dbPath = path.join(os.tmpdir(), `piggy-bank-e2e-${process.pid}.sqlite`);
try {
  fs.rmSync(dbPath, { force: true });
  fs.rmSync(`${dbPath}-shm`, { force: true });
  fs.rmSync(`${dbPath}-wal`, { force: true });
} catch {}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:4287',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run build && npm run start:e2e',
    url: 'http://127.0.0.1:4287/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: 'production',
      PORT: '4287',
      HOST: '127.0.0.1',
      DB_PATH: dbPath,
      UPLOAD_DIR: path.join(os.tmpdir(), `piggy-bank-e2e-uploads-${process.pid}`),
    },
  },
});
