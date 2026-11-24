/**
 * PINGO — Portal Integrado de Necessidades, Guias e Orientações (PWA Mobile-First)
 * Slogan: "Seu ponto de apoio para localizar serviços comunitários em São Paulo."
 *
 * Arquitetura Rápida e Resiliente (Escopo: Estado de São Paulo - SP):
 *  1. Trava Estadual SP: valida CEP iniciado em 0 ou 1 (01000-000 a 19999-999) + state === "SP" na BrasilAPI v2.
 *  2. Exibição IMEDIATA (~220 ms) da base estadual de SP filtrada por cidade/região e ordenada por distância (Haversine).
 *  3. Enriquecimento rápido e não-bloqueante via Overpass API (around:3000 + out center 15; com timeout curto de 4,5 s).
 */

// ============================================================================
// 1. CONFIGURAÇÃO E CONSTANTES (PINGO — ESTADO DE SÃO PAULO)
// ============================================================================
const CONFIG = {
  APP_NAME: "PINGO",
  STATE_CODE: "SP",
  OUTSIDE_SP_ALERT: "Este MVP atende exclusivamente o Estado de São Paulo.",
  LOCAL_DATA_URL: "./dados.json",
  BRASIL_API_V2_URL: "https://brasilapi.com.br/api/cep/v2/",
  VIACEP_URL: "https://viacep.com.br/ws/",
  OVERPASS_URL: "https://overpass-api.de/api/interpreter",
  OVERPASS_RADIUS_METERS: 3000,
  LOCAL_MATCH_RADIUS_KM: 18,
  CEP_TIMEOUT_MS: 4500,
  OVERPASS_TIMEOUT_MS: 4500, // Curto e não-bloqueante para nunca travar o spinner
  STORAGE_KEY_LOCATION: "pingo_sp_loc_v1",
  STORAGE_KEY_CEP_CACHE_PREFIX: "pingo_sp_cep_v1_",
  STORAGE_KEY_OVERPASS_PREFIX: "pingo_sp_osm_3km_v1_",
  CEP_CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7 dias
  OVERPASS_CACHE_TTL_MS: 24 * 60 * 60 * 1000, // 24 horas
};

const TABS = {
  zeladoria: {
    id: "zeladoria",
    title: "Zeladoria e Infraestrutura",
    subtitle:
      "Discagem rápida, prefeituras/subprefeituras e ecopontos em São Paulo.",
    mapsLabel: "Ver mais Ecopontos e Prefeitura",
    mapsQueryPrefix: "Ecoponto ou Prefeitura",
  },
  fome: {
    id: "fome",
    title: "Fome e Apoio Alimentar",
    subtitle:
      "CRAS, Restaurantes Bom Prato, cozinhas comunitárias e bancos de alimentos em SP.",
    mapsLabel: "Ver CRAS e Bom Prato",
    mapsQueryPrefix: "CRAS ou Bom Prato",
  },
  estudos: {
    id: "estudos",
    title: "Estudos e Oportunidades",
    subtitle:
      "Bibliotecas públicas, ETECs/FATECs e centros comunitários no Estado de São Paulo.",
    mapsLabel: "Ver Bibliotecas e ETECs",
    mapsQueryPrefix: "Biblioteca Pública ou ETEC",
  },
};

// Cards fixos no topo da Aba 1 (Discagem Rápida SP)
const NATIONAL_PINNED_CARDS = [
  {
    id: "nac-156",
    numero: "156",
    nome: "Prefeitura / Cata-Bagulho e Zeladoria",
    descricao:
      "Recolhimento de móveis velhos (Cata-Bagulho), limpeza de bueiros, tapa-buraco, poda de árvores e iluminação pública.",
    tag: "Discagem Rápida",
  },
  {
    id: "nac-195",
    numero: "195",
    nome: "Emergência Água e Esgoto (Sabesp)",
    descricao:
      "Atendimento 24h para vazamentos de água na rua, falta de abastecimento e problemas na rede de esgoto em SP.",
    tag: "Emergência 24h",
  },
];

// Fallback mínimo embutido (caso aberto diretamente via file://)
const EMBEDDED_SP_FALLBACK = [
  {
    id: "sp-zel-taboao-pref",
    categoria: "zeladoria",
    tipo: "Prefeitura / Regional",
    nome: "Prefeitura Municipal de Taboão da Serra",
    descricao:
      "Atendimento presencial para zeladoria urbana e manutenção de vias (atende Jardim Bom Tempo).",
    telefone: "(11) 4788-5300",
    endereco:
      "Praça Miguel Ortega, 439 - Parque Assunção, Taboão da Serra - SP",
    website: "https://ts.sp.gov.br",
    lat: -23.6094,
    lon: -46.7586,
  },
  {
    id: "sp-fome-taboao-cras",
    categoria: "fome",
    tipo: "Assistência Social (CRAS)",
    nome: "CRAS Pirajuçara — Referência Jardim Bom Tempo",
    descricao:
      "Cadastro Único (CadÚnico), cestas básicas emergenciais e assistência social.",
    telefone: "(11) 4137-7640",
    endereco:
      "Estrada Kizaemon Takeuti, 1987 - Jardim Clementino, Taboão da Serra - SP",
    website: "https://ts.sp.gov.br",
    lat: -23.6311,
    lon: -46.7834,
  },
  {
    id: "sp-est-taboao-bib",
    categoria: "estudos",
    tipo: "Biblioteca Pública",
    nome: "Biblioteca Municipal Prof. João Baptista de Andrade",
    descricao: "Acervo público gratuito e salas de estudo no Jardim Bom Tempo.",
    telefone: "(11) 4788-3888",
    endereco: "Rua Emanuelle, 26 - Jardim Bom Tempo, Taboão da Serra - SP",
    website: "https://ts.sp.gov.br",
    lat: -23.6164,
    lon: -46.7705,
  },
];

