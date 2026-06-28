import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";

// Explicitly load .env.local (drizzle-kit doesn't load it automatically on Windows)
dotenv.config({ path: ".env.local" });

export default {
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
} satisfies Config;