import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

// Verificar se a variável de ambiente está definida
const databaseUrl = process.env.DATABASE_URL

// Configurar conexão com Neon (com fallback para build)
const sql = databaseUrl ? neon(databaseUrl) : null
export const db = sql ? drizzle(sql, { schema }) : null

// Função para testar conexão
export async function testConnection() {
  if (!sql) {
    console.warn("Database connection not available")
    return false
  }
  
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
