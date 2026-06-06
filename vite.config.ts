import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: '/UserTool/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 500,
    cssMinify: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-chartjs': ['chart.js', 'react-chartjs-2'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-dexie': ['dexie'],
          'vendor-radix': ['@radix-ui/react-dialog', '@radix-ui/react-select'],
          'vendor-lucide': ['lucide-react'],
        },
      },
    },
  },
});


