import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // The shared package ships TypeScript source, so it is bundled in rather than resolved at runtime.
  noExternal: ['@cryptopulse/shared'],
  // node:sqlite only exists with the prefix; tsup strips it by default.
  removeNodeProtocol: false,
});
