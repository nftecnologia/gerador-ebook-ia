import { defineConfig } from "drizzle-kit"
import { config } from "dotenv"

// Carregar variáveis de ambiente
config({ path: ".env.local" })

export default defineConfig({
  schema: "./lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
})
