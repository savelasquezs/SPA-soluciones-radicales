import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  dataApi: {
    authProvider: "neon",
    settings: {
      dbSchemas: ["public"],
      dbMaxRows: 1000,
      openapiMode: "disabled",
    },
  },
  functions: {
    api: {
      name: "Soluciones Radicales API",
      source: "./functions/api/index.ts",
      env: {
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS!,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID!,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET!,
        GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
      },
    },
  },
});
