import { type NextRequest, NextResponse } from "next/server"
import { HybridEbookManager } from "@/lib/database"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const uuid = searchParams.get("uuid") || searchParams.get("id")

    // Se um UUID específico for fornecido, retornar apenas esse ebook
    if (uuid) {
      const ebook = await HybridEbookManager.getFromLibrary(uuid)

      if (!ebook) {
        return NextResponse.json({ success: false, error: "Ebook não encontrado" }, { status: 404 })
      }

      return NextResponse.json({ success: true, ebook })
    }

    // Caso contrário, listar todos os ebooks na biblioteca
    const ebooks = await HybridEbookManager.listLibrary()
    return NextResponse.json({ success: true, ebooks })

  } catch (error) {
    console.error("Erro na API de biblioteca (GET):", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verificar se o corpo da requisição é válido
    let ebookData
    try {
      ebookData = await request.json()
    } catch (parseError) {
      console.error("Erro ao processar corpo da requisição:", parseError)
      return NextResponse.json({ success: false, error: "Corpo da requisição inválido" }, { status: 400 })
    }

    // Validar os campos obrigatórios
    if (!ebookData.id || !ebookData.title) {
      return NextResponse.json({ success: false, error: "ID e título são obrigatórios" }, { status: 400 })
    }

    // Mapear dados para o formato esperado pelo HybridEbookManager
    const formattedData = {
      uuid: ebookData.id,
      title: ebookData.title,
      description: ebookData.description || "",
      contentMode: ebookData.contentMode || "MEDIUM",
      status: ebookData.status || "completed",
      totalPages: ebookData.totalPages || 0,
      completedPages: ebookData.completedPages || 0,
      failedPages: ebookData.failedPages || 0,
      pages: (ebookData.pages || []).map((page: any, index: number) => ({
        pageIndex: page.index !== undefined ? page.index : index,
        pageTitle: page.title || `Página ${index + 1}`,
        content: page.content || "",
        status: "completed"
      }))
    }

    // Salvar o ebook na biblioteca usando Postgres
    const result = await HybridEbookManager.saveToLibrary(formattedData)

    return NextResponse.json({
      success: true,
      message: "Ebook salvo na biblioteca com sucesso",
      ebookId: ebookData.id,
      ebook: result.ebook
    })

  } catch (error) {
    console.error("Erro ao salvar ebook na biblioteca:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const uuid = searchParams.get("uuid") || searchParams.get("id")

    if (!uuid) {
      return NextResponse.json({ success: false, error: "UUID do ebook é obrigatório" }, { status: 400 })
    }

    // Verificar se o ebook existe
    const ebook = await HybridEbookManager.getFromLibrary(uuid)
    if (!ebook) {
      return NextResponse.json({ success: false, error: "Ebook não encontrado" }, { status: 404 })
    }

    // Excluir o ebook da biblioteca
    await HybridEbookManager.deleteFromLibrary(uuid)

    return NextResponse.json({
      success: true,
      message: "Ebook excluído com sucesso",
    })

  } catch (error) {
    console.error("Erro ao excluir ebook:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 },
    )
  }
}
