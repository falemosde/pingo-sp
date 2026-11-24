# PINGO — Portal Integrado de Necessidades, Guias e Orientações

> _"Seu ponto de apoio para localizar serviços comunitários em São Paulo."_

Progressive Web App (**PWA**) mobile-first em **HTML5, Vanilla JavaScript (ES6+), Tailwind CSS (CDN) e Lucide Icons (CDN)** com identidade visual inspirada no mascote pinscher caramelo (**PINGO**), focado exclusivamente no **Estado de São Paulo (`01000-000` a `19999-999`)**.

## Identidade Visual e Paleta

- **Cabeçalho e Destaques Escuros:** Marrom café profundo (`bg-amber-950` / `text-amber-50`) com emblema minimalista de pin com orelhinhas pontudas.
- **Fundo Principal:** Tons quentes suaves (`bg-stone-50` + `bg-amber-50/40`).
- **Cor Primária:** Caramelo / Canela (`bg-amber-700`, `hover:bg-amber-800`, `text-amber-700`, `border-amber-200`).
- **Ação Direta (Ligar Agora / WhatsApp):** Verde esmeralda (`bg-emerald-700`, `hover:bg-emerald-800`).
- **Cards de Serviço:** Fundo branco (`bg-white`), borda sutil quente (`border-stone-200`) e sombra leve (`shadow-sm`).

## Arquitetura e Escopo Regional (SP)

1. **Trava Estadual (SP):** valida CEPs iniciados em `0` ou `1` (`01000-000` a `19999-999`) e confirma `state === "SP"` na BrasilAPI v2; para outros estados exibe _"Este MVP atende exclusivamente o Estado de São Paulo."_
2. **Resposta Imediata (~220 ms):** exibe imediatamente as unidades reais da cidade/região de SP ordenadas por distância (**Haversine**) a partir de `dados.json`.
3. **Overpass API Otimizada (em segundo plano):** busca em raio de `3000` metros (`around:3000,lat,lon`) com limite `out center 15;` e timeout curto (4,5 s), enriquecendo sem bloquear a tela nem travar o indicador de carregamento.

## Como Executar e Publicar na Vercel

- **Local:** execute `npx serve .` em `c:\NextJS\apoio-cidadao-pwa` (ou use o **Live Server**).
- **Vercel:** deploy estático direto da pasta `apoio-cidadao-pwa` (Framework Preset: **Other**, Build Command vazio).