// ============================================================================
// 2. ESTADO DA APLICAÇÃO
// ============================================================================
const state = {
  activeTab: "zeladoria",
  searchQuery: "",
  localItems: [],
  osmItems: { zeladoria: [], fome: [], estudos: [] },
  location: null, // { cep, street, neighborhood, city, state, lat, lon, source }
  lastCepMs: null,
  deferredInstallPrompt: null,
  cepAbortController: null,
  osmAbortController: null,
};

const dom = {};

// ============================================================================
// 3. UTILITÁRIOS, TRAVA ESTADUAL SP, CACHE E HAVERSINE
// ============================================================================
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Trava Estadual (SP): valida CEP começando com 0 ou 1 (01000-000 a 19999-999)
 */
function isSaoPauloCep(cepDigits) {
  if (!/^\d{8}$/.test(cepDigits)) return false;
  if (cepDigits[0] !== "0" && cepDigits[0] !== "1") return false;
  const num = Number.parseInt(cepDigits, 10);
  return num >= 1000000 && num <= 19999999;
}

function sanitizePhoneForHref(phone) {
  return String(phone ?? "").replace(/(?!^\+)\D/g, "");
}

function sanitizeWebsiteUrl(rawUrl) {
  const trimmed = String(rawUrl ?? "").trim();
  if (!trimmed) return "";
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.href
      : "";
  } catch {
    return "";
  }
}

function formatCepMask(raw) {
  const digits = String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, 8);
  return digits.length > 5
    ? `${digits.slice(0, 5)}-${digits.slice(5)}`
    : digits;
}

function readCache(key, ttlMs) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (
      !entry ||
      typeof entry.ts !== "number" ||
      Date.now() - entry.ts > ttlMs
    ) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // Ignora limite de storage
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(distanceKm) {
  if (!Number.isFinite(distanceKm)) return "";
  if (distanceKm < 1) {
    return `${Math.max(10, Math.round(distanceKm * 1000))} m`;
  }
  return `${distanceKm.toFixed(1).replace(".", ",")} km`;
}

