import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["favicon.svg"],
            manifest: {
                name: "Guide Allocation Studio",
                short_name: "Guide Studio",
                description: "Offline-first guide allocation planner for Tours and Safaris with ERPNext sync.",
                theme_color: "#154734",
                background_color: "#f7f4ea",
                display: "standalone",
                start_url: "/",
                icons: [
                    {
                        src: "/pwa-192.svg",
                        sizes: "192x192",
                        type: "image/svg+xml",
                        purpose: "any"
                    },
                    {
                        src: "/pwa-512.svg",
                        sizes: "512x512",
                        type: "image/svg+xml",
                        purpose: "any"
                    }
                ]
            }
        })
    ],
    server: {
        host: "0.0.0.0",
        port: 4173
    }
});
