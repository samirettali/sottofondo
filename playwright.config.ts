import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test-browser", timeout: 60000, workers: 1,
  use: { baseURL: "http://127.0.0.1:5196", headless: true },
  webServer: { command: "npm run dev -- --host 127.0.0.1 --port 5196 --strictPort", url: "http://127.0.0.1:5196", reuseExistingServer: true },
  projects: [
    { name: "chromium", use: { browserName: "chromium", launchOptions: {
      ...(process.env.CHROMIUM_BIN ? { executablePath: process.env.CHROMIUM_BIN } : {}),
    } } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