function buildCoordsMapsUrl(lat, lon, fallbackAddress = "") {
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  }
  return fallbackAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackAddress)}`
    : "";
}

function buildWhatsAppShareUrl(item, categoryTitle) {
  const lines = [
    `*${item.nome}*`,
    item.tipo
      ? `Tipo: ${item.tipo}`
      : categoryTitle
        ? `Categoria: ${categoryTitle}`
        : "",
    Number.isFinite(item.distanceKm)
      ? `Distância aproximada: ${formatDistance(item.distanceKm)}`
      : "",
    item.telefone ? `Telefone: ${item.telefone}` : "",
    item.endereco ? `Endereço: ${item.endereco}` : "",
    item.website ? `Site: ${item.website}` : "",
    item.mapsUrl ? `Rota no Google Maps: ${item.mapsUrl}` : "",
    `\nCompartilhado via *${CONFIG.APP_NAME}* — São Paulo`,
  ].filter(Boolean);

  return `https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`;
}

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = CONFIG.CEP_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const externalSignal = options.signal;

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function parseCoords(rawLat, rawLon) {
  const lat = Number.parseFloat(rawLat);
  const lon = Number.parseFloat(rawLon);
  if (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  ) {
    return { lat, lon };
  }
  return null;
}

// ============================================================================
// 4. BASE ESTADUAL DE SÃO PAULO (dados.json)
// ============================================================================
async function loadLocalSpData() {
  try {
    const response = await fetchWithTimeout(
      CONFIG.LOCAL_DATA_URL,
      { cache: "no-cache" },
      3500,
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0)
      throw new Error("dados.json vazio");
    state.localItems = data;
  } catch (error) {
    console.warn("[PINGO] Usando fallback embutido:", error);
    state.localItems = EMBEDDED_SP_FALLBACK;
  }
}

// ============================================================================
// 5. CONSULTA DE CEP (BRASILAPI V2 + TRAVA SP + OVERPASS 3 KM LEVE)
// ============================================================================
async function fetchCepBrasilApiV2(cepDigits, signal) {
  const response = await fetchWithTimeout(
    `${CONFIG.BRASIL_API_V2_URL}${cepDigits}`,
    { signal },
    CONFIG.CEP_TIMEOUT_MS,
  );

  if (response.status === 404) {
    const err = new Error("CEP não encontrado.");
    err.code = "CEP_NOT_FOUND";
    throw err;
  }

  if (!response.ok) {
    throw new Error(`BrasilAPI HTTP ${response.status}`);
  }

  const data = await response.json();
  const coords = parseCoords(
    data?.location?.coordinates?.latitude,
    data?.location?.coordinates?.longitude,
  );

  return {
    cep: cepDigits,
    street: data.street || "",
    neighborhood: data.neighborhood || "",
    city: data.city || "",
    state: (data.state || "").toUpperCase(),
    lat: coords ? coords.lat : null,
    lon: coords ? coords.lon : null,
    source: "BrasilAPI v2",
  };
}

async function fetchCepViaCep(cepDigits, signal) {
  const response = await fetchWithTimeout(
    `${CONFIG.VIACEP_URL}${cepDigits}/json/`,
    { signal },
    CONFIG.CEP_TIMEOUT_MS,
  );

  if (!response.ok) throw new Error(`ViaCEP HTTP ${response.status}`);
  const data = await response.json();
  if (data.erro) {
    const err = new Error("CEP não encontrado.");
    err.code = "CEP_NOT_FOUND";
    throw err;
  }

  return {
    cep: cepDigits,
    street: data.logradouro || "",
    neighborhood: data.bairro || "",
    city: data.localidade || "",
    state: (data.uf || "").toUpperCase(),
    lat: null,
    lon: null,
    source: "ViaCEP",
  };
}

/**
 * Overpass API Otimizada: raio de 3000 metros (around:3000,lat,lon) e out center 15;
 * Roda em segundo plano com timeout curto (4,5s) e NUNCA trava a interface nem o spinner.
 */
function buildOverpassQuery3Km(lat, lon) {
  const r = CONFIG.OVERPASS_RADIUS_METERS;
  const latFixed = lat.toFixed(5);
  const lonFixed = lon.toFixed(5);
  return `[out:json][timeout:4];(nw["amenity"="townhall"]["name"](around:${r},${latFixed},${lonFixed});nw["amenity"="recycling"]["name"](around:${r},${latFixed},${lonFixed});nw["amenity"="social_facility"]["name"](around:${r},${latFixed},${lonFixed});nw["social_facility"="food_bank"]["name"](around:${r},${latFixed},${lonFixed});nw["amenity"="library"]["name"](around:${r},${latFixed},${lonFixed});nw["amenity"="community_centre"]["name"](around:${r},${latFixed},${lonFixed});nw["amenity"="college"]["name"](around:${r},${latFixed},${lonFixed}););out center 15;`;
}

function classifyOverpassElement(tags) {
  const amenity = tags.amenity || "";
  const socialFacility = tags.social_facility || "";

  if (amenity === "townhall")
    return { categoria: "zeladoria", tipo: "Prefeitura / Subprefeitura" };
  if (amenity === "recycling")
    return { categoria: "zeladoria", tipo: "Ecoponto / Descarte" };
  if (socialFacility === "food_bank")
    return { categoria: "fome", tipo: "Banco de Alimentos" };
  if (amenity === "social_facility")
    return { categoria: "fome", tipo: "Assistência Social / CRAS" };
  if (amenity === "library")
    return { categoria: "estudos", tipo: "Biblioteca Pública" };
  if (amenity === "community_centre")
    return { categoria: "estudos", tipo: "Centro Comunitário" };
  if (amenity === "college")
    return { categoria: "estudos", tipo: "Escola Técnica / Capacitação" };
  return null;
}

function processOverpassElements(elements, userLat, userLon, loc) {
  const grouped = { zeladoria: [], fome: [], estudos: [] };
  const seen = { zeladoria: new Set(), fome: new Set(), estudos: new Set() };

  for (const el of elements) {
    const tags = el.tags || {};
    const name = String(tags.name || "").trim();
    if (!name) continue;

    const classification = classifyOverpassElement(tags);
    if (!classification) continue;

    const lat = Number.isFinite(el.lat) ? el.lat : el.center?.lat;
    const lon = Number.isFinite(el.lon) ? el.lon : el.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const key = normalizeText(name);
    if (seen[classification.categoria].has(key)) continue;
    seen[classification.categoria].add(key);

    const streetLine = [tags["addr:street"], tags["addr:housenumber"]]
      .filter(Boolean)
      .join(", ");
    const endereco = [
      streetLine,
      tags["addr:suburb"],
      `${tags["addr:city"] || loc.city} - SP`,
    ]
      .filter(Boolean)
      .join(" • ");

    grouped[classification.categoria].push({
      id: `osm-${el.type}-${el.id}`,
      source: "osm",
      categoria: classification.categoria,
      tipo: classification.tipo,
      nome: name,
      endereco,
      telefone: String(tags.phone || tags["contact:phone"] || "").trim(),
      website: sanitizeWebsiteUrl(
        tags.website || tags["contact:website"] || "",
      ),
      lat,
      lon,
      distanceKm: haversineKm(userLat, userLon, lat, lon),
      mapsUrl: buildCoordsMapsUrl(lat, lon, endereco),
    });
  }

  return grouped;
}

async function enrichSilentlyWithOverpass3Km(loc) {
  if (!Number.isFinite(loc?.lat) || !Number.isFinite(loc?.lon)) return;

  if (state.osmAbortController) {
    state.osmAbortController.abort();
  }
  const controller = new AbortController();
  state.osmAbortController = controller;

  const cacheKey = `${CONFIG.STORAGE_KEY_OVERPASS_PREFIX}${loc.lat.toFixed(3)}_${loc.lon.toFixed(3)}`;
  const cached = readCache(cacheKey, CONFIG.OVERPASS_CACHE_TTL_MS);
  if (cached) {
    state.osmItems = cached;
    updateModeAndDialogUI();
    renderActiveTab();
    return;
  }

  try {
    const response = await fetchWithTimeout(
      CONFIG.OVERPASS_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(buildOverpassQuery3Km(loc.lat, loc.lon))}`,
        signal: controller.signal,
      },
      CONFIG.OVERPASS_TIMEOUT_MS,
    );

    if (!response.ok) return;
    const text = await response.text();
    if (!text.trim().startsWith("{")) return;

    const payload = JSON.parse(text);
    const elements = Array.isArray(payload.elements) ? payload.elements : [];
    const grouped = processOverpassElements(elements, loc.lat, loc.lon, loc);

    if (state.osmAbortController !== controller) return;

    writeCache(cacheKey, grouped);
    state.osmItems = grouped;
    updateModeAndDialogUI();
    renderActiveTab();
  } catch {
    // Falha silenciosa — a tela já está pronta e sem spinner travado
  }
}

