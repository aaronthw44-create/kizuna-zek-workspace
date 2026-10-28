export interface WikiVisualMatch {
  query: string;
  title: string;
  description: string;
  extract: string;
  thumbnailUrl: string;
  originalImageUrl: string;
  pageUrl: string;
  domainLabel: string;
  lang: 'es' | 'en';
}

// Global in-memory + sessionStorage cache so each term is fetched at most once per session
const wikiCache = new Map<string, WikiVisualMatch | null>();
const inflightRequests = new Map<string, Promise<WikiVisualMatch | null>>();
const SESSION_CACHE_PREFIX = 'kizuna_wiki_summary_v1:';
const WIKI_HEADERS: HeadersInit = {
  Accept: 'application/json',
  'Api-User-Agent': 'KizunaZekApp/1.0 (creative-studio)',
};

function readSessionCache(key: string): { hit: boolean; value: WikiVisualMatch | null } {
  if (wikiCache.has(key)) {
    return { hit: true, value: wikiCache.get(key) ?? null };
  }
  try {
    const raw = sessionStorage.getItem(`${SESSION_CACHE_PREFIX}${key}`);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as WikiVisualMatch | null;
      wikiCache.set(key, parsed);
      return { hit: true, value: parsed };
    }
  } catch {
    // Ignore sessionStorage quota or private-mode errors
  }
  return { hit: false, value: null };
}

