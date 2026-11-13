# LUMIX Studio — Design System

Documento vivo do painel (`dashboard/public/`). Fonte de verdade dos valores: [`tokens.css`](../dashboard/public/tokens.css). Componentes: [`style.css`](../dashboard/public/style.css).

> **Regra de ouro:** nenhum hex em `style.css`. Cores de papel (texto, superfície, borda, estado, marca, superfície escura) vêm sempre de token. Sombras e brilhos usam tokens de sombra ou alfa de um token.

---

## 1. Princípios

1. **Fluido** — cada ação responde na hora (feedback visual em < 150 ms) e a transição explica de onde veio e para onde foi.
2. **Hierarquia clara** — uma ação primária por contexto; o resto é secundário. O gradiente da marca é reservado para a ação principal.
3. **Contexto sempre visível** — o cabeçalho diz em que seção você está; a navegação agrupa por *fase do trabalho* (Produção → Publicação → Sistema).
4. **Calmo por padrão, vivo na ação** — superfícies claras e neutras; cor de marca e brilho aparecem em estados ativos, progresso e CTAs.
5. **Não depender só de cor** — status sempre tem ícone/texto além da cor.

---

## 2. Marca

**Símbolo:** raio em tile arredondado com gradiente `índigo → violeta → magenta`.
**Wordmark:** `LUMIX` (extrabold) + `STUDIO` (mono, espaçado, cor de acento).

| Uso | Componente |
|---|---|
| Cabeçalho (início) | `.logo-area` › `.brand-mark` + `.logo-text-group` |
| Cabeçalhos de modal | `.brand-mark` (ou `.brand-mark.sm`) |
| Favicon | SVG inline em `index.html` (mesmo raio) |
| Qualquer outro símbolo | `<svg><use href="#lumix-mark"/></svg>` (sprite único no `index.html`) |

**Não fazer:** esticar o símbolo, trocar o gradiente por cor chapada, colocar o raio sobre fundo de cor muito parecida com a marca, criar uma segunda versão do símbolo.

---

## 3. Cor

Todos os papéis são **semânticos**. Use o papel, não a escala primitiva.

### 3.1 Superfícies e texto
| Papel | Token | Valor |
|---|---|---|
| Fundo da página | `--surface-canvas` | `neutral-50` `#f6f7fb` |
| Cartões, modais, cabeçalho | `--surface-raised` | `#ffffff` |
| Área recuada / chips | `--surface-sunken` | `neutral-100` |
| Sidebar | `--surface-sidebar` | `#151a2d` |
| Toast / log | `--neutral-900` / `--neutral-950` | |
| Texto principal | `--text-primary` | `neutral-900` |
| Texto secundário | `--text-secondary` | `neutral-600` |
| Texto auxiliar | `--text-muted` | `neutral-500` |
| Placeholder / dica | `--text-subtle` | `neutral-400` |

### 3.2 Marca e ação
| Papel | Token |
|---|---|
| Ação primária (gradiente) | `--gradient-brand` |
| Cor de acento sólida (links, texto ativo) | `--accent` / `--accent-hover` / `--accent-text` |
| Fundo suave de seleção | `--accent-soft` + `--accent-soft-border` |
| Foco de teclado | `--focus-ring` |

### 3.3 Estado
| Estado | Cor | Fundo | Borda |
|---|---|---|---|
| Sucesso | `--success` | `--success-soft` | `--success-border` |
| Atenção | `--warning` | `--warning-soft` | `--warning-border` |
| Erro | `--danger` | `--danger-soft` | `--danger-border` |
| Informação | `--info` | `--info-soft` | `--info-border` |

### 3.3b Superfície inversa (sidebar escura, log, toast)
Tokens `--on-dark-*`, `--white-a*` e `--surface-log-head` (seção 4b de `tokens.css`). Texto sobre escuro sempre usa `--on-dark-*`; nunca cinza claro improvisado.

### 3.4 Status de produção (selos e pontos)
| Status | Token |
|---|---|
| Em Edição | `--status-editing` (âmbar) |
| Pronto (9:16) | `--status-ready` (verde) |
| Postado | `--status-posted` (índigo) |
| Postado PT / ES / EN / todos | `--status-posted-pt` / `-es` / `-en` / `-all` |

---

## 4. Tipografia

- **Sans:** Plus Jakarta Sans — interface, títulos, corpo.
- **Mono:** JetBrains Mono — eyebrows (`CARD-STEP-BADGE`), IDs, caminhos, logs, contadores.

| Token | Tamanho | Uso |
|---|---|---|
| `--text-2xs` | 11 px | eyebrows, selos, rótulos de grupo |
| `--text-xs` | 12 px | metadados, botões pequenos |
| `--text-sm` | 13 px | texto de apoio, tabelas |
| `--text-base` | 14 px | **corpo e controles padrão** |
| `--text-md` / `--text-lg` | 15 / 17 px | subtítulos, títulos de modal |
| `--text-xl` | 20 px | título de cartão (`.card h2`) |
| `--text-2xl` | 24 px | título de página de métricas |
| `--text-3xl` | 30 px | valores de KPI |

