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
const SESSION_CACHE_PREFIX = 'kizuna_wiki_summary_v4:';
const WIKI_HEADERS: HeadersInit = {
  Accept: 'application/json',
};

// Purge legacy sessionStorage keys from v2/v3 that may hold false-positive matches
try {
  if (typeof sessionStorage !== 'undefined') {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && (k.startsWith('kizuna_wiki_summary_v2:') || k.startsWith('kizuna_wiki_summary_v3:'))) {
        sessionStorage.removeItem(k);
      }
    }
  }
} catch {
  // Ignore storage access errors
}

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
  // Only persist non-null matches to sessionStorage so transient network glitches never permanently block a heading
  if (!value) return;
  try {
    sessionStorage.setItem(`${SESSION_CACHE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Ignore sessionStorage quota errors
  }
}

// Headings that are structural/conversational/creative-writing/editorial markers and should NEVER query Wikipedia
const GENERIC_HEADING_STOPWORDS = new Set([
  'introduccion',
  'conclusion',
  'conclusiones',
  'resumen',
  'sintesis',
  'analisis',
  'contexto',
  'ejemplo',
  'ejemplos',
  'ej',
  'nota',
  'notas',
  'advertencia',
  'importante',
  'paso',
  'pasos',
  'etapa',
  'etapas',
  'fase',
  'fases',
  'escena',
  'escenas',
  'capitulo',
  'capitulos',
  'cap',
  'acto',
  'parte',
  'partes',
  'seccion',
  'opcion',
  'opciones',
  'alternativa',
  'alternativas',
  'ventaja',
  'ventajas',
  'desventaja',
  'desventajas',
  'pros',
  'contras',
  'caracteristica',
  'caracteristicas',
  'detalle',
  'detalles',
  'explicacion',
  'respuesta',
  'respuestas',
  'pregunta',
  'preguntas',
  'solucion',
  'soluciones',
  'codigo',
  'implementacion',
  'resultado',
  'resultados',
  'comparacion',
  'diferencia',
  'diferencias',
  'similitud',
  'similitudes',
  'recomendacion',
  'recomendaciones',
  'consejo',
  'consejos',
  'practico',
  'practica',
  'practicos',
  'practicas',
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
  'regla',
  'reglas',
  'instruccion',
  'instrucciones',
  'prompt',
  'personaje',
  'personajes',
  'dialogo',
  'dialogos',
  'narrativa',
  'narrador',
  'borrador',
  'correccion',
  'continuacion',
  'epilogo',
  'prologo',
  'historia',
  'origen',
  'biografia',
  'quien',
  'que',
  'como',
  'cuando',
  'donde',
  'porque',
  'critica',
  'criticas',
  'posible',
  'posibles',
  'riesgo',
  'riesgos',
  'real',
  'reales',
  'error',
  'errores',
  'comun',
  'comunes',
  'clave',
  'claves',
  'acierto',
  'aciertos',
  'logro',
  'logros',
  'punto',
  'puntos',
  'fuerte',
  'fuertes',
  'debil',
  'debiles',
  'caracterizacion',
  'subtexto',
  'ritmo',
  'tono',
  'estilo',
  'trama',
  'arco',
  'climax',
  'desenlace',
  'apertura',
  'cierre',
  'lectura',
  'lector',
  'lectores',
  'autor',
  'escritor',
  'novela',
  'obra',
  'texto',
  'escenario',
  'tecnica',
  'tecnicas',
  'recurso',
  'recursos',
  'impacto',
  'efecto',
  'nivel',
  'niveles',
  'bloque',
  'bloques',
  'resumen',
  'cierre',
  'mea',
  'culpa',
]);

// Conversational / 2nd-person / literary-critique tokens that disqualify the ENTIRE heading immediately
const CONVERSATIONAL_OR_CRITIQUE_TOKENS = new Set([
  'vos',
  'tu',
  'tus',
  'tuyo',
  'tuya',
  'tuyos',
  'tuyas',
  'contigo',
  'ustedes',
  'mi',
  'mis',
  'mio',
  'mia',
  'nuestro',
  'nuestra',
  'crees',
  'evitaste',
  'hiciste',
  'lograste',
  'escribiste',
  'pusiste',
  'dijiste',
  'pensas',
  'sentis',
  'sientes',
  'caso',
  'falso',
  'falsa',
  'reforzar',
  'mejorar',
  'evitar',
  'aplicar',
  'escena',
  'escenas',
  'capitulo',
  'capitulos',
  'personaje',
  'personajes',
  'caracterizacion',
  'subtexto',
  'narrador',
  'lector',
  'consejo',
  'consejos',
  'critica',
  'criticas',
  'riesgo',
  'riesgos',
  'error',
  'errores',
  'acierto',
  'aciertos',
  'veredicto',
  'diagnostico',
]);

// Fictional canon entities from Monstereth so we don't query real-world Wikipedia for them
const FICTIONAL_LORE_STOPWORDS = new Set([
  'kolder',
  'zekshoyu',
  'hinistra',
  'zupsekia',
  'monstereth',
  'santusma',
  'tedriot',
  'teshuvana',
  'gurasha',
  'skarnita',
  'jukkou',
  'zankyou',
  'kizuna',
  'zek',
  'runico',
  'runica',
]);

const TOKEN_STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en',
  'con', 'por', 'para', 'sin', 'sobre', 'entre', 'hacia', 'hasta', 'desde', 'como',
  'que', 'quien', 'cual', 'cuando', 'donde', 'fue', 'fueron', 'era', 'son',
  'es', 'su', 'sus', 'mi', 'tu', 'se', 'lo', 'le', 'les', 'y', 'o', 'u', 'e', 'ni',
  'no', 'si', 'mas', 'pero', 'the', 'of', 'in', 'and', 'to', 'for', 'on', 'with',
]);

const LEADING_PREPOSITIONS = new Set([
  'en', 'con', 'por', 'para', 'sin', 'sobre', 'entre', 'hacia', 'hasta', 'desde',
  'segun', 'contra', 'ante', 'bajo', 'tras', 'durante', 'mediante', 'como', 'cuando',
  'donde', 'porque', 'si', 'mas', 'pero', 'aunque',
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
 * it looks like a concrete historical event, place, person, published work, or scientific concept.
 */
export function extractCandidateQueryFromHeading(rawHeading: string): string | null {
  if (!rawHeading || typeof rawHeading !== 'string') return null;

  // 1. Inspect the ENTIRE raw heading (including parenthetical notes and colons) first!
  // If any part of the heading references fictional lore, conversational 2nd-person remarks,
  // or literary-workshop rubrics (e.g. "Riesgo real (y cómo vos lo evitaste)", "En escenas clave (ej.: Capítulo 88)"),
  // disqualify the entire heading immediately.
  const fullNorm = normalizeText(rawHeading);
  if (!fullNorm) return null;
  const fullTokens = fullNorm.split(' ').filter(Boolean);
  if (fullTokens.some((w) => FICTIONAL_LORE_STOPWORDS.has(w))) return null;
  if (fullTokens.some((w) => CONVERSATIONAL_OR_CRITIQUE_TOKENS.has(w))) return null;

  // Strip leading numbering like "1.", "2)", "II.", "Paso 1:", emojis, or markdown markers
  let cleaned = rawHeading
    .replace(/^[\dIVXLCDM]+[\.\)\-:]\s*/i, '')
    .replace(/^[^\wÁÉÍÓÚáéíóúÑñÜü¿¡]+/, '')
    .replace(/[*_`~#]/g, '')
    .trim();

  if (!cleaned || cleaned.length < 3 || cleaned.length > 85) return null;

  // Reject rhetorical questions or headings containing question marks unless strictly "¿Quién fue X?" with a Proper Noun
  if (cleaned.includes('¿') || cleaned.includes('?')) {
    // Disallow if there is a trailing conversational parenthetical after the question mark, e.g. "¿Qué es X? (No es lo que crees)"
    if (!cleaned.endsWith('?')) return null;
    const qMatch = cleaned
      .replace(/^[¿?]+|[¿?]+$/g, '')
      .trim()
      .match(/^(?:qu[ií]en\s+(?:fue|es|era))\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+){0,4})$/);
    if (qMatch && qMatch[1] && qMatch[1].trim().length >= 4) {
      cleaned = qMatch[1].trim();
    } else {
      return null;
    }
  }

  // Strip parenthetical years or short disambiguations at the end, e.g. "La Noche de los Bastones Largos (1966)"
  const withoutParens = cleaned.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const candidate = withoutParens.length >= 3 ? withoutParens : cleaned;

  // Split after colon or dash only if prefix is a known encyclopedic label
  let finalQuery = candidate;
  if (candidate.includes(':')) {
    const [left, right] = candidate.split(':', 2).map((s) => s.trim());
    const normLeftWords = normalizeText(left).split(' ').filter(Boolean);
    if (normLeftWords.some((w) => GENERIC_HEADING_STOPWORDS.has(w))) {
      return null;
    }
    if (left && left.length >= 3 && left.length <= 50 && !right.includes('¿')) {
      finalQuery = left;
    } else {
      return null;
    }
  } else if (/\s+[—–-]\s+/.test(candidate)) {
    const [left] = candidate.split(/\s+[—–-]\s+/, 2).map((s) => s.trim());
    const normLeftWords = normalizeText(left).split(' ').filter(Boolean);
    if (normLeftWords.some((w) => GENERIC_HEADING_STOPWORDS.has(w))) {
      return null;
    }
    if (left && left.length >= 3 && left.length <= 50) {
      finalQuery = left;
    } else {
      return null;
    }
  }

  const norm = normalizeText(finalQuery);
  if (!norm) return null;

  const words = norm.split(' ').filter(Boolean);
  if (words.length === 0 || words.length > 7) return null;

  // Reject phrases starting with prepositions/conjunctions like "En escenas...", "Sobre el...", "Por qué..."
  if (LEADING_PREPOSITIONS.has(words[0])) return null;

  // Reject if ANY word in the candidate is a generic structural/editorial stopword
  if (words.some((w) => GENERIC_HEADING_STOPWORDS.has(w) || FICTIONAL_LORE_STOPWORDS.has(w))) {
    return null;
  }

  const meaningfulWords = words.filter((w) => !TOKEN_STOPWORDS.has(w) && w.length > 2);
  if (meaningfulWords.length === 0) return null;

  // Require at least one capitalized word (Proper Noun) in the original candidate
  // (after stripping leading articles like El/La/Los/Las/Un/Una so ordinary sentence-case generic nouns don't slip through)
  const wordsOriginal = finalQuery.trim().split(/\s+/);
  const nonInitialProperNoun = wordsOriginal
    .slice(1)
    .some((w) => /^[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]{2,}/.test(w.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü]/g, '')));
  const firstWordClean = (wordsOriginal[0] || '').replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü]/g, '');
  const isSingleProperName =
    wordsOriginal.length >= 1 &&
    wordsOriginal.length <= 4 &&
    /^[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]{2,}/.test(firstWordClean) &&
    !TOKEN_STOPWORDS.has(normalizeText(firstWordClean));

  if (!nonInitialProperNoun && !isSingleProperName) {
    return null;
  }

  return finalQuery;
}