function writeSessionCache(key: string, value: WikiVisualMatch | null): void {
  wikiCache.set(key, value);
  try {
    sessionStorage.setItem(`${SESSION_CACHE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Ignore sessionStorage quota errors
  }
}

// Headings that are structural/conversational/creative-writing markers and should NEVER query Wikipedia
const GENERIC_HEADING_STOPWORDS = new Set([
  'introduccion',
  'conclusion',
  'resumen',
  'sintesis',
  'analisis',
  'contexto',
  'ejemplo',
  'ejemplos',
  'nota',
  'notas',
  'advertencia',
  'importante',
  'paso',
  'pasos',
  'etapa',
  'fase',
  'escena',
  'capitulo',
  'acto',
  'parte',
  'seccion',
  'opcion',
  'alternativa',
  'ventajas',
  'desventajas',
  'pros',
  'contras',
  'caracteristicas',
  'detalles',
  'explicacion',
  'respuesta',
  'pregunta',
  'preguntas',
  'solucion',
  'codigo',
  'implementacion',
  'resultado',
  'resultados',
  'comparacion',
  'diferencias',
  'similitudes',
  'recomendacion',
  'recomendaciones',
  'consejos',
  'tips',
  'fuentes',
  'referencias',
  'bibliografia',
  'veredicto',
  'diagnostico',
  'objetivo',
  'objetivos',
  'estructura',
  'formato',
  'reglas',
  'instrucciones',
  'prompt',
  'personaje',
  'personajes',
  'dialogo',
  'narrativa',
  'borrador',
  'correccion',
  'continuacion',
  'epilogo',
  'prologo',
]);

const TOKEN_STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en',
  'con', 'por', 'para', 'sin', 'sobre', 'entre', 'hacia', 'hasta', 'desde', 'como',
  'que', 'quien', 'cual', 'cuando', 'donde', 'como', 'fue', 'fueron', 'era', 'son',
  'es', 'su', 'sus', 'mi', 'tu', 'se', 'lo', 'le', 'les', 'y', 'o', 'u', 'e', 'ni',
  'no', 'si', 'mas', 'pero', 'the', 'of', 'in', 'and', 'to', 'for', 'on', 'with',
]);

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts a clean encyclopedic search query from a Markdown heading if and only if
 * it looks like a concrete historical event, place, person, work, or scientific concept.
 */
export function extractCandidateQueryFromHeading(rawHeading: string): string | null {
  if (!rawHeading || typeof rawHeading !== 'string') return null;

  // Strip leading numbering like "1.", "2)", "II.", "Paso 1:", emojis, or markdown markers
  let cleaned = rawHeading
    .replace(/^[\dIVXLCDM]+[\.\)\-:]\s*/i, '')
    .replace(/^[^\wÁÉÍÓÚáéíóúÑñ¿¡]+/, '')
    .replace(/[*_`~#]/g, '')
    .trim();

  if (!cleaned || cleaned.length < 4 || cleaned.length > 85) return null;

  // Reject conversational questions like "¿Cómo terminó su gobierno?" or "¿Qué pasó después?"
  if (cleaned.startsWith('¿') || cleaned.endsWith('?')) {
    return null;
  }

  // Strip parenthetical years or short notes at the end for cleaner search, e.g. "La Noche de los Bastones Largos (1966)" -> "La Noche de los Bastones Largos"
  // Keep the year if the heading itself is mostly a year/event
  const withoutParens = cleaned.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const candidate = withoutParens.length >= 4 ? withoutParens : cleaned;

  // Split after colon if prefix is a generic label (e.g., "Evento 1: El Cordobazo")
  let finalQuery = candidate;
  if (candidate.includes(':')) {
    const [left, right] = candidate.split(':', 2).map((s) => s.trim());
    const normLeft = normalizeText(left).split(' ')[0];
    if (GENERIC_HEADING_STOPWORDS.has(normLeft) && right && right.length >= 4) {
      finalQuery = right;
    } else if (left && left.length >= 4 && left.length <= 45) {
      finalQuery = left;
    }
  }

  const norm = normalizeText(finalQuery);
  if (!norm) return null;

  const words = norm.split(' ').filter(Boolean);
  if (words.length === 0 || words.length > 8) return null;

  // If the first word or only significant word is a generic structural heading, skip
  if (GENERIC_HEADING_STOPWORDS.has(words[0])) return null;
  const meaningfulWords = words.filter((w) => !TOKEN_STOPWORDS.has(w) && w.length > 2);
  if (meaningfulWords.length === 0) return null;
  if (meaningfulWords.every((w) => GENERIC_HEADING_STOPWORDS.has(w))) return null;

  return finalQuery;
}

/**
 * Checks that the returned Wikipedia article title is genuinely about the heading query
 * so we never display an unrelated photo.
 */
function isRelevantWikiMatch(query: string, wikiTitle: string, wikiExtract: string): boolean {
  const qNorm = normalizeText(query);
  const tNorm = normalizeText(wikiTitle);
  if (!qNorm || !tNorm) return false;

  // Direct substring match (e.g. "El Cordobazo" <-> "Cordobazo")
  if (tNorm.includes(qNorm) || qNorm.includes(tNorm)) {
    return true;
  }

  const qTokens = qNorm.split(' ').filter((w) => !TOKEN_STOPWORDS.has(w) && w.length > 2);
  const tTokens = new Set(tNorm.split(' ').filter((w) => !TOKEN_STOPWORDS.has(w) && w.length > 2));
  if (qTokens.length === 0) return false;

  let overlap = 0;
  for (const token of qTokens) {
    if (tTokens.has(token) || Array.from(tTokens).some((tw) => tw.startsWith(token) || token.startsWith(tw))) {
      overlap++;
    }
  }

  const ratio = overlap / qTokens.length;
  if (ratio >= 0.6) return true;

  // Also check if the exact query appears in the first sentence of the extract
  const firstSentence = normalizeText((wikiExtract || '').slice(0, 220));
  if (qNorm.length >= 6 && firstSentence.includes(qNorm)) {
    return true;
  }

  return false;
}

function parseSummaryPayload(
  query: string,
  summary: any,
  fallbackTitle: string,
  lang: 'es' | 'en'
): WikiVisualMatch | null {
  if (!summary || summary.type === 'disambiguation') return null;

  const thumbUrl: string = summary.thumbnail?.source || '';
  if (!thumbUrl) return null;

  // Filter out generic Wikimedia placeholder icons, flags, or tiny icons
  const lowerThumb = thumbUrl.toLowerCase();
  if (
    lowerThumb.includes('disambig') ||
    lowerThumb.includes('question_book') ||
    lowerThumb.includes('ambox') ||
    lowerThumb.includes('commons-logo') ||
    lowerThumb.includes('wikidata-logo') ||
    (summary.thumbnail?.width && summary.thumbnail.width < 60)
  ) {
    return null;
  }

  const resolvedTitle = summary.title || fallbackTitle;
  if (!isRelevantWikiMatch(query, resolvedTitle, summary.extract || '')) {
    return null;
  }

  return {
    query,
    title: resolvedTitle,
    description: summary.description || '',
    extract: summary.extract || '',
    thumbnailUrl: thumbUrl,
    originalImageUrl: summary.originalimage?.source || thumbUrl,
    pageUrl:
      summary.content_urls?.desktop?.page ||
      `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(resolvedTitle.replace(/ /g, '_'))}`,
    domainLabel: 'Wikipedia',
    lang,
  };
}

async function queryWikipediaByLang(query: string, lang: 'es' | 'en'): Promise<WikiVisualMatch | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3200);

  try {
    // Step 1: Try official REST v1 summary endpoint directly first
    const directSlug = encodeURIComponent(query.trim().replace(/\s+/g, '_'));
    const directSummaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${directSlug}`;
    const directRes = await fetch(directSummaryUrl, {
      headers: WIKI_HEADERS,
      signal: controller.signal,
    });

    if (directRes.ok) {
      const directSummary = await directRes.json();
      const parsedDirect = parseSummaryPayload(query, directSummary, query, lang);
      if (parsedDirect) return parsedDirect;
    }

    // Step 2: Fallback to MediaWiki search API for best canonical title match
    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query
    )}&srlimit=2&format=json&origin=*`;

    const searchRes = await fetch(searchUrl, {
      headers: WIKI_HEADERS,
      signal: controller.signal,
    });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const results = searchData?.query?.search;
    if (!Array.isArray(results) || results.length === 0) return null;

    const bestTitle = results[0]?.title;
    if (!bestTitle) return null;

    // Step 3: Fetch REST v1 summary for the resolved canonical title
    const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      bestTitle.replace(/ /g, '_')
    )}`;
    const sumRes = await fetch(summaryUrl, {
      headers: WIKI_HEADERS,
      signal: controller.signal,
    });
    if (!sumRes.ok) return null;

    const summary = await sumRes.json();
    return parseSummaryPayload(query, summary, bestTitle, lang);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetches a verified Wikipedia thumbnail and source link for a heading query.
 * Uses in-memory + sessionStorage cache and never throws.
 */
export async function fetchWikipediaVisualForHeading(rawHeading: string): Promise<WikiVisualMatch | null> {
  const candidate = extractCandidateQueryFromHeading(rawHeading);
  if (!candidate) return null;

  const cacheKey = normalizeText(candidate);
  const cached = readSessionCache(cacheKey);
  if (cached.hit) {
    return cached.value;
  }

  if (inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey)!;
  }

  const promise = (async () => {
    const esMatch = await queryWikipediaByLang(candidate, 'es');
    if (esMatch) {
      writeSessionCache(cacheKey, esMatch);
      inflightRequests.delete(cacheKey);
      return esMatch;
    }

    const enMatch = await queryWikipediaByLang(candidate, 'en');
    writeSessionCache(cacheKey, enMatch);
    inflightRequests.delete(cacheKey);
    return enMatch;
  })();

  inflightRequests.set(cacheKey, promise);
  return promise;
}

/**
 * Extracts a clean, short site badge name from a URL (e.g., "https://www.argentina.gob.ar/..." -> "Argentina",
 * "https://www.coneau.gob.ar/..." -> "CONEAU", "https://es.wikipedia.org/..." -> "Wikipedia")
 */
export function getCleanDomainBadgeLabel(url: string, fallbackTitle?: string): {
  label: string;
  hostname: string;
  faviconUrl: string;
} {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./i, '');
    const parts = hostname.split('.');
    let core = parts[0] || hostname;
    if ((core === 'es' || core === 'en' || core === 'm') && parts.length > 1) {
      core = parts[1];
    }

    let label = core;
    if (core.length <= 6 && core !== 'wiki' && core !== 'bbc' && core !== 'cnn') {
      label = core.toUpperCase();
    } else {
      label = core.charAt(0).toUpperCase() + core.slice(1);
    }

    if (hostname.includes('wikipedia.org')) {
      label = 'Wikipedia';
    } else if (hostname.includes('argentina.gob.ar')) {
      label = 'Argentina';
    }

    return {
      label,
      hostname,
      faviconUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`,
    };
  } catch {
    return {
      label: fallbackTitle ? fallbackTitle.slice(0, 14) : 'Fuente',
      hostname: 'wikipedia.org',
      faviconUrl: 'https://www.google.com/s2/favicons?domain=wikipedia.org&sz=32',
    };
  }
}
