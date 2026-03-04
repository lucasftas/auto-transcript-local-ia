# AutoScript

[![GitHub](https://img.shields.io/badge/GitHub-auto--transcript--local--ia-181717?logo=github)](https://github.com/lucasftas/auto-transcript-local-ia)

Aplicativo desktop para transcrição automática de áudio, construído com [Tauri](https://tauri.app/) + React + Rust.

Monitora pastas continuamente e transcreve arquivos `.mp3` para `.txt` usando o modelo Whisper — sem nuvem, sem internet, tudo local.

---

## Funcionalidades

- **Monitor de pastas** — detecta novos `.mp3` automaticamente
- **Múltiplos monitores** — configure quantos pares origem→saída quiser
- **Fila de transcrição** — processa arquivos em sequência, com barra de progresso
- **Executar agora** — processa arquivos já existentes na pasta com um clique
- **Pause / Resume / Stop** — controle total sobre cada monitor
- **Persistência** — pares salvos no disco, restaurados ao reabrir
- **100% local** — modelo Whisper roda na máquina, sem envio de dados

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

1. Baixe o modelo Whisper desejado
2. Opcionalmente configure pastas padrão de origem e saída

---

## Estrutura do projeto

```
├── desktop/
│   ├── src/                  # Frontend React + TypeScript
│   │   ├── pages/monitor/    # Página principal — monitoramento
│   │   ├── pages/settings/   # Configurações (modelo, GPU, pastas)
│   │   └── pages/setup/      # Onboarding (download do modelo)
│   └── src-tauri/            # Backend Rust
│       └── src/
│           ├── cmd/          # Comandos Tauri (transcribe, watcher, etc.)
│           ├── setup.rs      # Inicialização do app
│           └── sona.rs       # Gerenciamento do processo Sona
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

---

## Licença

MIT
