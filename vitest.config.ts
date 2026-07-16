import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Charge .env.test (base de test + secrets) avant chaque fichier de test.
    setupFiles: ['./vitest.setup.ts'],
  },
});
