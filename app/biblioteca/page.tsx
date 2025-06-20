
"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Download, Trash2, Eye, ArrowLeft } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { SimpleLoading } from "@/components/simple-loading"
import { PageViewer } from "@/components/page-viewer"
import { useToast } from "@/components/ui/use-toast"

type EbookInLibrary = {
  id: number
  uuid: string
  title: string
  description: string
  contentMode: string
  totalPages: number
  completedPages: number
  failedPages: number
  status: string
  createdAt: string // ISO string do Postgres
  updatedAt: string
  pages: { 
    id: number
    pageIndex: number
    pageTitle: string
    content: string
    status: string
    createdAt: string
    updatedAt: string
  }[]
}

export default function BibliotecaPage() {
  const [ebooks, setEbooks] = useState<EbookInLibrary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedEbook, setSelectedEbook] = useState<EbookInLibrary | null>(null)
  const [selectedPageIndex, setSelectedPageIndex] = useState<number | null>(null)
  const { toast } = useToast()

  // Carregar ebooks da biblioteca
  useEffect(() => {
    const fetchEbooks = async () => {
      try {
        setIsLoading(true)
        const response = await fetch("/api/biblioteca")

        if (!response.ok) {
          throw new Error(`Erro ao carregar ebooks: ${response.status}`)
        }

        const data = await response.json()

        if (data.success) {
          setEbooks(data.ebooks || [])
        } else {
          console.error("Erro ao carregar ebooks:", data.error)
        }
      } catch (error) {
        console.error("Erro ao carregar ebooks:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchEbooks()
  }, [])

  // Filtrar ebooks com base no termo de pesquisa
  const filteredEbooks = ebooks.filter(
    (ebook) =>
      ebook.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ebook.description.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  // Função para baixar um ebook (ATUALIZADA PARA USAR A API PDF)
  const handleDownloadEbook = (ebook: EbookInLibrary) => {
    console.log("handleDownloadEbook (from Library) called. Ebook ID:", ebook.id);

    if (!ebook.id) {
      alert("Erro: Não foi possível obter o ID deste ebook para download.");
      return;
    }
    
    // Construir a URL de download da API
    const downloadUrl = `/api/ebook/${ebook.id}/download`;
    console.log("Attempting to download PDF from:", downloadUrl);

    // Iniciar o download redirecionando o navegador
    window.location.href = downloadUrl;
  }

  // Função para excluir um ebook
  const handleDeleteEbook = async (ebookUuid: string) => {
    if (!confirm("Tem certeza que deseja excluir este ebook?")) return

    try {
      const response = await fetch(`/api/biblioteca?uuid=${ebookUuid}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error(`Erro ao excluir ebook: ${response.status}`)
      }

      const data = await response.json()

      if (data.success) {
        // Atualizar a lista de ebooks
        setEbooks(ebooks.filter((ebook) => ebook.uuid !== ebookUuid))

        // Se o ebook excluído for o selecionado, limpar a seleção
        if (selectedEbook && selectedEbook.uuid === ebookUuid) {
          setSelectedEbook(null)
          setSelectedPageIndex(null)
        }

        // Adicionar toast de sucesso
        toast({
          title: "Ebook Excluído",
          description: "O ebook foi removido da sua biblioteca.",
        })
      } else {
        console.error("Erro ao excluir ebook:", data.error)
        toast({
          variant: "destructive",
          title: "Erro ao Excluir",
          description: data.error || "Não foi possível excluir o ebook.",
        })
      }
    } catch (error) {
      console.error("Erro ao excluir ebook:", error)
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido"
      toast({
        variant: "destructive",
        title: "Erro ao Excluir",
        description: errorMessage,
      })
    }
  }

  // Função para visualizar um ebook
  const handleViewEbook = (ebook: EbookInLibrary) => {
    setSelectedEbook(ebook)
    setSelectedPageIndex(0) // Selecionar a primeira página por padrão
  }

  // Preparar dados para o componente de páginas
  const preparePageData = () => {
    if (!selectedEbook) return []

    // Ordenar as páginas por índice
    const sortedPages = [...selectedEbook.pages].sort((a, b) => a.pageIndex - b.pageIndex)

    return sortedPages.map((page) => ({
      index: page.pageIndex,
      content: page.content,
      isGenerated: true,
    }))
  }

  // Renderizar a lista de ebooks
  const renderEbooksList = (status?: string) => {
    if (isLoading) {
      return (
        <div className="flex justify-center py-8">
          <SimpleLoading text="Carregando ebooks..." />
        </div>
      )
    }

    const filtered = status ? filteredEbooks.filter((ebook) => ebook.status === status) : filteredEbooks

    if (filtered.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          {searchTerm ? (
            <p>Nenhum ebook encontrado para "{searchTerm}"</p>
          ) : status ? (
            <p>Nenhum ebook {status === "completed" ? "completo" : "parcial"} encontrado</p>
          ) : (
            <p>Nenhum ebook salvo na biblioteca</p>
          )}
        </div>
      )
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((ebook) => (
          <Card key={ebook.id} className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{ebook.title}</CardTitle>
              <p className="text-xs text-muted-foreground line-clamp-2">{ebook.description}</p>
            </CardHeader>
            <CardContent className="pb-2">
              <div className="text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">Páginas:</span>
                  <span>
                    {ebook.completedPages} de {ebook.totalPages}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Criado:</span>
                  <span>
                    {formatDistanceToNow(new Date(ebook.createdAt), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Status:</span>
                  <span>
                    {ebook.status === "completed" ? "Completo" : ebook.status === "partial" ? "Parcial" : "Com falhas"}
                  </span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-2">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center w-full gap-2">
                <Button variant="outline" size="sm" onClick={() => handleViewEbook(ebook)} className="w-full sm:w-auto">
                  <Eye className="h-4 w-4 mr-1" />
                  Visualizar
                </Button>
                <div className="flex gap-2 self-end sm:self-center">
                  <Button variant="outline" size="sm" onClick={() => handleDownloadEbook(ebook)}>
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDeleteEbook(ebook.uuid)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    )
  }

  // Renderizar o conteúdo do ebook selecionado
  const renderSelectedEbookContent = () => {
    if (!selectedEbook) return null

    const pages = preparePageData()

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-xl font-medium">{selectedEbook.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{selectedEbook.description}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleDownloadEbook(selectedEbook)}>
              <Download className="h-4 w-4 mr-2" />
              Baixar
            </Button>
            <Button variant="outline" onClick={() => setSelectedEbook(null)} className="w-full sm:w-auto">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </div>
        </div>

        <div className="border p-4 rounded-md">
          <div className="text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-muted-foreground">Status:</span>
              <span>
                {selectedEbook.status === "completed"
                  ? "Completo"
                  : selectedEbook.status === "partial"
                    ? "Parcial"
                    : "Com falhas"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Páginas:</span>
              <span>
                {selectedEbook.completedPages} de {selectedEbook.totalPages} páginas geradas
              </span>
            </div>
          </div>
        </div>

        <PageViewer pages={pages} onSelectPage={setSelectedPageIndex} selectedPageIndex={selectedPageIndex} />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-medium mb-6">Biblioteca de Ebooks</h1>

      {selectedEbook ? (
        renderSelectedEbookContent()
      ) : (
        <>
          <div className="flex justify-between items-center mb-6">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Pesquisar ebooks..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <Tabs defaultValue="all" className="mb-6">
            <TabsList className="mb-4 overflow-x-auto whitespace-nowrap pb-2">
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="completed">Completos</TabsTrigger>
              <TabsTrigger value="partial">Parciais</TabsTrigger>
            </TabsList>

            <TabsContent value="all">{renderEbooksList()}</TabsContent>
            <TabsContent value="completed">{renderEbooksList("completed")}</TabsContent>
            <TabsContent value="partial">{renderEbooksList("partial")}</TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
