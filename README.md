## Ephemeral Downloader

Um proxy de download efêmero para você usar a **sua VPS como ponte de alta velocidade** entre servidores lentos e a sua máquina local.

Em vez de baixar direto de um host congestionado, você aponta o link para o Ephemeral Downloader, que:

- Faz o download via VPS (geralmente com rota/peering melhor).
- Transmite o arquivo por **streaming** para o seu navegador.
- Libera os recursos assim que o download termina.

Simples, focado e pensado para quem vive baixando ISOs, ROMs e arquivos grandes.

---

## Como funciona (visão rápida)

- **Frontend (React + Vite)**  
  - Interface SPA com campo de texto para múltiplos links (um por linha).  
  - Lista de downloads recentes com:
    - Progresso em tempo real.
    - Tamanho total e já baixado.
    - Velocidade em **MB/s** e **Mbps**.
    - Botão para **retomar downloads** que falharam dentro da mesma sessão.

- **Backend (Fastify + Streams)**  
  - Rota `GET /stream?url=...&offset=...` que:
    - Faz `HEAD` na origem para validar o link e obter `Content-Length`.  
    - Faz `GET` (ou `Range: bytes=offset-` para retomada).  
    - Faz o **streaming direto** para o cliente, sem guardar arquivo em disco.  
  - Em produção, também serve o build do frontend (Vite) na própria porta do servidor.

---

## Requisitos

- Node.js **>= 20**
- `pnpm` **>= 8**

---

## Instalação

Clone o repositório e instale as dependências:

```bash
git clone <seu-fork-ou-repo> Downloader
cd Downloader
pnpm install
```

---

## Scripts principais

Na raiz do projeto:

- **Desenvolvimento (backend + frontend juntos)**:

```bash
pnpm dev
```

Isso sobe:

- Fastify em `http://localhost:3000`
- Vite em `http://localhost:5173`

- **Build de produção (server + web)**:

```bash
pnpm build
```

- **Start de produção (tudo pela porta 3000)**:

```bash
pnpm start
```

O servidor Fastify:

- Servirá o build do Vite na raiz (`/`).
- Continuará expondo `GET /stream` para o proxy de download.

---

## Configuração de ambiente

### Desenvolvimento

Por padrão o frontend conversa com o backend em:

```ts
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
```

Se você mudar a porta ou rodar o backend em outro host, basta criar um arquivo `.env` dentro de `web/`:

```bash
VITE_API_URL=http://seu-backend:3000
```

### Produção (Nixpacks ou similar)

- Defina a variável `PORT` (a maioria das plataformas faz isso automaticamente).
- O servidor Fastify faz fallback para `3000` se `PORT` não estiver definida.
- O arquivo `nixpacks.toml` já descreve:
  - Comando de build: `pnpm build`
  - Comando de start: `pnpm start`

---

## Fluxo de uso típico

1. Você tem uma **VPS bem localizada** (por exemplo, no mesmo continente do servidor de origem).
2. No seu desktop/notebook, abre o Ephemeral Downloader.
3. Cola um ou mais links HTTP/HTTPS diretos (por exemplo, ROMs no SourceForge).
4. Clica em **“Iniciar download”**.
5. A VPS baixa em alta velocidade e o app:
   - Mostra o progresso.
   - Indica tamanho total / baixado.
   - Mostra velocidade agregada em MB/s e Mbps.
6. Se a conexão cair, você pode **retomar** dentro da mesma sessão.

---

## Limitações intencionais

- **Retomada entre sessões** (fechar aba / desligar máquina) **não é suportada**.  
  - O projeto é focado em uso efêmero, sem manter arquivos em disco no servidor.
- O servidor realiza apenas:
  - Validação básica de URL (somente `http`/`https`).
  - Proxy por streaming com **backpressure** nativo do Node.js.
  - Nenhuma autenticação ou controle de cota por usuário (idealmente coloque atrás de VPN, auth reverso ou firewall).

---

## Ideias futuras

- Autenticação simples para restringir o painel.
- Limite de banda por IP/usuário.
- Modo “linha de comando” usando a mesma API do servidor.

---

## Por que esse projeto existe?

Porque às vezes o problema não é a sua internet nem o servidor de origem, e sim o **caminho entre eles**.  

Colocando uma VPS no meio do caminho, você “puxa” o arquivo por uma rota melhor até a VPS e, de lá, faz o streaming até você com muito mais previsibilidade.  

O Ephemeral Downloader encapsula essa ideia em uma interface simples, focada em quem só quer **colar o link, apertar um botão e acompanhar o progresso**.