Eyebrows: mono, `--tracking-eyebrow`, maiúsculas. Títulos: `--tracking-tight`.

---

## 5. Espaçamento, raio, elevação, movimento

- **Espaço** (base 4 px): `--space-1` … `--space-12`. Gap padrão entre blocos: `--space-6` (24 px). Padding de cartão: `--space-6`; em mobile `--space-4`.
- **Raio:** `--radius-sm` (8) controles menores · `--radius-md` (12) inputs, botões de bloco, chips grandes · `--radius-lg` (16) cartões · `--radius-xl` (20) modais · `--radius-pill` botões, selos, chips.
- **Sombra:** `--shadow-xs` repouso de inputs · `--shadow-sm` cartões · `--shadow-md` hover · `--shadow-lg` modais, dropdowns, toasts · `--shadow-glow` só na marca e no CTA primário.
- **Movimento:**
  - `--dur-fast` 140 ms — hover de texto, fechar
  - `--dur-base` 220 ms — troca de estado (botões, inputs, nav)
  - `--dur-slow` 380 ms — entrada de tela, modal, toast
  - Curvas: `--ease-out` (padrão), `--ease-spring` (ícones, marca), `--ease-in-out`
  - `prefers-reduced-motion` zera as durações automaticamente.

---

## 6. Layout e navegação

```
┌──────────────────────────────────────────────────────────────┐
│ [marca] │ PRODUÇÃO · Pesquisa         [♪ Música] [▶ YouTube] │  ← header (vidro, 60 px)
├─────────────┬────────────────────────────────────────────────┤
│ PRODUÇÃO    │                                                │
│  Pesquisa   │   conteúdo (max 1360 px, gap 24 px)            │
│  Fila  (n)  │                                                │
│  Projetos   │                                                │
│ PUBLICAÇÃO  │                                                │
│  YouTube    │                                                │
│  Métricas   │                                                │
│ SISTEMA     │                                                │
│  Configur.  │                                                │
└─────────────┴────────────────────────────────────────────────┘
```

- **Sidebar escura** (248 px) com três grupos por *fase do trabalho*:
  - **Produção** — Pesquisa, Fila, Projetos (o Estúdio abre a partir de um projeto).
  - **Publicação** — YouTube, Métricas.
  - **Sistema** — Configurações.
- **Item ativo:** fundo em gradiente suave + barra luminosa à esquerda + texto branco.
- **Contagens** (Fila, Projetos, YouTube) usam `.badge-count`; Fila ativa usa o selo em gradiente.
- **Cabeçalho** mostra `eyebrow` (grupo) + `título` (seção) — atualizado por `syncHeaderPage()` em `app.js`. Ao trocar de aba, o título do documento também muda.
- **Mobile (< 900 px):** a sidebar vira faixa horizontal rolável no topo; grupos e rótulos somem; o contexto do cabeçalho some.

**Regra de ordem:** dentro de cada grupo, ordene do início do fluxo ao fim. Ações destrutivas nunca ficam na navegação.

---

## 7. Componentes

### 7.1 Botões — hierarquia

| Papel | Classe | Quando |
|---|---|---|
| **Primário** | `.btn-primary` (gradiente, brilho no hover) | Uma por contexto. Ex.: "Buscar Vídeos Virais", "Salvar Alterações" |
| **Piloto automático** | `.btn-autopilot` | Ação de automação de pipeline (destaque máximo) |
| **Secundário** | `.btn-secondary` (contorno) | Cancelar, Fechar, ação alternativa |
| **Ação de linha / compacta** | `.btn-action` (altura 32) | Dentro de tabela e cartões |
| **Perigo** | `.btn-danger` | Confirmar exclusão/desconexão — só dentro de diálogo |
| **Fechar** | `.btn-close-modal` | Ícone X no cabeçalho do modal |

Tamanhos: padrão 40 px · `.btn-sm` 30 px · `.btn-action` 32 px. Estados: hover (elevação 1 px), active (escala 0,98), disabled (opacidade 55%).

### 7.2 Campos
- Altura mínima 40 px, raio `--radius-md`, borda `--border-default`.
- Foco: borda `--brand-500` + `--focus-ring`. Nunca remover o foco.
- `select` usa seta customizada (SVG inline) — não usar `<select>` nativo sem essa classe.
- Rótulo sempre acima do campo (`.form-group label`), dica abaixo (`.field-hint`).

### 7.3 Cartões
- `.card` — superfície branca, borda `--border-subtle`, raio 16, sombra `sm`; no hover a borda escurece e a sombra sobe para `md`.
- Cabeçalho: `.card-step-badge` (eyebrow mono em pílula de acento) + `h2` + `.section-desc`.
- Cartões de métricas (`.metrics-kpi`) têm uma **faixa de gradiente** à esquerda — é o único lugar com essa assinatura.

