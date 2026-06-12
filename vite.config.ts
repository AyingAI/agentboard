import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { agentBridgePlugin } from './agentBridgePlugin';

export default defineConfig({
  plugins: [react(), agentBridgePlugin()],
});
