# Shorts Studio Pro - Guia do Painel / Dashboard

O **Shorts Studio Pro** é um painel visual moderno criado para permitir que você execute **cada etapa do pipeline de forma manual, controlada e visual** diretamente no seu navegador.

---

## 1. Como Iniciar o Painel

Você tem três formas simples de iniciar:

### Opção A: Pelo arquivo executável (1 Clique)
Dê um duplo clique no arquivo:
👉 **`iniciar-painel.bat`** (localizado na pasta do projeto).
Ele abrirá o seu navegador automaticamente em `http://localhost:3333`.

### Opção B: Pelo terminal
```bash
npm run dashboard
# ou
node dashboard/server.js
```
Em seguida, acesse no navegador: **`http://localhost:3333`**.

---

## 2. Visão Geral das Etapas no Painel

O painel é dividido em duas áreas principais:

### 🔍 Aba 1: Pesquisa & Download
1. **Palavra-chave ou Hashtag:** Digite o nicho (ex: `movierecap`, `#curiosidades`, `misterios`).
2. **Range de Publicação:**
   - Últimas 24 horas
   - Última semana (7 dias)
   - Último mês (30 dias)
   - Últimos 3 meses
   - Último ano
   - Qualquer data
3. **Mínimo de Visualizações:** Filtre apenas vídeos que já provaram viralidade (ex: +500.000 ou +1.000.000 de views).
4. **Baixar com 1 Clique:**
   - Ao listar os resultados com thumbnail, views, canal e duração, clique no botão **"⬇️ Baixar este Vídeo"**.
   - O sistema baixa o `original.mp4`, cria a pasta do projeto em `videos/<nome_do_video>/`, salva o `info.json` e já redireciona para a Esteira.
   - Você também pode colar o link direto de um Short para download imediato.

---

### ⚡ Aba 2: Esteira de Produção Manual

Na barra lateral esquerda, você pode alternar entre qualquer um dos vídeos que já estão na sua pasta `videos/`. Para o vídeo selecionado, você tem cards manuais com feedback visual:

#### Etapa 1 & 2: Vídeo Original e Remoção de Marca d'Água (VMake)
- **Player Duplo:** Visualize o `original.mp4` e o `sem_marca.mp4`.
- **Botão "Executar Remoção VMake (Playwright)":**
  - Aciona o robô do Playwright em segundo plano com a sua conta persistida.
  - Exibe o **console de progresso ao vivo** na tela (upload, seleção do Inteligente Pro, porcentagem de conclusão e download).
  - Atualiza o player com o `sem_marca.mp4` assim que o VMake finalizar.

#### Etapa 3: Transcrição de Áudio (Voice Studio)
- **Botão "🎙️ Transcrever Áudio":**
  - Envia o áudio do vídeo para o Voice Studio na porta `3900` processando localmente com Whisper na sua GPU.
  - O texto extraído é exibido na caixa de texto.
  - Você pode fazer correções manuais no texto e clicar em **"Salvar Alterações"** (salvo em `transcricao_original.txt`).

#### Etapa 4: Tradução com ChatGPT (Sincronizada com Cenas)
- **Botão "🌐 Traduzir com ChatGPT":**
  - Envia a transcrição para a OpenAI (`gpt-4o-mini`) usando a chave do seu `.env`.
  - Utiliza um prompt especializado em vídeos curtos, instruindo a IA a manter exatamente a mesma contagem de sílabas, ritmo e pausas do original para que a fala case perfeitamente com os cortes de cena.
  - O texto traduzido aparece em uma área editável. Você pode ajustar palavras ou expressões e salvar (`roteiro_traduzido.txt`).

#### Etapa 5: Locução com Voz IA (Voice Studio)
- **Seleção de Voz:** Pré-configurada com o seu clone **`Curiosidades - Padrão`**.
- **Ajuste de Velocidade:** Padrão em `1.05x` (ideal para ritmo de Shorts).
- **Botão "🔊 Gerar Narração":**
  - Envia o roteiro traduzido para síntese de áudio no Voice Studio.
  - Gera o arquivo `narracao.mp3` na pasta do vídeo.
  - Ativa o player de áudio na tela para você escutar a locução na hora.

#### Etapa 6: Mesclagem Final (Vídeo Sem Marca + Novo Áudio)
- **Botão "🎬 Mesclar Vídeo + Novo Áudio":**
  - Executa o FFmpeg nativo do seu computador, unindo o `sem_marca.mp4` com a `narracao.mp3`, gerando o arquivo final: `final.mp4`.
  - Player embutido para assistir ao resultado final pronto para publicação!

---

## 3. Estrutura de Arquivos Resultante

Para cada vídeo trabalhado, todos os arquivos ficam perfeitamente centralizados na mesma pasta:

```text
videos/
└── They_threw_a_bomb_at_the_swarm/
    ├── info.json                  <- Metadados (url, views, título, canal)
    ├── original.mp4               <- Vídeo original bruto baixado
    ├── sem_marca.mp4              <- Vídeo limpo pelo VMake
    ├── transcricao_original.txt   <- Fala original extraída pelo Whisper
    ├── roteiro_traduzido.txt      <- Tradução adaptada para bater as cenas
    ├── narracao.mp3               <- Áudio gerado na voz "Curiosidades - Padrão"
    └── final.mp4                  <- Vídeo limpo com a nova narração mesclada
```
