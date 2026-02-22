/**
 * Cliente para la API de datos abiertos del Ayuntamiento de Santander
 * Documentación: http://datos.santander.es
 */

const BASE_URL = "http://datos.santander.es/api/rest/datasets";

const ENDPOINTS = {
  lineas: "lineas_bus.json",
  secuencia: "lineas_bus_secuencia.json",
  paradas: "paradas_bus.json",
  estimaciones: "control_flotas_estimaciones.json",
};

/**
 * Escapa caracteres especiales de Lucene (excepto wildcards * y ?)
 * Los dos puntos del namespace RDF (ayto:campo) se escapan con \:
 */
function luceneEscape(value) {
  return value.replace(/[+\-&|!(){}[\]^"~:\\\/]/g, "\\$&");
}

/**
 * Descarga todas las páginas de un endpoint paginado
 */
async function fetchAllPages(endpoint, params = {}) {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set("items_per_page", "500");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const firstRes = await fetch(url.toString());
  if (!firstRes.ok) {
    throw new Error(`Error HTTP ${firstRes.status} al consultar ${endpoint}`);
  }

  const firstData = await firstRes.json();
  const { pages, items } = firstData.summary;
  let resources = firstData.resources ?? [];

  if (pages > 1) {
    const pageRequests = [];
    for (let page = 2; page <= pages; page++) {
      const pageUrl = new URL(url.toString());
      pageUrl.searchParams.set("page", page);
      pageRequests.push(
        fetch(pageUrl.toString()).then((r) => r.json())
      );
    }
    const pages_data = await Promise.all(pageRequests);
    for (const pd of pages_data) {
      resources = resources.concat(pd.resources ?? []);
    }
  }

  return { total: items, resources };
}

/**
 * Consulta un recurso individual por URI
 */
async function fetchResource(uri) {
  const res = await fetch(uri);
  if (!res.ok) {
    throw new Error(`Error HTTP ${res.status} al consultar ${uri}`);
  }
  return res.json();
}

// ─── Líneas ──────────────────────────────────────────────────────────────────

/** Lista todas las líneas de bus de Santander */
export async function getLineas() {
  const { resources } = await fetchAllPages(ENDPOINTS.lineas);
  return resources.map((r) => ({
    id: r["dc:identifier"],
    numero: r["ayto:numero"],
    nombre: r["dc:name"],
    ultimaActualizacion: r["dc:modified"],
    uri: r.uri,
  }));
}

/** Obtiene el detalle de una línea por su número (ej: "1", "15", "N3") */
export async function getLineaByNumero(numero) {
  const normalizado = numero.toString().toUpperCase().trim();
  const { resources } = await fetchAllPages(ENDPOINTS.lineas, {
    query: `ayto\\:numero:${luceneEscape(normalizado)}`,
  });
  if (resources.length === 0) return null;
  const r = resources[0];
  return {
    id: r["dc:identifier"],
    numero: r["ayto:numero"],
    nombre: r["dc:name"],
    ultimaActualizacion: r["dc:modified"],
    uri: r.uri,
  };
}

// ─── Secuencia de paradas por línea ──────────────────────────────────────────

/**
 * Devuelve la secuencia ordenada de paradas para una línea y sentido dados.
 * sentido: 1 = ida, 2 = vuelta (opcional, si se omite devuelve ambos)
 */
export async function getSecuenciaLinea(numeroLinea, sentido = null) {
  const normalizado = luceneEscape(numeroLinea.toString().toUpperCase().trim());
  const qLinea = `dc\\:EtiquetaLinea:${normalizado} OR ayto\\:Linea:${normalizado}`;
  const params = sentido !== null
    ? { query: `(${qLinea}) AND ayto\\:SentidoRuta:${luceneEscape(sentido.toString())}` }
    : { query: qLinea };

  const { resources } = await fetchAllPages(ENDPOINTS.secuencia, params);

  let filtrados = resources;

  return filtrados
    .sort((a, b) => {
      const sA = parseInt(a["ayto:SentidoRuta"] ?? 0);
      const sB = parseInt(b["ayto:SentidoRuta"] ?? 0);
      if (sA !== sB) return sA - sB;
      return parseFloat(a["ayto:PuntoKM"] ?? 0) - parseFloat(b["ayto:PuntoKM"] ?? 0);
    })
    .map((r) => ({
      linea: r["ayto:Linea"],
      etiquetaLinea: r["dc:EtiquetaLinea"],
      sublinea: r["ayto:NombreSublinea"],
      ruta: r["ayto:Ruta"],
      sentido: parseInt(r["ayto:SentidoRuta"]) === 1 ? "ida" : "vuelta",
      sentidoNumerico: parseInt(r["ayto:SentidoRuta"]),
      numeroParada: r["ayto:NParada"],
      nombreParada: r["ayto:NombreParada"],
      puntoKm: parseFloat(r["ayto:PuntoKM"] ?? 0),
      coordX: parseFloat(r["ayto:PosX"] ?? 0),
      coordY: parseFloat(r["ayto:PosY"] ?? 0),
      id: r["dc:identifier"],
    }));
}

// ─── Paradas ─────────────────────────────────────────────────────────────────

/** Lista todas las paradas de bus */
export async function getParadas() {
  const { resources } = await fetchAllPages(ENDPOINTS.paradas);
  return resources.map((r) => ({
    id: r["dc:identifier"],
    numero: r["ayto:numero"],
    nombre: r["ayto:parada"],
    direccion: r["vivo:address1"],
    sentido: r["ayto:sentido"],
    lat: parseFloat(r["wgs84_pos:lat"]),
    lon: parseFloat(r["wgs84_pos:long"]),
    coordX: parseFloat(r["gn:coordX"]),
    coordY: parseFloat(r["gn:coordY"]),
    ultimaActualizacion: r["dc:modified"],
    uri: r.uri,
  }));
}

/** Busca paradas por nombre o dirección usando filtro Lucene */
export async function buscarParadas(texto) {
  const escaped = luceneEscape(texto.trim());
  const { resources } = await fetchAllPages(ENDPOINTS.paradas, {
    query: `ayto\\:parada:*${escaped}* OR vivo\\:address1:*${escaped}* OR ayto\\:sentido:*${escaped}*`,
  });
  return resources.map((r) => ({
    id: r["dc:identifier"],
    numero: r["ayto:numero"],
    nombre: r["ayto:parada"],
    direccion: r["vivo:address1"],
    sentido: r["ayto:sentido"],
    lat: parseFloat(r["wgs84_pos:lat"]),
    lon: parseFloat(r["wgs84_pos:long"]),
    coordX: parseFloat(r["gn:coordX"]),
    coordY: parseFloat(r["gn:coordY"]),
    ultimaActualizacion: r["dc:modified"],
    uri: r.uri,
  }));
}

/** Obtiene una parada por su número de parada */
export async function getParadaByNumero(numero) {
  const { resources } = await fetchAllPages(ENDPOINTS.paradas, {
    query: `ayto\\:numero:${luceneEscape(numero.toString())}`,
  });
  if (resources.length === 0) return null;
  const r = resources[0];
  return {
    id: r["dc:identifier"],
    numero: r["ayto:numero"],
    nombre: r["ayto:parada"],
    direccion: r["vivo:address1"],
    sentido: r["ayto:sentido"],
    lat: parseFloat(r["wgs84_pos:lat"]),
    lon: parseFloat(r["wgs84_pos:long"]),
    coordX: parseFloat(r["gn:coordX"]),
    coordY: parseFloat(r["gn:coordY"]),
    ultimaActualizacion: r["dc:modified"],
    uri: r.uri,
  };
}

/**
 * Encuentra las N paradas más cercanas a unas coordenadas (lat, lon)
 */
export async function getParadasCercanas(lat, lon, n = 5) {
  const paradas = await getParadas();

  function distancia(p) {
    const dLat = p.lat - lat;
    const dLon = p.lon - lon;
    return Math.sqrt(dLat * dLat + dLon * dLon);
  }

  return paradas
    .filter((p) => !isNaN(p.lat) && !isNaN(p.lon))
    .map((p) => ({ ...p, distanciaGrados: distancia(p) }))
    .sort((a, b) => a.distanciaGrados - b.distanciaGrados)
    .slice(0, n)
    .map(({ distanciaGrados, ...p }) => ({
      ...p,
      distanciaMetrosAprox: Math.round(distanciaGrados * 111320),
    }));
}

// ─── Estimaciones de paso ─────────────────────────────────────────────────────

/**
 * Devuelve las estimaciones de paso actuales para todas las paradas.
 * Son datos en tiempo real que se actualizan cada pocos minutos.
 */
export async function getEstimaciones() {
  const { resources } = await fetchAllPages(ENDPOINTS.estimaciones);
  return resources.map(mapEstimacion);
}

function mapEstimacion(r) {
  const tiempo1Seg = parseInt(r["ayto:tiempo1"] ?? -1);
  const tiempo2Seg = parseInt(r["ayto:tiempo2"] ?? -1);
  const dist1 = parseInt(r["ayto:distancia1"] ?? -1);
  const dist2 = parseInt(r["ayto:distancia2"] ?? -1);

  return {
    paradaId: r["ayto:paradaId"],
    linea: r["ayto:etiqLinea"],
    destino1: r["ayto:destino1"],
    destino2: r["ayto:destino2"],
    proximoBus: {
      tiempoSegundos: tiempo1Seg,
      tiempoMinutos: tiempo1Seg >= 0 ? Math.round(tiempo1Seg / 60) : null,
      distanciaMetros: dist1 >= 0 ? dist1 : null,
      llegada: tiempo1Seg >= 0 ? calcularHoraLlegada(tiempo1Seg) : null,
    },
    segundoBus: {
      tiempoSegundos: tiempo2Seg,
      tiempoMinutos: tiempo2Seg >= 0 ? Math.round(tiempo2Seg / 60) : null,
      distanciaMetros: dist2 >= 0 ? dist2 : null,
      llegada: tiempo2Seg >= 0 ? calcularHoraLlegada(tiempo2Seg) : null,
    },
    fechaConsulta: r["ayto:fechActual"],
    ultimaActualizacion: r["dc:modified"],
    id: r["dc:identifier"],
  };
}

function calcularHoraLlegada(segundos) {
  const ahora = new Date();
  ahora.setSeconds(ahora.getSeconds() + segundos);
  return ahora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

/** Estimaciones para una parada específica por su ID */
export async function getEstimacionesByParada(paradaId) {
  const { resources } = await fetchAllPages(ENDPOINTS.estimaciones, {
    query: `ayto\\:paradaId:${luceneEscape(paradaId.toString())}`,
  });
  return resources.map(mapEstimacion);
}

/** Estimaciones para todas las paradas de una línea concreta */
export async function getEstimacionesByLinea(linea) {
  const normalizado = linea.toString().toUpperCase().trim();
  const { resources } = await fetchAllPages(ENDPOINTS.estimaciones, {
    query: `ayto\\:etiqLinea:${luceneEscape(normalizado)}`,
  });
  return resources.map(mapEstimacion);
}

// ─── Cache ligero con TTL ─────────────────────────────────────────────────────

const _cache = { data: null, ts: 0 };
const CACHE_TTL_MS = 30_000; // 30 s — las estimaciones se actualizan cada ~30 s

async function getTodasEstimacionesCached() {
  const now = Date.now();
  if (_cache.data && now - _cache.ts < CACHE_TTL_MS) return _cache.data;
  const result = await fetchAllPages(ENDPOINTS.estimaciones);
  _cache.data = result;
  _cache.ts = now;
  return result;
}

// ─── Planificación de rutas ───────────────────────────────────────────────────

/**
 * Encuentra líneas que conectan dos paradas (por número de parada).
 * Devuelve rutas directas y con una transbordo.
 */
export async function planificarRuta(paradaOrigenId, paradaDestinoId) {
  // Obtener secuencias específicas de cada parada en paralelo
  const [resOrigen, resDestino] = await Promise.all([
    fetchAllPages(ENDPOINTS.secuencia, {
      query: `ayto\\:NParada:${luceneEscape(paradaOrigenId.toString())}`,
    }),
    fetchAllPages(ENDPOINTS.secuencia, {
      query: `ayto\\:NParada:${luceneEscape(paradaDestinoId.toString())}`,
    }),
  ]);

  const seqToEntry = (s) => ({
    linea: s["dc:EtiquetaLinea"] ?? s["ayto:Linea"],
    sentido: s["ayto:SentidoRuta"],
    puntoKm: parseFloat(s["ayto:PuntoKM"] ?? 0),
    nombreParada: s["ayto:NombreParada"],
    nParada: s["ayto:NParada"]?.toString(),
  });

  const lineasOrigen = resOrigen.resources.map(seqToEntry);
  const lineasDestino = resDestino.resources.map(seqToEntry);

  // Para transbordos necesitamos las secuencias completas de las líneas
  // que sirven origen Y destino. Construimos queries Lucene con OR.
  const lineasUnicasOrigen = [...new Set(lineasOrigen.map((e) => e.linea).filter(Boolean))];
  const lineasUnicasDestino = [...new Set(lineasDestino.map((e) => e.linea).filter(Boolean))];

  const qLineasOrigen = lineasUnicasOrigen
    .map((l) => `dc\\:EtiquetaLinea:${luceneEscape(l)}`)
    .join(" OR ");
  const qLineasDestino = lineasUnicasDestino
    .map((l) => `dc\\:EtiquetaLinea:${luceneEscape(l)}`)
    .join(" OR ");

  // Fetch en paralelo: secuencias de líneas origen, secuencias de líneas destino,
  // estimaciones de la parada origen y todas las estimaciones (para filtrar líneas activas)
  const [resSeqLineasOrigen, resSeqLineasDestino, estimaciones, todasEstimaciones] = await Promise.all([
    lineasUnicasOrigen.length > 0
      ? fetchAllPages(ENDPOINTS.secuencia, { query: qLineasOrigen })
      : Promise.resolve({ resources: [] }),
    lineasUnicasDestino.length > 0
      ? fetchAllPages(ENDPOINTS.secuencia, { query: qLineasDestino })
      : Promise.resolve({ resources: [] }),
    getEstimacionesByParada(paradaOrigenId),
    getTodasEstimacionesCached(),
  ]);

  // Conjunto de etiquetas de líneas con buses circulando ahora mismo
  const lineasActivas = new Set(
    todasEstimaciones.resources
      .map((r) => r["ayto:etiqLinea"]?.toUpperCase())
      .filter(Boolean)
  );

  const seqs = resSeqLineasOrigen.resources;

  // Mapear parada → entradas de secuencia (líneas origen + líneas destino)
  const paradaALineas = new Map();
  for (const s of [...resSeqLineasOrigen.resources, ...resSeqLineasDestino.resources]) {
    const nParada = s["ayto:NParada"]?.toString();
    if (!nParada) continue;
    if (!paradaALineas.has(nParada)) paradaALineas.set(nParada, []);
    paradaALineas.get(nParada).push(seqToEntry(s));
  }

  // ── Rutas directas ──
  const rutasDirectas = [];

  for (const lo of lineasOrigen) {
    for (const ld of lineasDestino) {
      if (lo.linea === ld.linea && lo.sentido === ld.sentido) {
        // El origen debe estar antes que el destino en km
        if (lo.puntoKm <= ld.puntoKm) {
          const sentidoLabel = parseInt(lo.sentido) === 1 ? "ida" : "vuelta";

          // Estimar próximo bus en parada origen
          const estOrigen = estimaciones.filter(
            (e) =>
              e.paradaId?.toString() === paradaOrigenId.toString() &&
              e.linea?.toUpperCase() === lo.linea?.toUpperCase()
          );

          rutasDirectas.push({
            tipo: "directa",
            linea: lo.linea,
            sentido: sentidoLabel,
            paradaOrigen: { numero: paradaOrigenId, nombre: lo.nombreParada },
            paradaDestino: { numero: paradaDestinoId, nombre: ld.nombreParada },
            distanciaKm: parseFloat((ld.puntoKm - lo.puntoKm).toFixed(2)),
            proximoBus:
              estOrigen.length > 0
                ? {
                    tiempoMinutos: estOrigen[0].proximoBus.tiempoMinutos,
                    llegadaEstimada: estOrigen[0].proximoBus.llegada,
                    destino: estOrigen[0].destino1,
                  }
                : null,
          });
        }
      }
    }
  }

  // Eliminar duplicados de rutas directas y filtrar sólo líneas activas
  const rutasDirectasUnicas = rutasDirectas.filter(
    (v, i, a) =>
      a.findIndex((t) => t.linea === v.linea && t.sentido === v.sentido) === i &&
      lineasActivas.has(v.linea?.toUpperCase())
  );

  // ── Rutas con transbordo (si no hay directas) ──
  const rutasTransbordo = [];

  if (rutasDirectasUnicas.length === 0) {
    // Paradas donde llegan líneas del origen
    const paradasIntermedias = new Set();
    for (const seq of seqs) {
      const nParada = seq["ayto:NParada"]?.toString();
      const linea = seq["dc:EtiquetaLinea"] ?? seq["ayto:Linea"];
      if (lineasOrigen.some((lo) => lo.linea === linea)) {
        paradasIntermedias.add(nParada);
      }
    }

    // Ver si alguna de esas paradas intermedias sirve el destino
    for (const pi of paradasIntermedias) {
      if (pi === paradaOrigenId.toString() || pi === paradaDestinoId.toString())
        continue;

      const lineasIntermedias = paradaALineas.get(pi) ?? [];
      for (const li of lineasIntermedias) {
        for (const ld of lineasDestino) {
          if (
            li.linea === ld.linea &&
            li.sentido === ld.sentido &&
            li.puntoKm <= ld.puntoKm
          ) {
            // Buscar la línea del origen que pasa por pi
            const seqOrigen = seqs.find(
              (s) =>
                s["ayto:NParada"]?.toString() === pi &&
                lineasOrigen.some(
                  (lo) => lo.linea === (s["dc:EtiquetaLinea"] ?? s["ayto:Linea"])
                )
            );
            if (!seqOrigen) continue;
            const lineaOrigen =
              seqOrigen["dc:EtiquetaLinea"] ?? seqOrigen["ayto:Linea"];

            rutasTransbordo.push({
              tipo: "transbordo",
              tramo1: {
                linea: lineaOrigen,
                paradaOrigen: {
                  numero: paradaOrigenId,
                  nombre:
                    lineasOrigen.find((lo) => lo.linea === lineaOrigen)
                      ?.nombreParada ?? paradaOrigenId,
                },
                paradaTransbordo: {
                  numero: pi,
                  nombre: seqOrigen["ayto:NombreParada"],
                },
              },
              tramo2: {
                linea: li.linea,
                paradaTransbordo: {
                  numero: pi,
                  nombre: li.nombreParada,
                },
                paradaDestino: {
                  numero: paradaDestinoId,
                  nombre: ld.nombreParada,
                },
              },
            });
          }
        }
      }
    }
  }

  // Filtrar transbordos: ambas líneas deben estar activas
  const rutasTransbordoActivas = rutasTransbordo.filter(
    (r) =>
      lineasActivas.has(r.tramo1.linea?.toUpperCase()) &&
      lineasActivas.has(r.tramo2.linea?.toUpperCase())
  );

  return {
    origen: paradaOrigenId,
    destino: paradaDestinoId,
    rutasDirectas: rutasDirectasUnicas,
    rutasConTransbordo: rutasTransbordoActivas.slice(0, 5), // máximo 5 sugerencias
    tiempoConsulta: new Date().toISOString(),
  };
}
