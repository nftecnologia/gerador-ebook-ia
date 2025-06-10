import { 
  getRedisClient, 
  getEbookState, 
  getEbookPages, 
  updatePageStatus,
  checkRedisConnection,
  getNextQueueItem
} from './lib/redis'; 
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

// Definir tipo para o item da fila
type QueueItem = {
  ebookId: string;
  pageIndex: number;
};

// Configurações do pool de workers
const WORKER_CONFIG = {
  // Número de workers concorrentes (pode ser configurado via env)
  CONCURRENT_WORKERS: parseInt(process.env.CONCURRENT_WORKERS || '3'),
  // Delay entre processamentos para evitar rate limiting
  PROCESSING_DELAY: parseInt(process.env.PROCESSING_DELAY || '1000'), // 1 segundo
  // Timeout para cada operação de geração
  GENERATION_TIMEOUT: parseInt(process.env.GENERATION_TIMEOUT || '60000'), // 60 segundos
  // Intervalo de polling quando não há itens na fila
  POLL_INTERVAL: parseInt(process.env.POLL_INTERVAL || '2000'), // 2 segundos
  // Máximo de tentativas para cada item
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '3'),
};

// Configurações de conteúdo
const CONTENT_MODES = {
  FULL: {
    maxTokens: 600,
    promptSuffix: "Escreva um conteúdo detalhado com aproximadamente 400-500 palavras.",
  },
  MEDIUM: {
    maxTokens: 450,
    promptSuffix: "Escreva um conteúdo conciso com aproximadamente 250-300 palavras.",
  },
  MINIMAL: {
    maxTokens: 300,
    promptSuffix: "Escreva um conteúdo breve com aproximadamente 150-200 palavras.",
  },
  ULTRA_MINIMAL: {
    maxTokens: 150,
    promptSuffix: "Escreva apenas um parágrafo curto com aproximadamente 50-100 palavras.",
  },
};

// Estatísticas do pool
let stats = {
  totalProcessed: 0,
  totalSucceeded: 0,
  totalFailed: 0,
  activeWorkers: 0,
  startTime: Date.now(),
};

// Função para gerar o conteúdo de uma página com timeout
async function generatePageContent(
  ebookTitle: string,
  ebookDescription: string,
  pageTitle: string,
  pageIndex: number,
  contentMode: string,
  allPageTitles: string[]
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WORKER_CONFIG.GENERATION_TIMEOUT);

  try {
    const mode = CONTENT_MODES[contentMode as keyof typeof CONTENT_MODES] || CONTENT_MODES.MEDIUM;

    const tableOfContents = allPageTitles
      .map((title, index) => `${index + 1}. ${title}${index === pageIndex ? " <-- VOCÊ ESTÁ AQUI" : ""}`)
      .join("\n");

    const prompt = `Você é um escritor especialista criando o conteúdo para um ebook.
    Título do Ebook: "${ebookTitle}"
    Descrição: "${ebookDescription}"

    Sumário Completo:
    ${tableOfContents}

    Sua tarefa é escrever o conteúdo APENAS para a Página ${pageIndex + 1}, cujo título é "${pageTitle}".

    Instruções importantes:
    1. Considere o contexto geral do ebook fornecido pelo sumário.
    2. Foque estritamente no tópico definido pelo título desta página ("${pageTitle}").
    3. Evite repetir informações que provavelmente foram abordadas em páginas anteriores ou serão abordadas em páginas futuras, use o sumário como guia.
    4. ${mode.promptSuffix}
    5. Escreva em português do Brasil com linguagem clara e envolvente.
    6. NÃO inclua o título da página ou o número da página no conteúdo que você escrever. Apenas o texto da página.
    7. NÃO escreva introduções ou conclusões genéricas para esta página; vá direto ao ponto do título.
    
    Conteúdo da Página ${pageIndex + 1}:`;

    console.log(`[Worker] Gerando conteúdo para página ${pageIndex + 1} (Ebook: ${ebookTitle.substring(0, 20)}...)`);
    
    const { text } = await generateText({
      model: openai("gpt-4o"),
      prompt,
      maxTokens: mode.maxTokens + 50,
      abortSignal: controller.signal,
    });

    clearTimeout(timeoutId);
    return text;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`[Worker] Error generating page content for page ${pageIndex}:`, error);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Generation timeout after ${WORKER_CONFIG.GENERATION_TIMEOUT}ms`);
    }
    
    throw new Error(`Failed to generate content: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// Função para processar um item da fila com retry logic