async function lookupSpCep(cepDigits) {
  // 1. Trava Estadual (SP) instantânea: CEPs fora de 01000-000 a 19999-999
  if (!isSaoPauloCep(cepDigits)) {
    setCepFeedback(CONFIG.OUTSIDE_SP_ALERT, true);
    return;
  }

  if (state.cepAbortController) state.cepAbortController.abort();
  if (state.osmAbortController) state.osmAbortController.abort();

  const controller = new AbortController();
  state.cepAbortController = controller;

  const cacheKey = `${CONFIG.STORAGE_KEY_CEP_CACHE_PREFIX}${cepDigits}`;
  const cached = readCache(cacheKey, CONFIG.CEP_CACHE_TTL_MS);
  if (cached && cached.state === CONFIG.STATE_CODE) {
    state.location = cached;
    state.osmItems = { zeladoria: [], fome: [], estudos: [] };
    state.lastCepMs = 0;
    saveLocation(cached);
    setCepFeedback("");
    setCepSpinner(false);
    setLoadingChip(false);
    updateLocationHeader();
    updateModeAndDialogUI();
    renderActiveTab();
    enrichSilentlyWithOverpass3Km(cached);
    return;
  }

  const startedAt = performance.now();
  setCepSpinner(true);
  setCepFeedback("");
  setLoadingChip(true, "Consultando CEP em São Paulo...");

  try {
    let loc;
    try {
      loc = await fetchCepBrasilApiV2(cepDigits, controller.signal);
    } catch (primaryErr) {
      if (
        primaryErr.name === "AbortError" ||
        primaryErr.code === "CEP_NOT_FOUND"
      ) {
        throw primaryErr;
      }
      loc = await fetchCepViaCep(cepDigits, controller.signal);
    }

    // 2. Confirmação obrigatória state === "SP" na resposta da API
    if (loc.state !== CONFIG.STATE_CODE) {
      const err = new Error(CONFIG.OUTSIDE_SP_ALERT);
      err.code = "OUTSIDE_SP";
      throw err;
    }

    if (state.cepAbortController !== controller) return;

    writeCache(cacheKey, loc);
    state.location = loc;
    state.osmItems = { zeladoria: [], fome: [], estudos: [] };
    state.lastCepMs = Math.round(performance.now() - startedAt);
    saveLocation(loc);

    updateLocationHeader();
    updateModeAndDialogUI();
    renderActiveTab();

    // Enriquecimento silencioso e rápido (around:3000, out center 15;, max 4,5s, sem spinner travado)
    enrichSilentlyWithOverpass3Km(loc);
  } catch (error) {
    if (error.name === "AbortError") return;

    if (error.code === "CEP_NOT_FOUND") {
      setCepFeedback(
        "CEP não encontrado em São Paulo. Verifique os 8 números.",
        true,
      );
    } else if (error.code === "OUTSIDE_SP") {
      setCepFeedback(CONFIG.OUTSIDE_SP_ALERT, true);
    } else if (!navigator.onLine) {
      setCepFeedback(
        "Sem internet no momento. Exibindo a base local de São Paulo.",
        true,
      );
    } else {
      setCepFeedback(
        "Não foi possível consultar o CEP agora. Tente novamente.",
        true,
      );
    }
  } finally {
    // Garante que o spinner SEMPRE feche imediatamente após a resposta do CEP
    if (state.cepAbortController === controller) {
      setCepSpinner(false);
      setLoadingChip(false);
    }
  }
}

// ============================================================================
// 6. FILTRO POR CIDADE / PROXIMIDADE (BASE SP + EXTRAS OSM 3 KM)
// ============================================================================
function getTabItems(tabId) {
  const userLat = state.location?.lat;
  const userLon = state.location?.lon;
  const hasUserCoords = Number.isFinite(userLat) && Number.isFinite(userLon);
  const cityNorm = normalizeText(state.location?.city || "");

  const localTabItems = state.localItems
    .filter((item) => item.categoria === tabId)
    .map((item) => {
      const distanceKm =
        hasUserCoords && Number.isFinite(item.lat) && Number.isFinite(item.lon)
          ? haversineKm(userLat, userLon, item.lat, item.lon)
          : undefined;
      return {
        ...item,
        source: "sp",
        distanceKm,
        mapsUrl: buildCoordsMapsUrl(item.lat, item.lon, item.endereco),
      };
    });

  const osmTabItems = (state.osmItems[tabId] || []).map((item) => {
    const distanceKm =
      hasUserCoords && Number.isFinite(item.lat) && Number.isFinite(item.lon)
        ? haversineKm(userLat, userLon, item.lat, item.lon)
        : item.distanceKm;
    return { ...item, source: "osm", distanceKm };
  });

  const dedupeMap = new Map();
  for (const item of [...osmTabItems, ...localTabItems]) {
    const key = normalizeText(item.nome);
    if (!dedupeMap.has(key)) {
      dedupeMap.set(key, item);
    }
  }

  const combined = Array.from(dedupeMap.values());

  if (state.location) {
    const matched = combined.filter((item) => {
      if (item.source === "osm") return true;
      const sameCity =
        cityNorm &&
        normalizeText(`${item.nome} ${item.endereco}`).includes(cityNorm);
      const withinRadius =
        Number.isFinite(item.distanceKm) &&
        item.distanceKm <= CONFIG.LOCAL_MATCH_RADIUS_KM;
      return sameCity || withinRadius;
    });

    matched.sort((a, b) => {
      const da = Number.isFinite(a.distanceKm) ? a.distanceKm : 99999;
      const db = Number.isFinite(b.distanceKm) ? b.distanceKm : 99999;
      return da - db;
    });

    return matched;
  }

  // Estado inicial antes do CEP: destaques iniciais (Jardim Bom Tempo / Grande SP)
  return combined.slice(0, 6);
}

