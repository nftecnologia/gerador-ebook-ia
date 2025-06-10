import { drizzle } from "drizzle-orm/neon-http"
import { neon } from "@neondatabase/serverless"
import * as schema from "./schema"

// Verificar se a URL do banco está configurada
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set")
}

// Criar conexão com Neon
const sql = neon(process.env.DATABASE_URL)

// Criar instância do Drizzle
export const db = drizzle(sql, { schema })

// Função para testar conexão
export async function testConnection() {
  try {
    const result = await sql`SELECT 1 as test`
    return result.length > 0
  } catch (error) {
    console.error("Erro ao testar conexão com banco:", error)
    return false
  }
}

// Exportar tipos
export type Database = typeof db
export * from "./schema"
