import { db, ebooks, ebookPages, generationHistory, type Ebook, type NewEbook, type EbookPage, type NewEbookPage } from "./db"
import { getRedisClient, type EbookQueueState, type EbookQueuePage } from "./redis"
import { eq, desc } from "drizzle-orm"

// Classe para gerenciar dados híbridos (Postgres + Redis)
export class HybridEbookManager {
  
  // ================== BIBLIOTECA (POSTGRES) ==================
  
  /**
   * Salvar ebook na biblioteca (Postgres)
   */
  static async saveToLibrary(ebookData: {
    uuid: string
    title: string
    description: string
    contentMode: string
    status: string
    totalPages: number
    completedPages: number
    failedPages: number
    pages: Array<{ pageIndex: number; pageTitle: string; content: string; status: string }>
  }) {
    try {
      // Inserir ebook principal
      const [ebook] = await db.insert(ebooks).values({
        uuid: ebookData.uuid,
        title: ebookData.title,
        description: ebookData.description,
        contentMode: ebookData.contentMode,
        status: ebookData.status,
        totalPages: ebookData.totalPages,
        completedPages: ebookData.completedPages,
        failedPages: ebookData.failedPages,
      }).returning()

      // Inserir páginas
      if (ebookData.pages.length > 0) {
        const pageData = ebookData.pages.map(page => ({
          ebookUuid: ebookData.uuid,
          pageIndex: page.pageIndex,
          pageTitle: page.pageTitle,
          content: page.content,
          status: page.status,
        }))

        await db.insert(ebookPages).values(pageData)
      }

      // Registrar histórico
      await db.insert(generationHistory).values({
        ebookUuid: ebookData.uuid,
        action: "save_to_library",
        details: { totalPages: ebookData.totalPages, completedPages: ebookData.completedPages },
      })

      return { success: true, ebook }
    } catch (error) {
      console.error("Erro ao salvar ebook na biblioteca:", error)
      throw new Error(`Falha ao salvar na biblioteca: ${error instanceof Error ? error.message : "Erro desconhecido"}`)
    }
  }

  /**
   * Buscar ebook na biblioteca por UUID
   */
  static async getFromLibrary(uuid: string) {
    try {
      const [ebook] = await db.select().from(ebooks).where(eq(ebooks.uuid, uuid))
      
      if (!ebook) {
        return null
      }

      const pages = await db.select().from(ebookPages).where(eq(ebookPages.ebookUuid, uuid))

      return {
        ...ebook,
        pages: pages.sort((a, b) => a.pageIndex - b.pageIndex)
      }
    } catch (error) {
      console.error("Erro ao buscar ebook na biblioteca:", error)
      return null
    }
  }

  /**
   * Listar todos os ebooks da biblioteca
   */
  static async listLibrary() {
    try {
      const allEbooks = await db.select().from(ebooks).orderBy(desc(ebooks.createdAt))
      
      // Buscar páginas para cada ebook (opcional, pode ser pesado)
      const ebooksWithPages = await Promise.all(
        allEbooks.map(async (ebook) => {
          const pages = await db.select().from(ebookPages).where(eq(ebookPages.ebookUuid, ebook.uuid))
          return {
            ...ebook,
            pages: pages.sort((a, b) => a.pageIndex - b.pageIndex)
          }
        })
      )

      return ebooksWithPages
    } catch (error) {
      console.error("Erro ao listar biblioteca:", error)
      return []
    }
  }

  /**
   * Excluir ebook da biblioteca
   */
  static async deleteFromLibrary(uuid: string) {
    try {
      // Excluir páginas primeiro (foreign key)
      await db.delete(ebookPages).where(eq(ebookPages.ebookUuid, uuid))
      
      // Excluir histórico
      await db.delete(generationHistory).where(eq(generationHistory.ebookUuid, uuid))
      
      // Excluir ebook
      await db.delete(ebooks).where(eq(ebooks.uuid, uuid))

      return { success: true }
    } catch (error) {
      console.error("Erro ao excluir ebook da biblioteca:", error)
      throw new Error(`Falha ao excluir da biblioteca: ${error instanceof Error ? error.message : "Erro desconhecido"}`)
    }
  }

  // ================== PROCESSAMENTO (REDIS) ==================

  /**
   * Migrar dados do Redis para Postgres após conclusão
   */
  static async migrateCompletedEbook(ebookId: string) {
    try {
      const redis = getRedisClient()
      if (!redis) {
        throw new Error("Redis não disponível")
      }

      // Buscar dados do Redis
      const ebookStateData = await redis.get(`ebook:${ebookId}`)
      
      if (!ebookStateData) {
        throw new Error("Estado do ebook não encontrado no Redis")
      }

      const ebookState: EbookQueueState = typeof ebookStateData === "string" 
        ? JSON.parse(ebookStateData) 
        : ebookStateData as EbookQueueState

      // Buscar páginas do Redis
      const pageKeys = Array.from({ length: ebookState.totalPages }, (_, i) => `ebook-page:${ebookId}:${i}`)
      const pagesData = await redis.mget(...pageKeys)
      
      const pages = pagesData
        .map((data, index) => {
          if (!data) return null
          const page: EbookQueuePage = typeof data === "string" ? JSON.parse(data) : data as EbookQueuePage
          return {
            pageIndex: index,
            pageTitle: page.pageTitle,
            content: page.content,
            status: page.status === "completed" ? "completed" : "failed"
          }
        })
        .filter(Boolean) as Array<{ pageIndex: number; pageTitle: string; content: string; status: string }>

      // Salvar no Postgres
      await this.saveToLibrary({
        uuid: ebookState.id,
        title: ebookState.title,
        description: ebookState.description,
        contentMode: ebookState.contentMode,
        status: ebookState.status,
        totalPages: ebookState.totalPages,
        completedPages: ebookState.completedPages,
        failedPages: ebookState.failedPages,
        pages
      })

      return { success: true }
    } catch (error) {
      console.error("Erro ao migrar ebook do Redis para Postgres:", error)
      throw error
    }
  }

  // ================== UTILITÁRIOS ==================

  /**
   * Obter estatísticas da biblioteca
   */
  static async getLibraryStats() {
    try {
      const totalEbooks = await db.select().from(ebooks)
      const completedEbooks = totalEbooks.filter(e => e.status === "completed")
      const totalPages = totalEbooks.reduce((sum, e) => sum + e.totalPages, 0)
      const completedPages = totalEbooks.reduce((sum, e) => sum + e.completedPages, 0)

      return {
        totalEbooks: totalEbooks.length,
        completedEbooks: completedEbooks.length,
        totalPages,
        completedPages,
        completionRate: totalPages > 0 ? (completedPages / totalPages) * 100 : 0
      }
    } catch (error) {
      console.error("Erro ao obter estatísticas:", error)
      return {
        totalEbooks: 0,
        completedEbooks: 0,
        totalPages: 0,
        completedPages: 0,
        completionRate: 0
      }
    }
  }
}

// Re-exportar para compatibilidade
export { testConnection } from "./db"
export type { Ebook, EbookPage, NewEbook, NewEbookPage }