// ============================================================================
// 7. PERSISTÊNCIA E CONTROLES DE UI
// ============================================================================
function saveLocation(loc) {
  try {
    if (loc) {
      localStorage.setItem(CONFIG.STORAGE_KEY_LOCATION, JSON.stringify(loc));
    } else {
      localStorage.removeItem(CONFIG.STORAGE_KEY_LOCATION);
    }
  } catch {
    // Ignora storage indisponível
  }
}

function restoreSavedLocation() {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY_LOCATION);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      isSaoPauloCep(parsed.cep) &&
      parsed.state === CONFIG.STATE_CODE &&
      parsed.city
    ) {
      state.location = parsed;
      dom.cepInput.value = formatCepMask(parsed.cep);
      dom.btnClearCep.classList.remove("hidden");
      updateLocationHeader();
      updateModeAndDialogUI();
      renderActiveTab();
      enrichSilentlyWithOverpass3Km(parsed);
    }
  } catch {
    // Ignora JSON inválido
  }
}

function clearCep() {
  if (state.cepAbortController) {
    state.cepAbortController.abort();
    state.cepAbortController = null;
  }
  if (state.osmAbortController) {
    state.osmAbortController.abort();
    state.osmAbortController = null;
  }

  dom.cepInput.value = "";
  state.location = null;
  state.osmItems = { zeladoria: [], fome: [], estudos: [] };
  state.lastCepMs = null;
  saveLocation(null);

  setCepSpinner(false);
  setLoadingChip(false);
  setCepFeedback("");
  dom.btnClearCep.classList.add("hidden");
  updateLocationHeader();
  updateModeAndDialogUI();
  renderActiveTab();
  dom.cepInput.focus();
}

function setCepFeedback(message, isError = false) {
  if (!message) {
    dom.cepFeedback.textContent = "";
    dom.cepFeedback.classList.add("hidden");
    return;
  }
  dom.cepFeedback.textContent = message;
  dom.cepFeedback.classList.remove("hidden");
  dom.cepFeedback.className = isError
    ? "text-[11px] font-semibold leading-snug text-amber-100 bg-black/25 border border-white/25 rounded-lg px-2.5 py-1.5"
    : "text-[11px] font-medium leading-snug text-amber-50";
}

function setCepSpinner(isLoading) {
  dom.cepSpinner.classList.toggle("hidden", !isLoading);
  const hasValue = dom.cepInput.value.trim().length > 0;
  dom.btnClearCep.classList.toggle("hidden", isLoading || !hasValue);
}

function setLoadingChip(isVisible, text = "") {
  dom.cascadeLoading.classList.toggle("hidden", !isVisible);
  dom.cascadeLoading.classList.toggle("flex", isVisible);
  if (text) {
    dom.cascadeLoadingStep.textContent = text;
  }
}

function updateLocationHeader() {
  if (!state.location) {
    dom.locationDisplay.textContent = "São Paulo (SP) • Digite seu CEP";
    return;
  }
  const { neighborhood, city } = state.location;
  const parts = [];
  if (neighborhood) parts.push(neighborhood);
  if (city) parts.push(`${city} - SP`);
  dom.locationDisplay.textContent = parts.join(" • ") || "São Paulo - SP";
}

function updateNetworkStatusUI() {
  const isOnline = navigator.onLine;
  dom.offlineBanner.classList.toggle("hidden", isOnline);
  dom.offlineBanner.classList.toggle("flex", !isOnline);
  dom.dialogNetworkStatus.textContent = isOnline
    ? "Conexão detectada: Online"
    : "Conexão detectada: Offline";
}

function updateModeAndDialogUI() {
  const osmTotal =
    state.osmItems.zeladoria.length +
    state.osmItems.fome.length +
    state.osmItems.estudos.length;

  if (state.location) {
    dom.modeBadge.className =
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 shrink-0";
    dom.modeBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-700"></span><span>${escapeHtml(state.location.city)} - SP</span>`;

    const speedLabel =
      typeof state.lastCepMs === "number"
        ? state.lastCepMs === 0
          ? " (cache instantâneo)"
          : ` (${state.lastCepMs} ms via ${state.location.source})`
        : "";
    dom.dialogDataStatus.textContent = `CEP localizado em ${state.location.city} - SP${speedLabel}.${
      osmTotal > 0 ? ` +${osmTotal} locais extras via Overpass (3 km).` : ""
    }`;
    dom.dialogCoordsStatus.textContent =
      Number.isFinite(state.location.lat) && Number.isFinite(state.location.lon)
        ? `Coordenadas: ${state.location.lat.toFixed(5)}, ${state.location.lon.toFixed(5)}`
        : "";
  } else {
    dom.modeBadge.className =
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 shrink-0";
    dom.modeBadge.innerHTML =
      '<span class="w-1.5 h-1.5 rounded-full bg-amber-700"></span><span>Base SP</span>';

    dom.dialogDataStatus.textContent =
      "Digite qualquer CEP do Estado de São Paulo (01000-000 a 19999-999) para localizar serviços da sua cidade.";
    dom.dialogCoordsStatus.textContent = "";
  }

  updateNetworkStatusUI();
}

