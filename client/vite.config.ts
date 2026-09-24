import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // 开发时把 WebSocket 转发到本地游戏服务
    proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } },
  },
  build: { chunkSizeWarningLimit: 2000 },
});
