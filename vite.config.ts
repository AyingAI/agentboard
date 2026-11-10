import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { agentBridgePlugin } from './agentBridgePlugin';
import { jevBridgePlugin } from './src/server/jevBridge';

export default defineConfig({
  // Keep the app's optimized dependencies separate from ad hoc Vite instances.
  cacheDir: 'node_modules/.vite-agentboard',
  server: { cors: false },
  plugins: [react(), jevBridgePlugin(), agentBridgePlugin()],
});
