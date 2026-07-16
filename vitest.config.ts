import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Variables d'environnement nécessaires aux modules testés (ex: jwt.service)
    env: {
      JWT_SECRET: 'test-secret',
      NODE_ENV: 'test',
    },
  },
});