function areTokensEquivalent(a: string, b: string): boolean {
  if (a === b) return true;
  // Allow minor transliteration difference (e.g. dostoievski vs dostoyevski) only on long proper nouns (>= 7 chars)
  if (a.length >= 7 && b.length >= 7 && Math.abs(a.length - b.length) <= 1) {
    if (a.slice(0, 5) === b.slice(0, 5) && a.slice(-3) === b.slice(-3)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks that the returned Wikipedia article title is strictly equivalent to the heading query
 * so we NEVER display an unrelated article (e.g. "Asier Riesgo" for "Riesgo real" or "Masa crítica" for "Posible crítica").
 */
function isRelevantWikiMatch(
  query: string,
  wikiTitle: string,
  wikiDescription: string = '',
  wikiExtract: string = ''
): boolean {
  if (!query || !wikiTitle) return false;

  // Reject Wikipedia meta/list/disambiguation pages
  const lowerTitle = wikiTitle.toLowerCase();
  const lowerDesc = (wikiDescription || '').toLowerCase();
  const lowerExtract = (wikiExtract || '').toLowerCase();
  if (
    lowerTitle.startsWith('anexo:') ||
    lowerTitle.startsWith('wikipedia:') ||
    lowerTitle.startsWith('categoría:') ||
    lowerDesc.includes('desambiguación') ||
    lowerDesc.includes('disambiguation') ||
    lowerExtract.includes('puede referirse a:') ||
    lowerExtract.includes('hace referencia a varios artículos')
  ) {
    return false;
  }

  // Strip parenthetical qualifier from Wikipedia title (e.g. "El idiota (novela)" -> "El idiota")
  const wikiBaseTitle = wikiTitle.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

  const qNorm = normalizeText(query);
  const tNorm = normalizeText(wikiBaseTitle);
  if (!qNorm || !tNorm) return false;

  // Exact normalized string match
  if (qNorm === tNorm) return true;

  const qTokens = qNorm.split(' ').filter((w) => !TOKEN_STOPWORDS.has(w) && w.length >= 2);
  const tTokens = tNorm.split(' ').filter((w) => !TOKEN_STOPWORDS.has(w) && w.length >= 2);
  if (qTokens.length === 0 || tTokens.length === 0) return false;

  // Strict bidirectional token check:
  // Every meaningful token in the query MUST match a meaningful token in the Wikipedia title,
  // AND every meaningful token in the Wikipedia title MUST match a meaningful token in the query!
  const allQueryInTitle = qTokens.every((qt) => tTokens.some((tt) => areTokensEquivalent(qt, tt)));
  const allTitleInQuery = tTokens.every((tt) => qTokens.some((qt) => areTokensEquivalent(qt, tt)));

  if (allQueryInTitle && allTitleInQuery && qTokens.length === tTokens.length) {
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

  // Filter out generic Wikimedia placeholder icons, flags, coats of arms, maps, or tiny icons
  const lowerThumb = thumbUrl.toLowerCase();
  if (
    lowerThumb.includes('disambig') ||
    lowerThumb.includes('question_book') ||
    lowerThumb.includes('ambox') ||
    lowerThumb.includes('commons-logo') ||
    lowerThumb.includes('wikidata-logo') ||
    lowerThumb.includes('coat_of_arms') ||
    lowerThumb.includes('escudo_de') ||
    (summary.thumbnail?.width && summary.thumbnail.width < 60)
  ) {
    return null;
  }

  const resolvedTitle = summary.title || fallbackTitle;
  if (!isRelevantWikiMatch(query, resolvedTitle, summary.description || '', summary.extract || '')) {
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
  const timeout = setTimeout(() => controller.abort(), 4500);

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
    )}&srlimit=3&format=json&origin=*`;

    const searchRes = await fetch(searchUrl, {
      headers: WIKI_HEADERS,
      signal: controller.signal,
    });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const results = searchData?.query?.search;
    if (!Array.isArray(results) || results.length === 0) return null;

    // Step 3: Check top search results until one yields a verified summary with a thumbnail
    for (const hit of results.slice(0, 3)) {
      const bestTitle = hit?.title;
      if (!bestTitle) continue;

      const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        bestTitle.replace(/ /g, '_')
      )}`;
      const sumRes = await fetch(summaryUrl, {
        headers: WIKI_HEADERS,
        signal: controller.signal,
      });
      if (!sumRes.ok) continue;

      const summary = await sumRes.json();
      const parsed = parseSummaryPayload(query, summary, bestTitle, lang);
      if (parsed) return parsed;
    }

    return null;
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
