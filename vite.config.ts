import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/__vite_dev_proxy__": {
        changeOrigin: true,
        configure(_, options) {
          options.rewrite = (path) => {
            const proxyUrl = new URL(path, "file:"),
              url = new URL(proxyUrl.searchParams.get("url")!);

            // Since JS is single threaded, so it won't cause problem
            options.target = url.origin;
            return url.pathname + url.search;
          };
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
