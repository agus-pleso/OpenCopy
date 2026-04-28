import "dotenv/config";
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // `generate` doesn't need a real connection, but `migrate`/`push`/`studio` do.
    url: process.env.DATABASE_URL ?? "postgres://placeholder",
  },
  strict: true,
  verbose: true,
} satisfies Config;