// ============================================================================
// 8. RENDERIZAÇÃO DOS CARDS (PALETA PINGO: CAFÉ, CARAMELO E ESMERALDA)
// ============================================================================
function renderNationalPinnedCards() {
  dom.nationalPinnedList.innerHTML = NATIONAL_PINNED_CARDS.map((card) => {
    const whatsappUrl = buildWhatsAppShareUrl(
      {
        nome: `${card.numero} — ${card.nome}`,
        tipo: card.tag,
        telefone: card.numero,
        endereco: "Atendimento telefônico no Estado de São Paulo",
      },
      "Zeladoria e Infraestrutura",
    );

    return `
      <article class="bg-[#8A5832] text-white rounded-2xl p-3.5 shadow-sm border border-[#754929] space-y-2.5">
        <div class="flex items-start justify-between gap-2">
          <div class="space-y-0.5">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/15 text-amber-100 border border-white/20">
              ${escapeHtml(card.tag)}
            </span>
            <h4 class="text-sm font-bold leading-snug text-white">
              ${escapeHtml(card.numero)} — ${escapeHtml(card.nome)}
            </h4>
          </div>
          <span class="text-xl font-extrabold tracking-tight text-amber-200 shrink-0">${escapeHtml(card.numero)}</span>
        </div>

        <p class="text-xs text-amber-50/90 leading-relaxed">${escapeHtml(card.descricao)}</p>

        <div class="grid grid-cols-2 gap-2 pt-0.5">
          <a
            href="tel:${escapeHtml(card.numero)}"
            class="flex items-center justify-center gap-1.5 min-h-[42px] px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 text-[#465931] hover:bg-white active:scale-[0.98] transition shadow-sm"
            aria-label="Ligar agora para ${escapeHtml(card.numero)} - ${escapeHtml(card.nome)}"
          >
            <i data-lucide="phone" class="w-4 h-4 text-[#5B7042] shrink-0" aria-hidden="true"></i>
            <span>Ligar ${escapeHtml(card.numero)}</span>
          </a>
          <a
            href="${escapeHtml(whatsappUrl)}"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center justify-center gap-1.5 min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold bg-black/15 text-white border border-white/25 hover:bg-black/25 active:scale-[0.98] transition"
            aria-label="Compartilhar telefone ${escapeHtml(card.numero)} no WhatsApp"
          >
            <i data-lucide="share-2" class="w-4 h-4 text-amber-100 shrink-0" aria-hidden="true"></i>
            <span>WhatsApp</span>
          </a>
        </div>
      </article>
    `;
  }).join("");
}

function createUnitCardHtml(item, tabConfig, index) {
  const cleanTel = sanitizePhoneForHref(item.telefone);
  const mapsUrl =
    item.mapsUrl || buildCoordsMapsUrl(item.lat, item.lon, item.endereco);
  const websiteUrl = sanitizeWebsiteUrl(item.website);
  const whatsappUrl = buildWhatsAppShareUrl(
    { ...item, mapsUrl, website: websiteUrl },
    tabConfig.title,
  );
  const distanceLabel = formatDistance(item.distanceKm);
  const tipoLabel = item.source === "osm" ? `${item.tipo} • OSM` : item.tipo;

  const badgesHtml = `
    <div class="flex items-center justify-between gap-2 flex-wrap">
      ${tipoLabel ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">${escapeHtml(tipoLabel)}</span>` : "<span></span>"}
      ${
        distanceLabel
          ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-stone-100 text-stone-700">
               <i data-lucide="map-pin" class="w-3 h-3 text-amber-700" aria-hidden="true"></i>
               <span>${escapeHtml(distanceLabel)}</span>
             </span>`
          : ""
      }
    </div>
  `;

  const enderecoHtml = item.endereco
    ? `<p class="flex items-start gap-2 text-xs text-stone-600">
         <i data-lucide="map-pin" class="w-3.5 h-3.5 text-amber-700 mt-0.5 shrink-0" aria-hidden="true"></i>
         <span>${escapeHtml(item.endereco)}</span>
       </p>`
    : "";

  // Botão de ação direta: Ligar Agora (Verde-Oliva quente #5B7042, harmônico com #8A5832)
  const callBtnHtml = cleanTel
    ? `<a
         href="tel:${escapeHtml(cleanTel)}"
         class="flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold bg-[#5B7042] hover:bg-[#4A5C35] text-white shadow-sm active:scale-[0.98] transition"
         aria-label="Ligar agora para ${escapeHtml(item.nome)} no número ${escapeHtml(item.telefone)}"
       >
         <i data-lucide="phone" class="w-4 h-4 shrink-0" aria-hidden="true"></i>
         <span class="truncate">Ligar Agora • ${escapeHtml(item.telefone)}</span>
       </a>`
    : "";

  // Botão primário Caramelo PINGO: Rota no Google Maps (#8A5832)
  const mapsBtnHtml = mapsUrl
    ? `<a
         href="${escapeHtml(mapsUrl)}"
         target="_blank"
         rel="noopener noreferrer"
         class="flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold bg-[#8A5832] text-white hover:bg-[#754929] active:scale-[0.98] transition shadow-sm"
         aria-label="Traçar rota até ${escapeHtml(item.nome)} no Google Maps"
       >
         <i data-lucide="map" class="w-4 h-4 shrink-0" aria-hidden="true"></i>
         <span>Rota Maps</span>
       </a>`
    : "";

  const websiteBtnHtml = websiteUrl
    ? `<a
         href="${escapeHtml(websiteUrl)}"
         target="_blank"
         rel="noopener noreferrer"
         class="flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold bg-stone-100 text-stone-700 border border-stone-200 hover:bg-stone-200/80 active:scale-[0.98] transition"
         aria-label="Abrir site oficial de ${escapeHtml(item.nome)}"
       >
         <i data-lucide="globe" class="w-4 h-4 text-[#8A5832] shrink-0" aria-hidden="true"></i>
         <span>Site</span>
       </a>`
    : "";

  // Botão de ação direta: WhatsApp (Verde-Oliva suave #F3F6EE / #465931)
  const whatsappBtnHtml = `<a
      href="${escapeHtml(whatsappUrl)}"
      target="_blank"
      rel="noopener noreferrer"
      class="flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold bg-[#F3F6EE] text-[#465931] border border-[#D4DEC6] hover:bg-[#E7EEDB] active:scale-[0.98] transition"
      aria-label="Compartilhar ${escapeHtml(item.nome)} no WhatsApp"
    >
      <i data-lucide="share-2" class="w-4 h-4 text-[#5B7042] shrink-0" aria-hidden="true"></i>
      <span>WhatsApp</span>
    </a>`;

  const secondaryBtns = [mapsBtnHtml, websiteBtnHtml, whatsappBtnHtml].filter(
    Boolean,
  );
  const gridColsClass =
    secondaryBtns.length === 3
      ? "grid-cols-3"
      : secondaryBtns.length === 2
        ? "grid-cols-2"
        : "grid-cols-1";

  return `
    <article
      class="animate-card bg-white rounded-2xl p-4 border border-stone-200 shadow-sm space-y-3"
      style="animation-delay: ${Math.min(index * 20, 120)}ms"
    >
      <div class="space-y-1.5">
        ${badgesHtml}
        <h4 class="text-sm font-bold text-stone-900 leading-snug">${escapeHtml(item.nome)}</h4>
        ${item.descricao ? `<p class="text-xs text-stone-600 leading-relaxed">${escapeHtml(item.descricao)}</p>` : ""}
      </div>

      ${enderecoHtml ? `<div class="space-y-1.5 pt-1 border-t border-stone-100">${enderecoHtml}</div>` : ""}

      <div class="space-y-2 pt-1">
        ${callBtnHtml}
        <div class="grid ${gridColsClass} gap-2">
          ${secondaryBtns.join("")}
        </div>
      </div>
    </article>
  `;
}

