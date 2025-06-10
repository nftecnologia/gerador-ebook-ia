import { NextResponse } from "next/server"
import { testConnection, HybridEbookManager } from "@/lib/database"

export async function GET() {
  try {
    // Testar conexão com Postgres
    const isConnected = await testConnection()
    
    if (!isConnected) {
      return NextResponse.json({
        success: false,
        error: "Falha na conexão com Postgres"
      }, { status: 500 })
    }

    // Testar consulta básica na biblioteca
    const stats = await HybridEbookManager.getLibraryStats()

    return NextResponse.json({
      success: true,
      message: "Banco Neon Postgres conectado com sucesso!",
      postgres: {
        connected: true,
        stats
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error("Erro ao testar banco:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
