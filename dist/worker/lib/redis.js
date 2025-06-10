"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRedisConnection = checkRedisConnection;
exports.getRedisClient = getRedisClient;
exports.createEbookQueue = createEbookQueue;
exports.getEbookState = getEbookState;
exports.getEbookPages = getEbookPages;
exports.getNextQueueItem = getNextQueueItem;
exports.updatePageStatus = updatePageStatus;
exports.getEbookPage = getEbookPage;
const ioredis_1 = __importDefault(require("ioredis"));
// Verificar se as variáveis de ambiente estão definidas - usar URL pública por padrão
const redisUrl = process.env.REDIS_PUBLIC_URL || process.env.REDIS_URL || "";
// Criar cliente Redis apenas se as variáveis de ambiente estiverem definidas
let redis = null;
try {
    if (redisUrl) {
        console.log("Inicializando cliente Redis com Railway");
        redis = new ioredis_1.default(redisUrl, {
            maxRetriesPerRequest: 3,
            enableReadyCheck: false,
            lazyConnect: true,
        });
        redis.on('error', (err) => {
            console.error('Redis connection error:', err);
        });
        redis.on('connect', () => {
            console.log('Redis connected successfully');
        });
    }
    else {
        console.warn("Variáveis de ambiente do Redis não estão definidas. A funcionalidade do Redis não funcionará corretamente.");
    }
}
catch (error) {
    console.error("Falha ao inicializar o cliente Redis:", error);
}
// Função para verificar a conexão com o Redis
async function checkRedisConnection() {
    try {
        if (!redis) {
            console.error("Cliente Redis não foi inicializado");
            return false;
        }
        if (!redisUrl) {
            console.error("URL do Redis não está definida");
            return false;
        }
        try {
            const testKey = `test-connection-${Date.now()}`;
            await redis.set(testKey, "test-value");
            const value = await redis.get(testKey);
            await redis.del(testKey);
            return value === "test-value";
        }
        catch (pingError) {
            console.error("Erro ao testar conexão com Redis:", pingError);
            return false;
        }
    }
    catch (error) {
        console.error("Falha na conexão com o Redis:", error);
        return false;
    }
}
// Função auxiliar para obter o cliente Redis
function getRedisClient() {
    return redis;
}
// Prefixos para as chaves no Redis
const EBOOK_PREFIX = "ebook:";
const EBOOK_PAGE_PREFIX = "ebook-page:";
const EBOOK_QUEUE_PREFIX = "ebook-queue:";
async function createEbookQueue(title, description, contentMode, pageTitles) {
    try {
        const isConnected = await checkRedisConnection();
        if (!isConnected) {
            throw new Error("Não foi possível conectar ao Redis. Verifique suas variáveis de ambiente.");
        }
        const client = getRedisClient();
        if (!client) {
            throw new Error("Cliente Redis não está disponível");
        }
        const ebookId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const ebookState = {
            id: ebookId,
            title,
            description,
            contentMode,
            status: "queued",
            totalPages: pageTitles.length,
            completedPages: 0,
            processingPages: 0,
            queuedPages: pageTitles.length,
            failedPages: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        await client.set(`${EBOOK_PREFIX}${ebookId}`, JSON.stringify(ebookState));
        const queuePromises = pageTitles.map((pageTitle, index) => {
            const page = {
                ebookId,
                pageIndex: index,
                pageTitle,
                status: "queued",
                content: "",
                attempts: 0,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            return client.set(`${EBOOK_PAGE_PREFIX}${ebookId}:${index}`, JSON.stringify(page)).then(() => {
                return client.lpush(`${EBOOK_QUEUE_PREFIX}pages`, JSON.stringify({
                    ebookId,
                    pageIndex: index,
                }));
            });
        });
        await Promise.all(queuePromises);
        return { ebookId, state: ebookState };
    }
    catch (error) {
        console.error("Erro ao criar fila do ebook:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Falha ao criar fila do ebook: ${errorMessage}`);
    }
}
async function getEbookState(ebookId) {
    try {
        const isConnected = await checkRedisConnection();
        if (!isConnected) {
            console.warn("Não foi possível conectar ao Redis. Retornando null.");
            return null;
        }
        const client = getRedisClient();
        if (!client) {
            console.warn("Cliente Redis não está disponível. Retornando null.");
            return null;
        }
        const ebookStateData = await client.get(`${EBOOK_PREFIX}${ebookId}`);
        if (!ebookStateData) {
            return null;
        }
        if (typeof ebookStateData === "object" && ebookStateData !== null) {
            if (ebookStateData && 'id' in ebookStateData && 'title' in ebookStateData && 'totalPages' in ebookStateData) {
                return ebookStateData;
            }
            else {
                console.error("Objeto retornado pelo Redis para ebook state é inválido:", ebookStateData);
                return null;
            }
        }
        if (typeof ebookStateData === "string") {
            try {
                const parsedState = JSON.parse(ebookStateData);
                if (parsedState && parsedState.id && parsedState.title && typeof parsedState.totalPages === 'number') {
                    return parsedState;
                }
                else {
                    console.error("Estado do ebook após parse é inválido:", parsedState);
                    return null;
                }
            }
            catch (parseError) {
                console.error("Erro no JSON.parse do estado do ebook:", parseError);
                return null;
            }
        }
        console.error(`Tipo inesperado recebido para ebook state: ${typeof ebookStateData}`);
        return null;
    }
    catch (error) {
        console.error("Erro ao obter estado do ebook:", error);
        return null;
    }
}
async function getEbookPages(ebookId) {
    try {
        const isConnected = await checkRedisConnection();
        if (!isConnected) {
            console.warn("Não foi possível conectar ao Redis. Retornando array vazio.");
            return [];
        }
        const client = getRedisClient();
        if (!client) {
            console.warn("Cliente Redis não está disponível. Retornando array vazio.");
            return [];
        }
        const ebookState = await getEbookState(ebookId);
        if (!ebookState) {
            console.warn(`Estado do ebook ${ebookId} não encontrado. Retornando array vazio.`);
            return [];
        }
        const totalPages = ebookState.totalPages;
        if (totalPages <= 0) {
            return [];
        }
        const pageKeys = Array.from({ length: totalPages }, (_, i) => `${EBOOK_PAGE_PREFIX}${ebookId}:${i}`);
        const results = await client.mget(...pageKeys);
        const pages = [];
        results.forEach((pageData, index) => {
            if (!pageData) {
                return;
            }
            try {
                const parsedPage = JSON.parse(pageData);
                if (parsedPage && parsedPage.ebookId && typeof parsedPage.pageIndex === 'number' && parsedPage.pageTitle) {
                    pages.push(parsedPage);
                }
                else {
                    console.warn(`Dados da página ${index} inválidos após parse:`, parsedPage);
                }
            }
            catch (parseError) {
                console.error(`Erro ao fazer parse da página ${index}:`, parseError);
            }
        });
        pages.sort((a, b) => a.pageIndex - b.pageIndex);
        return pages;
    }
    catch (error) {
        console.error(`Erro ao obter páginas do ebook ${ebookId}:`, error);
        return [];
    }
}
async function getNextQueueItem() {
    try {
        const isConnected = await checkRedisConnection();
        if (!isConnected) {
            console.warn("Não foi possível conectar ao Redis. Retornando null.");
            return null;
        }
        const client = getRedisClient();
        if (!client) {
            console.warn("Cliente Redis não está disponível. Retornando null.");
            return null;
        }
        const item = await client.lpop(`${EBOOK_QUEUE_PREFIX}pages`);
        if (!item) {
            return null;
        }
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
            if ("ebookId" in item && "pageIndex" in item) {
                return item;
            }
            else {
                console.error("Objeto retornado pelo Redis não tem as propriedades esperadas:", item);
                return null;
            }
        }
        try {
            const parsedItem = JSON.parse(item);
            if (!parsedItem.ebookId || typeof parsedItem.pageIndex !== "number") {
                console.error("Item da fila não tem as propriedades esperadas:", parsedItem);
                return null;
            }
            return parsedItem;
        }
        catch (parseError) {
            console.error("Erro ao fazer parse do item da fila:", parseError);
            return null;
        }
    }
    catch (error) {
        console.error("Erro ao obter próximo item da fila:", error);
        return null;
    }
}
async function updatePageStatus(ebookId, pageIndex, status, content = "", error = "") {
    try {
        const isConnected = await checkRedisConnection();
        if (!isConnected) {
            console.warn("Não foi possível conectar ao Redis. Abortando atualização.");
            return;
        }
        const client = getRedisClient();
        if (!client) {
            console.warn("Cliente Redis não está disponível. Abortando atualização.");
            return;
        }
        const pageKey = `${EBOOK_PAGE_PREFIX}${ebookId}:${pageIndex}`;
        const pageData = await client.get(pageKey);
        if (!pageData) {
            console.warn(`Página ${pageIndex} para o ebook ${ebookId} não encontrada.`);
            return;
        }
        let page = null;
        if (typeof pageData === "object" && pageData !== null) {
            if (pageData && 'ebookId' in pageData && 'pageIndex' in pageData && 'pageTitle' in pageData) {
                page = pageData;
            }
            else {
                console.error("Objeto retornado pelo Redis para page data é inválido:", pageData);
            }
        }
        else if (typeof pageData === "string") {
            try {
                const parsedPage = JSON.parse(pageData);
                if (parsedPage && parsedPage.ebookId && typeof parsedPage.pageIndex === 'number' && parsedPage.pageTitle) {
                    page = parsedPage;
                }
                else {
                    console.error("Dados da página inválidos após parse:", parsedPage);
                }
            }
            catch (parseError) {
                console.error("Erro ao fazer parse dos dados da página:", parseError);
            }
        }
        else {
            console.error(`Tipo inesperado recebido para page data: ${typeof pageData}`);
        }
        if (!page) {
            console.error(`Não foi possível obter dados válidos para a página ${pageIndex} do ebook ${ebookId}.`);
            return;
        }
        page.status = status;
        page.content = content;
        page.error = error;
        page.updatedAt = Date.now();
        await client.set(pageKey, JSON.stringify(page));
        await updateEbookState(ebookId);
    }
    catch (error) {
        console.error("Erro ao atualizar status da página:", error);
    }
}
async function updateEbookState(ebookId) {
    try {
        const ebookState = await getEbookState(ebookId);
        if (!ebookState) {
            console.warn(`Ebook ${ebookId} não encontrado.`);
            return;
        }
        const client = getRedisClient();
        if (!client) {
            console.warn("Cliente Redis não está disponível. Abortando atualização.");
            return;
        }
        const pages = await getEbookPages(ebookId);
        if (!Array.isArray(pages)) {
            console.error("Erro: pages não é um array:", pages);
            return;
        }
        let completedCount = 0;
        let processingCount = 0;
        let queuedCount = 0;
        let failedCount = 0;
        pages.forEach((page) => {
            if (page.status === "completed") {
                completedCount++;
            }
            else if (page.status === "processing") {
                processingCount++;
            }
            else if (page.status === "queued") {
                queuedCount++;
            }
            else if (page.status === "failed") {
                failedCount++;
            }
        });
        let ebookStatus = "processing";
        if (failedCount + completedCount === ebookState.totalPages) {
            ebookStatus = failedCount > 0 ? "partial" : "completed";
            if (failedCount === ebookState.totalPages)
                ebookStatus = "failed";
        }
        else if (queuedCount === ebookState.totalPages) {
            ebookStatus = "queued";
        }
        else if (processingCount > 0 || queuedCount > 0) {
            ebookStatus = "processing";
        }
        else {
            ebookStatus = "partial";
        }
        ebookState.status = ebookStatus;
        ebookState.completedPages = completedCount;
        ebookState.processingPages = processingCount;
        ebookState.queuedPages = queuedCount;
        ebookState.failedPages = failedCount;
        ebookState.updatedAt = Date.now();
        await client.set(`${EBOOK_PREFIX}${ebookId}`, JSON.stringify(ebookState));
    }
    catch (error) {
        console.error("Erro ao atualizar estado do ebook:", error);
    }
}
async function getEbookPage(ebookId, pageIndex) {
    try {
        const isConnected = await checkRedisConnection();
        if (!isConnected) {
            console.warn("Não foi possível conectar ao Redis. Retornando null.");
            return null;
        }
        const client = getRedisClient();
        if (!client) {
            console.warn("Cliente Redis não está disponível. Retornando null.");
            return null;
        }
        const pageKey = `${EBOOK_PAGE_PREFIX}${ebookId}:${pageIndex}`;
        const pageData = await client.get(pageKey);
        if (!pageData) {
            return null;
        }
        if (typeof pageData === "object" && pageData !== null) {
            if (pageData && 'ebookId' in pageData && 'pageIndex' in pageData && 'pageTitle' in pageData) {
                return pageData;
            }
            else {
                console.error("Objeto retornado pelo Redis para page data é inválido:", pageData);
                return null;
            }
        }
        if (typeof pageData === "string") {
            try {
                const parsedPage = JSON.parse(pageData);
                if (parsedPage && parsedPage.ebookId && typeof parsedPage.pageIndex === 'number' && parsedPage.pageTitle) {
                    return parsedPage;
                }
                else {
                    console.error("Dados da página inválidos após parse:", parsedPage);
                    return null;
                }
            }
            catch (parseError) {
                console.error(`Erro ao fazer parse dos dados da página ${pageIndex}:`, parseError);
                return null;
            }
        }
        console.error(`Tipo inesperado recebido para page data: ${typeof pageData}`);
        return null;
    }
    catch (error) {
        console.error(`Erro ao obter página ${pageIndex} do ebook ${ebookId}:`, error);
        return null;
    }
}
