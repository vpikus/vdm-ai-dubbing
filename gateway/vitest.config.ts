import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    env: {
      DB_PATH: ':memory:',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'test-secret-for-vitest-minimum-32-chars',
      MEDIA_ROOT: '/tmp/vdm-test',
      ADMIN_USERNAME: 'testadmin',
      ADMIN_PASSWORD: 'testpassword123',
    },
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'src/__tests__/',
      ],
    },
  },
});