async function processQueueItem(item: QueueItem, workerId: number, retryCount = 0): Promise<boolean> {
  const { ebookId, pageIndex } = item;
  console.log(`[Worker-${workerId}] Processing job: EbookID=${ebookId}, PageIndex=${pageIndex} (Attempt ${retryCount + 1}/${WORKER_CONFIG.MAX_RETRIES + 1})`);

  try {
    stats.activeWorkers++;

    const [ebookState, allPages] = await Promise.all([
      getEbookState(ebookId),
      getEbookPages(ebookId)
    ]);

    if (!ebookState) {
      console.error(`[Worker-${workerId}] Ebook ${ebookId} not found for page ${pageIndex}`);
      return false;
    }

    if (!Array.isArray(allPages) || allPages.length === 0) {
      console.error(`[Worker-${workerId}] Page data not found or invalid for ebook ${ebookId}`);
      await updatePageStatus(ebookId, pageIndex, "failed", "", "Page data not found or invalid in Redis");
      return false;
    }

    const currentPageData = allPages.find(p => p.pageIndex === pageIndex);
    if (!currentPageData) {
      console.error(`[Worker-${workerId}] Current page data (${pageIndex}) not found in list for ebook ${ebookId}`);
      await updatePageStatus(ebookId, pageIndex, "failed", "", "Current page data not found in list");
      return false;
    }

    const allPageTitles = allPages
      .sort((a, b) => a.pageIndex - b.pageIndex)
      .map(p => p.pageTitle);

    await updatePageStatus(ebookId, pageIndex, "processing");
    console.log(`[Worker-${workerId}] Status updated to processing for ${ebookId}-${pageIndex}`);

    const content = await generatePageContent(
      ebookState.title,
      ebookState.description,
      currentPageData.pageTitle,
      pageIndex,
      ebookState.contentMode,
      allPageTitles
    );

    await updatePageStatus(ebookId, pageIndex, "completed", content);
    console.log(`[Worker-${workerId}] Status updated to completed for ${ebookId}-${pageIndex}`);

    stats.totalSucceeded++;
    return true;
  } catch (error) {
    console.error(`[Worker-${workerId}] Error processing queue item ${ebookId}-${pageIndex} (Attempt ${retryCount + 1}):`, error);
    
    // Retry logic para erros temporários
    if (retryCount < WORKER_CONFIG.MAX_RETRIES) {
      const isRetryableError = error instanceof Error && (
        error.message.includes('timeout') ||
        error.message.includes('rate limit') ||
        error.message.includes('temporary') ||
        error.message.includes('network')
      );
      
      if (isRetryableError) {
        console.log(`[Worker-${workerId}] Retrying ${ebookId}-${pageIndex} in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000 * (retryCount + 1))); // Backoff exponencial
        return processQueueItem(item, workerId, retryCount + 1);
      }
    }

    try {
      await updatePageStatus(ebookId, pageIndex, "failed", "", error instanceof Error ? error.message : "Unknown error");
      console.log(`[Worker-${workerId}] Status updated to failed for ${ebookId}-${pageIndex}`);
    } catch (updateError) {
      console.error(`[Worker-${workerId}] CRITICAL: Error updating page status to failed:`, updateError);
    }
    
    stats.totalFailed++;
    return false;
  } finally {
    stats.activeWorkers--;
    stats.totalProcessed++;
  }
}

// Worker individual
async function worker(workerId: number): Promise<void> {
  console.log(`[Worker-${workerId}] Started`);

  while (true) {
    try {
      // Buscar próximo item da fila
      const item = await getNextQueueItem();
      
      if (item) {
        await processQueueItem(item, workerId);
        
        // Pequeno delay para evitar rate limiting
        if (WORKER_CONFIG.PROCESSING_DELAY > 0) {
          await new Promise(resolve => setTimeout(resolve, WORKER_CONFIG.PROCESSING_DELAY));
        }
      } else {
        // Fila vazia, aguardar antes de verificar novamente
        await new Promise(resolve => setTimeout(resolve, WORKER_CONFIG.POLL_INTERVAL));
      }
    } catch (error) {
      console.error(`[Worker-${workerId}] Error in worker loop:`, error);
      
      // Verificar conexão Redis
      const connectionValid = await checkRedisConnection();
      if (!connectionValid) {
        console.error(`[Worker-${workerId}] Redis connection lost. Retrying in 10 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      } else {
        // Erro temporário, aguardar um pouco
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
}

// Função para imprimir estatísticas
function printStats(): void {
  const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
  const successRate = stats.totalProcessed > 0 ? ((stats.totalSucceeded / stats.totalProcessed) * 100).toFixed(1) : '0.0';
  
  console.log(`[Stats] Uptime: ${uptime}s | Processed: ${stats.totalProcessed} | Success: ${stats.totalSucceeded} | Failed: ${stats.totalFailed} | Success Rate: ${successRate}% | Active: ${stats.activeWorkers}`);
}

// Verificar variáveis de ambiente
if (!process.env.REDIS_PUBLIC_URL && !process.env.REDIS_URL) {
  console.error("Missing Redis environment variables: REDIS_PUBLIC_URL or REDIS_URL is required.");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing environment variable: OPENAI_API_KEY is required for generating content.");
  process.exit(1);
}

// Função principal
async function main() {
  console.log(`[Worker Pool] Initializing with ${WORKER_CONFIG.CONCURRENT_WORKERS} workers...`);
  console.log(`[Worker Pool] Config:`, WORKER_CONFIG);

  // Verificar conexão Redis inicial
  const isConnected = await checkRedisConnection();
  if (!isConnected) {
    console.error("[Worker Pool] Initial Redis connection check failed. Exiting.");
    process.exit(1);
  }
  console.log("[Worker Pool] Redis connection successful.");

  // Iniciar workers
  const workers = Array.from({ length: WORKER_CONFIG.CONCURRENT_WORKERS }, (_, i) => 
    worker(i + 1)
  );

  // Iniciar timer de estatísticas
  const statsInterval = setInterval(printStats, 30000); // A cada 30 segundos

  // Tratamento de sinais para shutdown graceful
  process.on('SIGINT', () => {
    console.log('[Worker Pool] Shutting down gracefully...');
    clearInterval(statsInterval);
    printStats();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('[Worker Pool] Received SIGTERM, shutting down...');
    clearInterval(statsInterval);
    printStats();
    process.exit(0);
  });

  console.log(`[Worker Pool] All ${WORKER_CONFIG.CONCURRENT_WORKERS} workers started. Press Ctrl+C to stop.`);
  
  // Aguardar todos os workers (eles rodam indefinidamente)
  await Promise.all(workers);
}

// Iniciar o pool de workers
main().catch(error => {
  console.error("[Worker Pool] Unhandled error in main execution:", error);
  process.exit(1);
});
