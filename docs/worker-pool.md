# Worker Pool para Geração Rápida de Ebooks

## Visão Geral

O sistema de worker pool implementa múltiplos workers concorrentes para acelerar drasticamente a geração de ebooks, processando várias páginas simultaneamente.

## Características

### ⚡ **Performance Melhorada**
- **5 workers concorrentes** por padrão (configurável)
- **Processamento paralelo** de páginas
- **Retry automático** para erros temporários
- **Timeouts configuráveis** para evitar travamentos

### 🔄 **Sistema de Filas Robusto**
- **Redis como backend** para coordenação
- **Distribuição automática** de trabalho
- **Monitoramento em tempo real** de progresso
- **Recovery automático** de falhas

### 📊 **Monitoramento e Estatísticas**
- **Métricas em tempo real**: processados, sucessos, falhas
- **Taxa de sucesso** calculada automaticamente
- **Logs detalhados** para debugging
- **Workers ativos** monitorados

## Configuração

### Variáveis de Ambiente (Railway)

```bash
# Número de workers concorrentes
CONCURRENT_WORKERS=5

# Delay entre processamentos (ms)
PROCESSING_DELAY=500

# Timeout para geração de conteúdo (ms)
GENERATION_TIMEOUT=90000

# Intervalo de polling da fila (ms)
POLL_INTERVAL=1000

# Máximo de tentativas por item
MAX_RETRIES=3
```

### Performance Esperada

| Workers | Páginas/Minuto | Tempo para 20 páginas |
|---------|----------------|----------------------|
| 1       | ~8-12         | ~90-150 segundos     |
| 3       | ~20-30        | ~40-60 segundos      |
| 5       | ~30-45        | ~30-40 segundos      |

## Comandos

### Desenvolvimento Local
```bash
# Compilar worker pool
npm run build:worker-pool

# Executar localmente
npm run worker-pool

# Desenvolvimento com auto-rebuild
npm run worker-pool:dev
```

### Deploy no Railway
```bash
# Deploy automático com 5 workers
railway up

# Verificar logs em tempo real
railway logs -f
```

## Exemplo de Logs

```
[Worker Pool] Initializing with 5 workers...
[Worker Pool] Config: { CONCURRENT_WORKERS: 5, PROCESSING_DELAY: 500, ... }
[Worker Pool] Redis connection successful.
[Worker-1] Started
[Worker-2] Started
[Worker-3] Started
[Worker-4] Started
[Worker-5] Started
[Worker Pool] All 5 workers started. Press Ctrl+C to stop.

[Worker-1] Processing job: EbookID=1704123456789-abc123, PageIndex=0 (Attempt 1/4)
[Worker-2] Processing job: EbookID=1704123456789-abc123, PageIndex=1 (Attempt 1/4)
[Worker-3] Processing job: EbookID=1704123456789-abc123, PageIndex=2 (Attempt 1/4)

[Stats] Uptime: 60s | Processed: 15 | Success: 14 | Failed: 1 | Success Rate: 93.3% | Active: 3
```

## Arquitetura

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Next.js API   │    │   Redis Queue   │
│                 │    │                 │    │                 │
│ ebook_generator │ -> │ /api/ebook      │ -> │ pages queue     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                                                        v
                                              ┌─────────────────┐
                                              │  Worker Pool    │
                                              │                 │
                                              │ Worker-1 -----> │
                                              │ Worker-2 -----> │ -> OpenAI API
                                              │ Worker-3 -----> │
                                              │ Worker-4 -----> │
                                              │ Worker-5 -----> │
                                              └─────────────────┘
                                                        │
                                                        v
                                              ┌─────────────────┐
                                              │  Redis Results  │
                                              │                 │
                                              │ completed pages │
                                              └─────────────────┘
```

## Vantagens vs Worker Único

### 🚀 **Speed**
- **5x mais rápido** que worker único
- **Paralelização** real de requests à OpenAI
- **Melhor utilização** de recursos

### 🛡️ **Resilência**
- **Falha de 1 worker** não para o sistema
- **Retry automático** com backoff exponencial
- **Recovery graceful** de conexões Redis

### 📈 **Escalabilidade**
- **Configurável** via variáveis de ambiente
- **Ajuste dinâmico** baseado na carga
- **Monitoramento** para otimização

## Troubleshooting

### Worker Lento
```bash
# Verificar configuração
railway vars

# Ajustar workers
railway vars set CONCURRENT_WORKERS=3

# Reduzir timeout
railway vars set GENERATION_TIMEOUT=60000
```

### Rate Limiting OpenAI
```bash
# Aumentar delay entre requests
railway vars set PROCESSING_DELAY=2000

# Reduzir workers concorrentes
railway vars set CONCURRENT_WORKERS=2
```

### Conexão Redis
```bash
# Verificar variáveis Redis
railway vars | grep REDIS

# Testar conexão
railway run node -e "console.log(process.env.REDIS_PUBLIC_URL)"
```

## Próximos Passos

1. **Auto-scaling**: Ajustar workers baseado na fila
2. **Load balancing**: Distribuir entre múltiplas instâncias
3. **Métricas avançadas**: Grafana/Prometheus
4. **Cache inteligente**: Reduzir calls redundantes à OpenAI