### 7.4 Status e selos
- `.status-pill` — conexões (`.online` / `.offline`), com ponto e texto.
- `.status-dot-indicator` — ponto colorido por status de produção.
- `.custom-status-dropdown` — seletor de status (nunca `<select>` nativo em tabela).
- `.mini-step-pill` — etapas do pipeline: `default` · `.active` · `.done` · `.error`.

### 7.5 Tabelas
- Cabeçalho `--surface-canvas`, texto mono `2xs` maiúsculo, **centralizado** (exceto a coluna de título, à esquerda).
- Linha: hover em `--brand-50`; separador `--border-subtle`.
- Carregamento: `.loading-status` (anel) + `.skeleton-row` (shimmer).

### 7.6 Modais
- Overlay `--surface-overlay` + blur 6 px; entrada `scaleIn` 380 ms.
- Estrutura obrigatória: **`.modal-header`** (marca + título + subtítulo + `.btn-close-modal`) → **`.modal-body`** → (opcional) **`.dialog-footer`** com ações.
- `Esc` e clique no overlay fecham (exceto diálogos de confirmação, que exigem escolha).
- Largura: 480 (confirmação) · 500–600 (formulário) · 780 (logs). Nunca acima de 92% da tela.

### 7.7 Diálogos de confirmação
- `.dialog-modal-card` → `.dialog-body` (ícone `.dialog-icon-wrapper` + `.dialog-text`) → `.dialog-footer` (Cancelar | Confirmar).
- Variantes do ícone: `danger` (exclusão, desconexão) · `warning` · `info` · `success` · `accent`.
- Texto de confirmação diz **a consequência**, não "Tem certeza?". Ex.: "Desconectar canal do YouTube? Você precisará autorizar de novo para publicar."

### 7.8 Toasts (feedback não-bloqueante)
- Pilha no canto inferior direito, máx. 4 visíveis, cada um some em 3,5 s (configurável). Pausa ao passar o mouse; botão de fechar sempre presente.
- Fundo escuro (`--neutral-900`), **faixa colorida à esquerda + ícone do tipo**: ✓ sucesso (verde) · ! erro (vermelho) · ! atenção (âmbar) · i info (azul).
- Uso no código: `showToast(msg)` (tipo inferido), `showToast(msg, 6000)`, `showToast(msg, 'error')`, `showToast(msg, 8000, 'warning')`.
- **Escrever mensagens curtas e concretas:** "Canal conectado" > "Sucesso!". Erros: diga o que falhou e, se possível, o que fazer.
- **Não use toast para:** confirmação de ação destrutiva (use diálogo), dados que o usuário precisa copiar (use `.dialog-copy-input`), erro que bloqueia o fluxo (use bloco de erro na tela — ex.: `.metrics-error`).

### 7.9 Log / terminal
- `.log-container` escuro com cabeçalho e ponto verde "vivo". Usado em piloto automático e fila. Fonte mono `xs`.

### 7.10 Progresso
- `.queue-progress-bar-bg` com gradiente animado (fluxo) enquanto a etapa roda. Parado = sem animação.
- `.steps-progress-bar` mostra o estúdio em 4 etapas; a atual usa o gradiente, as concluídas usam verde.

---

## 8. Estados (checklist para qualquer tela nova)

- [ ] **Vazio** — `.empty-state` com marca, título e próximo passo.
- [ ] **Carregando** — `.loading-status` ou `.skeleton`, nunca tela em branco.
- [ ] **Erro** — `.metrics-error` (inline) ou toast `error`, com ação de recuperação.
- [ ] **Sucesso** — toast curto (≤ 3,5 s) ou atualização visível do próprio item.
- [ ] **Foco de teclado** — `:focus-visible` com `--focus-ring`.
- [ ] **Mobile 375 px** — sem rolagem horizontal da página (só dentro de tabelas).

---

## 9. Acessibilidade

- Contraste mínimo AA: texto `--text-muted` só sobre `--surface-raised`/`--surface-canvas`.
- Botões só com ícone têm `aria-label` ou `title`.
- Toasts usam `role="status"`; erros usam `role="alert"`.
- Movimento reduzido respeitado globalmente.

---

## 10. Como mudar o design

1. **Mudar um valor?** Altere apenas `tokens.css`. Todo o painel acompanha.
2. **Novo componente?** Use tokens existentes. Se faltar um papel semântico, crie-o em `tokens.css` (seção 4–8) antes de usar.
3. **Legado:** a seção *Compatibilidade (legado)* de `tokens.css` mantém nomes antigos (`--color-*`) para o HTML inline. Não use em código novo; ao tocar em um bloco inline, troque por classe + token.
4. **Cache:** ao alterar CSS/JS, incremente `?v=` em `index.html` (`tokens.css`, `style.css`, `app.js`).
5. **Documente aqui** qualquer padrão novo que se repetir em duas telas.

### Checklist de revisão visual
- Light e sidebar escura conferem em 1440 px e 375 px.
- Nenhum hex em `style.css` (conferir com a busca `#[0-9a-fA-F]{3,6}` no arquivo; deve voltar vazia).
- Toasts e modais abrem, fecham com `Esc`/X e não ficam presos.