function createCityMapsShortcutHtml(tabConfig) {
  if (!state.location) return "";
  const cityLabel = `${state.location.city} - SP`;
  const neighborhoodHint = state.location.neighborhood
    ? ` perto de ${state.location.neighborhood}, `
    : " em ";
  const mapsQuery = `${tabConfig.mapsQueryPrefix}${neighborhoodHint}${cityLabel}`;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`;

  return `
    <div class="bg-white rounded-2xl p-4 border border-dashed border-amber-300 text-center space-y-2.5 shadow-sm">
      <p class="text-xs text-stone-600 leading-relaxed">
        Precisa ver outras unidades em <strong>${escapeHtml(cityLabel)}</strong> no mapa?
      </p>
      <a
        href="${escapeHtml(mapsUrl)}"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#8A5832] text-white text-xs font-semibold hover:bg-[#754929] active:scale-[0.98] transition shadow-sm"
      >
        <i data-lucide="map-pinned" class="w-4 h-4 text-amber-100" aria-hidden="true"></i>
        <span>${escapeHtml(tabConfig.mapsLabel)} em ${escapeHtml(state.location.city)}</span>
      </a>
    </div>
  `;
}

function renderActiveTab() {
  const tabConfig = TABS[state.activeTab] || TABS.zeladoria;

  dom.tabTitle.textContent = tabConfig.title;
  dom.tabSubtitle.textContent = tabConfig.subtitle;

  // Aba ativa em caramelo PINGO (#8A5832)
  dom.tabButtons.forEach((btn) => {
    const tabId = btn.dataset.tab;
    const isActive = tabId === state.activeTab;
    btn.setAttribute("aria-selected", String(isActive));
    btn.className = `tab-btn flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-2xl text-[11px] font-semibold leading-tight text-center transition ${
      isActive
        ? "bg-[#8A5832] text-white shadow-sm"
        : "text-stone-500 hover:text-[#8A5832] hover:bg-amber-50/70"
    }`;
  });

  dom.nationalPinnedSection.classList.toggle(
    "hidden",
    state.activeTab !== "zeladoria",
  );

  const items = getTabItems(state.activeTab);
  const query = normalizeText(state.searchQuery);
  const filtered = items.filter((item) => {
    if (!query) return true;
    const haystack = normalizeText(
      `${item.nome} ${item.tipo} ${item.descricao || ""} ${item.endereco || ""} ${item.telefone || ""}`,
    );
    return haystack.includes(query);
  });

  dom.listSectionHeading.textContent = state.location
    ? `Unidades em ${state.location.city} - SP`
    : "Unidades em São Paulo (Ex.: Jardim Bom Tempo)";
  dom.listCount.textContent = `${filtered.length} ${filtered.length === 1 ? "unidade" : "unidades"}`;

  if (filtered.length === 0) {
    const cityLabel = state.location
      ? `${state.location.city} - SP`
      : "São Paulo - SP";
    const mapsQuery = `${tabConfig.mapsQueryPrefix} em ${cityLabel}`;
    const mapsFallbackUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`;

    dom.servicesList.innerHTML = `
      <div class="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm text-center space-y-3">
        <div class="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
          <i data-lucide="map-pin" class="w-5 h-5" aria-hidden="true"></i>
        </div>
        <p class="text-sm font-semibold text-stone-900">
          ${
            query
              ? "Nenhuma unidade corresponde ao filtro"
              : `Ainda não há unidade cadastrada em ${escapeHtml(cityLabel)}`
          }
        </p>
        <p class="text-xs text-stone-500 leading-relaxed">
          ${
            query
              ? "Limpe o filtro para ver todas as unidades da sua cidade."
              : "Abra a busca direta no Google Maps para localizar unidades disponíveis na sua cidade."
          }
        </p>
        ${
          !query && state.location
            ? `<a
                 href="${escapeHtml(mapsFallbackUrl)}"
                 target="_blank"
                 rel="noopener noreferrer"
                 class="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800 transition"
               >
                 <i data-lucide="map-pinned" class="w-4 h-4" aria-hidden="true"></i>
                 <span>${escapeHtml(tabConfig.mapsLabel)} em ${escapeHtml(state.location.city)}</span>
               </a>`
            : ""
        }
      </div>
    `;
  } else {
    dom.servicesList.innerHTML =
      filtered
        .map((item, index) => createUnitCardHtml(item, tabConfig, index))
        .join("") + (query ? "" : createCityMapsShortcutHtml(tabConfig));
  }

  refreshIcons();
}

