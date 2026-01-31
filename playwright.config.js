const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 90000,
  expect: {
    timeout: 10000,
  },

  // 🔴 CRITICAL: external AI website
  workers: 1,

  use: {
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 600000,
    navigationTimeout: 600000,
  },

  reporter: [['html', { open: 'never' }]],
});
