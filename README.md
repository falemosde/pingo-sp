<div align="center">
  <img src="./icons/pingo-logo.png" alt="Logo PINGO" width="96" />
  <h1>PINGO</h1>
  <p><strong>Portal Integrado de Necessidades, Guias e Orientações</strong></p>
  <p><em>"Seu ponto de apoio para localizar serviços comunitários em São Paulo."</em></p>

  <p>
    <a href="https://pingo-sp.vercel.app/" target="_blank">
      <img src="https://img.shields.io/badge/Acessar_App_Online-pingo--sp.vercel.app-8A5832?style=for-the-badge&logo=vercel&logoColor=white" alt="Acessar PINGO Online" />
    </a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white" alt="HTML5" />
    <img src="https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white" alt="CSS3" />
    <img src="https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?style=flat&logo=javascript&logoColor=black" alt="JavaScript ES6+" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-CDN-38B2AC?style=flat&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
    <img src="https://img.shields.io/badge/PWA-Instalável-5B7042?style=flat" alt="PWA" />
    <img src="https://img.shields.io/badge/Hospedagem-Vercel-000000?style=flat&logo=vercel&logoColor=white" alt="Vercel" />
  </p>
</div>

---

## Acesso Online

A aplicação está publicada gratuitamente na Vercel e pronta para uso ou instalação na tela inicial do celular (PWA):

- **Link de produção:** [https://pingo-sp.vercel.app/](https://pingo-sp.vercel.app/)

---

## Sobre o Projeto

O **PINGO** é um **MVP (Minimum Viable Product)** desenvolvido para um **Projeto Interdisciplinar** com foco em impacto social e praticidade no dia a dia.

A proposta nasceu de uma necessidade real: facilitar o acesso de pessoas — especialmente moradores de **comunidades mais carentes** — a informações confiáveis sobre serviços públicos e de apoio comunitário, sem burocracia, sem login e sem consumir muitos dados móveis.

Com uma interface _mobile-first_ simples e botões de ação direta (ligar em 1 toque, abrir rota no Google Maps ou compartilhar no WhatsApp com um vizinho ou familiar), o aplicativo organiza os serviços em **3 pilares essenciais**:

1. **Zeladoria e Infraestrutura:** discagem rápida fixa no topo (`156` Prefeitura/Cata-Bagulho e `195` Sabesp/Emergência de Água e Esgoto), além de prefeituras, subprefeituras e ecopontos para descarte regular.
2. **Fome e Apoio Alimentar:** localização de unidades do CRAS (Cadastro Único e assistência social), Restaurantes Populares Bom Prato, cozinhas comunitárias e bancos de alimentos.
3. **Estudos e Oportunidades:** bibliotecas públicas, ETECs/FATECs gratuitas e centros comunitários/culturais.

> **Escopo atual do MVP:** focado no **Estado de São Paulo** (CEPs de `01000-000` a `19999-999`), com cálculo de distância aproximada (fórmula de Haversine) a partir do CEP informado.

---

## Tecnologias Utilizadas

O projeto foi construído de forma propositalmente enxuta — sem frameworks pesados ou etapa de build — para garantir carregamento rápido mesmo em smartphones simples e conexões móveis instáveis:

- **Linguagens:**
  - **HTML5** (marcação semântica e acessível)
  - **CSS3** (animações leves, suporte a _safe-area_ mobile e estilos complementares)
  - **JavaScript (Vanilla JS ES6+)** (manipulação de DOM, consumo assíncrono de APIs, cache local e cálculo geográfico)
- **Interface & Ícones:**
  - **Tailwind CSS** (via CDN)
  - **Lucide Icons** (via CDN)
- **PWA (Progressive Web App):**
  - `manifest.json` + **Service Worker (`sw.js`)** para instalação na tela inicial do celular e suporte offline com fallback local (`dados.json`)
- **APIs Públicas Abertas (sem necessidade de API Key):**
  - **BrasilAPI v2** (com fallback automático para **ViaCEP**) para resolução de CEP, cidade e coordenadas em SP
  - **Overpass API (OpenStreetMap)** em segundo plano (raio de 3 km, `out center 15;`) para enriquecimento complementar de pontos próximos

---

## Estrutura do Projeto

```text
pingo-sp/
├── index.html          # Estrutura mobile-first, cabeçalho com CEP, abas e modal informativo
├── app.js              # Lógica principal, trava estadual SP, Haversine, cache e APIs
├── styles.css          # Estilos complementares, animações e foco acessível
├── dados.json          # Base local de unidades públicas de SP (funciona também offline)
├── manifest.json       # Configuração de instalação PWA
├── sw.js               # Service Worker (cache do App Shell e resiliência offline)
├── vercel.json         # Headers recomendados para PWA e Service Worker na Vercel
└── icons/              # Logo PINGO e ícones PWA (192x192 e 512x512)
```

---

## Como Rodar Localmente

### Pré-requisitos

Basta ter o **Git** instalado e qualquer servidor HTTP estático simples (Node.js, Python ou a extensão Live Server do VS Code).

> **Por que usar um servidor local?** Abrir o `index.html` com duplo clique (`file://`) restringe o `fetch` do `dados.json` e o registro do Service Worker nos navegadores modernos.

### Passo a passo

1. **Clone o repositório:**

   ```bash
   git clone https://github.com/falemosde/pingo-sp.git
   cd pingo-sp
   ```

2. **Suba um servidor estático local** usando uma das opções abaixo:
   - **Com Node.js (`serve`):**
     ```bash
     npx serve .
     ```
   - **Com Python 3:**
     ```bash
     python -m http.server 8000
     ```
   - **Com VS Code (Live Server):**
     Clique com o botão direito em `index.html` e selecione **Open with Live Server**.

3. **Acesse no navegador:** abra o endereço exibido no terminal (ex.: `http://localhost:3000` ou `http://localhost:8000`) e teste digitando qualquer CEP de São Paulo (ex.: `06763-040`, `01001-000`, `14021-578` ou `12509-590`).

---

## Hospedagem Gratuita na Vercel

Este projeto foi arquitetado como uma aplicação 100% estática e está **hospedado gratuitamente na Vercel** em [https://pingo-sp.vercel.app/](https://pingo-sp.vercel.app/), com deploy contínuo integrado ao GitHub e HTTPS automático (requisito obrigatório para instalação como PWA no celular).

Qualquer pessoa pode abrir o link no smartphone (Android ou iOS) e adicionar o **PINGO** diretamente à tela inicial como um aplicativo.

---

## Próximos Passos (Evolução Pós-MVP)

- [ ] Expandir a base curada para mais municípios do interior e litoral de São Paulo.
- [ ] Adicionar formulário comunitário para sugestão e atualização de novos pontos de apoio.
- [ ] Ampliar o escopo geográfico para outros estados brasileiros.