// ============================================================================
// 9. PWA — SERVICE WORKER & INSTALAÇÃO
// ============================================================================
function setupPwa() {
  if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    dom.btnInstallPwa.classList.remove("hidden");
    dom.btnInstallPwa.classList.add("inline-flex");
  });

  window.addEventListener("appinstalled", () => {
    state.deferredInstallPrompt = null;
    dom.btnInstallPwa.classList.add("hidden");
    dom.btnInstallPwa.classList.remove("inline-flex");
  });

  dom.btnInstallPwa.addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    dom.btnInstallPwa.classList.add("hidden");
    dom.btnInstallPwa.classList.remove("inline-flex");
  });
}

// ============================================================================
// 10. INICIALIZAÇÃO E EVENTOS
// ============================================================================
function cacheDom() {
  dom.locationDisplay = document.getElementById("location-display");
  dom.cepInput = document.getElementById("cep-input");
  dom.cepSpinner = document.getElementById("cep-spinner");
  dom.cepFeedback = document.getElementById("cep-feedback");
  dom.btnClearCep = document.getElementById("btn-clear-cep");
  dom.offlineBanner = document.getElementById("offline-banner");
  dom.cascadeLoading = document.getElementById("cascade-loading");
  dom.cascadeLoadingStep = document.getElementById("cascade-loading-step");
  dom.tabTitle = document.getElementById("tab-title");
  dom.tabSubtitle = document.getElementById("tab-subtitle");
  dom.modeBadge = document.getElementById("mode-badge");
  dom.searchInput = document.getElementById("search-input");
  dom.btnClearSearch = document.getElementById("btn-clear-search");
  dom.nationalPinnedSection = document.getElementById(
    "national-pinned-section",
  );
  dom.nationalPinnedList = document.getElementById("national-pinned-list");
  dom.listSectionHeading = document.getElementById("list-section-heading");
  dom.listCount = document.getElementById("list-count");
  dom.servicesList = document.getElementById("services-list");
  dom.tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
  dom.btnInstallPwa = document.getElementById("btn-install-pwa");
  dom.btnInfo = document.getElementById("btn-info");
  dom.infoDialog = document.getElementById("info-dialog");
  dom.btnCloseDialog = document.getElementById("btn-close-dialog");
  dom.btnOkDialog = document.getElementById("btn-ok-dialog");
  dom.dialogDataStatus = document.getElementById("dialog-data-status");
  dom.dialogCoordsStatus = document.getElementById("dialog-coords-status");
  dom.dialogNetworkStatus = document.getElementById("dialog-network-status");
}

function bindEvents() {
  dom.tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextTab = btn.dataset.tab;
      if (!nextTab || nextTab === state.activeTab) return;
      state.activeTab = nextTab;
      renderActiveTab();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  dom.cepInput.addEventListener("input", (event) => {
    const masked = formatCepMask(event.target.value);
    event.target.value = masked;

    const digits = masked.replace(/\D/g, "");
    dom.btnClearCep.classList.toggle("hidden", digits.length === 0);

    if (digits.length < 8) {
      setCepFeedback("");
      return;
    }

    if (state.location?.cep === digits) {
      return;
    }

    lookupSpCep(digits);
  });

  dom.btnClearCep.addEventListener("click", clearCep);

  dom.searchInput.addEventListener("input", (event) => {
    state.searchQuery = event.target.value;
    dom.btnClearSearch.classList.toggle(
      "hidden",
      state.searchQuery.length === 0,
    );
    renderActiveTab();
  });

  dom.btnClearSearch.addEventListener("click", () => {
    state.searchQuery = "";
    dom.searchInput.value = "";
    dom.btnClearSearch.classList.add("hidden");
    renderActiveTab();
    dom.searchInput.focus();
  });

  dom.btnInfo.addEventListener("click", () => {
    updateModeAndDialogUI();
    dom.infoDialog.showModal();
  });

  const closeDialog = () => dom.infoDialog.close();
  dom.btnCloseDialog.addEventListener("click", closeDialog);
  dom.btnOkDialog.addEventListener("click", closeDialog);
  dom.infoDialog.addEventListener("click", (event) => {
    if (event.target === dom.infoDialog) closeDialog();
  });

  window.addEventListener("online", updateNetworkStatusUI);
  window.addEventListener("offline", updateNetworkStatusUI);
}

async function init() {
  cacheDom();
  bindEvents();
  setupPwa();
  renderNationalPinnedCards();

  await loadLocalSpData();
  updateModeAndDialogUI();
  renderActiveTab();

  restoreSavedLocation();
  refreshIcons();
}

document.addEventListener("DOMContentLoaded", init);
