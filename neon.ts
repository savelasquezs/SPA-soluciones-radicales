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
});
