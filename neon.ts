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
        R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID!,
        R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,
        R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,
        R2_BUCKET_MASTER_FILES: process.env.R2_BUCKET_MASTER_FILES!,
        R2_BUCKET_GENERATED_DOCUMENTS: process.env.R2_BUCKET_GENERATED_DOCUMENTS || 'sr-generated-documents',
        // Optional until the private converter is provisioned; no frontend secret.
        CERTIFICATE_CONVERTER_URL: process.env.CERTIFICATE_CONVERTER_URL || '',
        CERTIFICATE_CONVERTER_TOKEN: process.env.CERTIFICATE_CONVERTER_TOKEN || '',

      },
    },
  },
});
