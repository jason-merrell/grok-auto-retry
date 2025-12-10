import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const srcPath = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            '@': srcPath,
        },
    },
    test: {
        environment: 'jsdom',
        globals: false,
        setupFiles: ['./tests/setup.ts'],
        include: ['tests/unit/**/*.spec.ts'],
        exclude: ['tests/integration/**', 'tests/e2e/**'],
        coverage: {
            reporter: ['text', 'html'],
        },
    },
});
