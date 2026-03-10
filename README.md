# AutoScript

[![GitHub](https://img.shields.io/badge/GitHub-auto--transcript--local--ia-181717?logo=github)](https://github.com/lucasftas/auto-transcript-local-ia)

Aplicativo desktop para transcrição automática de vídeo/áudio, construído com [Tauri](https://tauri.app/) + React + Rust.

Monitora pastas continuamente e transcreve arquivos `.mp4`, `.mov`, `.m4v` para `.txt` usando o modelo Whisper — sem nuvem, sem internet, tudo local.

---

## Funcionalidades

- **Monitor de pastas** — detecta novos vídeos automaticamente
- **Múltiplos monitores** — configure quantos pares origem→saída quiser
- **Fila de transcrição** — processa arquivos em sequência, com barra de progresso
- **Executar agora** — processa arquivos já existentes na pasta com um clique
- **Pause / Resume / Stop** — controle total sobre cada monitor
- **Persistência** — pares e fila salvos no disco, restaurados ao reabrir
- **100% local** — modelo Whisper roda na máquina, sem envio de dados
- **Suporte a Google Drive / OneDrive** — detecta e baixa automaticamente arquivos em modo streaming (Files On-Demand) antes de transcrever
- **Controles de performance** — ajuste beam search, threads de CPU e temperatura diretamente nas configurações

---

## Pré-requisitos

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)
- [Tauri CLI v2](https://tauri.app/start/prerequisites/)

---

## Instalação e desenvolvimento

```bash
# Instalar dependências
pnpm install

# Iniciar em modo dev (abre janela do app)
pnpm tauri dev
```

### Build de produção

```bash
pnpm tauri build
```

O instalador é gerado em `target/release/bundle/`.

---

## Configuração

Ao abrir o app pela primeira vez, vá em **Configurações** (ícone de engrenagem) e:

1. Baixe o modelo Whisper desejado (recomendado: Large-v3 para melhor qualidade)
2. Selecione a GPU (detectada automaticamente)
3. Ajuste os parâmetros de performance conforme sua máquina
4. Opcionalmente configure pastas padrão de origem e saída

### Parâmetros de performance

| Parâmetro | Default | Descrição |
|-----------|---------|-----------|
| Beam search | 8 | Mais beams = mais uso de GPU e melhor precisão |
| Threads de CPU | 8 | Mais threads = alimenta a GPU mais rápido |
| Temperatura | 0.0 | 0.0 = determinístico (recomendado para transcrição) |

---

## Arquivos do Google Drive / OneDrive

O app suporta pastas sincronizadas com Google Drive ou OneDrive no modo **Files On-Demand** (streaming). Quando um arquivo de vídeo é detectado como placeholder (não baixado localmente), o app:

1. Detecta via atributos do Windows (`FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS`)
2. Força o download abrindo o arquivo
3. Aguarda até o download completar (timeout de 10 minutos)
4. Mostra status "Baixando da nuvem..." na fila de transcrição
5. Inicia a transcrição normalmente após o download

---

## Estrutura do projeto

```
├── desktop/
│   ├── src/                  # Frontend React + TypeScript
│   │   ├── pages/monitor/    # Página principal — monitoramento
│   │   ├── pages/settings/   # Configurações (modelo, GPU, pastas, performance)
│   │   ├── pages/setup/      # Onboarding (download do modelo)
│   │   └── providers/        # Context providers (preferências)
│   └── src-tauri/            # Backend Rust
│       └── src/
│           ├── cmd/          # Comandos Tauri (transcribe, watcher, etc.)
│           ├── setup.rs      # Inicialização do app
│           └── sona.rs       # Gerenciamento do processo Sona (Whisper.cpp)
```

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Framework desktop | Tauri v2 |
| Frontend | React 18 + TypeScript + Vite |
| Estilização | Inline styles (design AME-light) |
| Backend | Rust + Tokio |
| Transcrição | [Whisper.cpp](https://github.com/ggerganov/whisper.cpp) via Sona |
| File watching | [notify](https://github.com/notify-rs/notify) |
| Cloud files | Windows API (`GetFileAttributesW`) para detecção de placeholders |

---

## Licença

MIT
