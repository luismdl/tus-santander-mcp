import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import express from "express";

import {
  getLineas,
  getLineaByNumero,
  getSecuenciaLinea,
  getParadas,
  buscarParadas,
  getParadaByNumero,
  getParadasCercanas,
  getEstimacionesByParada,
  getEstimacionesByLinea,
  planificarRuta,
} from "./api.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(data) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function err(mensaje) {
  return {
    content: [
      {
        type: "text",
        text: `Error: ${mensaje}`,
      },
    ],
    isError: true,
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

function createServer() {
  const server = new McpServer({
    name: "tus-santander",
    version: "1.0.0",
  });

  // ─── Herramienta: listar_lineas ─────────────────────────────────────────────

  server.tool(
    "listar_lineas",
    "Lista todas las líneas de autobús urbano TUS de Santander con su número y nombre de ruta.",
    {},
    async () => {
      const lineas = await getLineas();
      return ok({
        total: lineas.length,
        lineas: lineas.map((l) => ({
          numero: l.numero,
          nombre: l.nombre,
          id: l.id,
        })),
      });
    }
  );

  // ─── Herramienta: info_linea ────────────────────────────────────────────────

  server.tool(
    "info_linea",
    "Obtiene información detallada de una línea de autobús concreta, incluyendo la secuencia ordenada de paradas por sentido (ida/vuelta).",
    {
      numero_linea: z
        .string()
        .describe('Número o etiqueta de la línea (ej: "1", "15", "N3", "24C2")'),
      sentido: z
        .enum(["ida", "vuelta", "ambos"])
        .default("ambos")
        .describe('Sentido de la ruta: "ida", "vuelta" o "ambos"'),
    },
    async ({ numero_linea, sentido }) => {
      const linea = await getLineaByNumero(numero_linea);

      const sentidoNum =
        sentido === "ida" ? 1 : sentido === "vuelta" ? 2 : null;
      const secuencia = await getSecuenciaLinea(numero_linea, sentidoNum);

      if (secuencia.length === 0) {
        return err(
          `No se encontró la línea "${numero_linea}". Usa listar_lineas para ver las líneas disponibles.`
        );
      }

      const porSentido = {};
      for (const s of secuencia) {
        if (!porSentido[s.sentido]) porSentido[s.sentido] = [];
        porSentido[s.sentido].push({
          orden: porSentido[s.sentido].length + 1,
          numeroParada: s.numeroParada,
          nombreParada: s.nombreParada,
          puntoKm: s.puntoKm,
        });
      }

      return ok({
        linea: {
          numero: linea?.numero ?? numero_linea,
          nombre: linea?.nombre ?? "No disponible",
          id: linea?.id,
        },
        rutas: porSentido,
        totalParadas: secuencia.length,
      });
    }
  );

  // ─── Herramienta: buscar_paradas ────────────────────────────────────────────

  server.tool(
    "buscar_paradas",
    "Busca paradas de autobús por nombre, dirección o zona en Santander.",
    {
      texto: z
        .string()
        .describe(
          'Texto a buscar en nombre o dirección de la parada (ej: "Valdecilla", "Sardinero")'
        ),
    },
    async ({ texto }) => {
      const paradas = await buscarParadas(texto);

      if (paradas.length === 0) {
        return ok({
          mensaje: `No se encontraron paradas que coincidan con "${texto}".`,
          sugerencia:
            "Prueba con un término más genérico como el barrio o la calle principal.",
          resultados: [],
        });
      }

      return ok({
        total: paradas.length,
        resultados: paradas.map((p) => ({
          numero: p.numero,
          nombre: p.nombre,
          direccion: p.direccion,
          sentido: p.sentido,
          lat: p.lat,
          lon: p.lon,
        })),
      });
    }
  );

  // ─── Herramienta: info_parada ───────────────────────────────────────────────

  server.tool(
    "info_parada",
    "Obtiene los detalles de una parada específica por su número: nombre, dirección, sentido y coordenadas GPS.",
    {
      numero_parada: z
        .string()
        .describe('Número identificador de la parada (ej: "539")'),
    },
    async ({ numero_parada }) => {
      const parada = await getParadaByNumero(numero_parada);

      if (!parada) {
        return err(
          `No se encontró la parada número "${numero_parada}". Usa buscar_paradas para encontrarla por nombre.`
        );
      }

      return ok(parada);
    }
  );

  // ─── Herramienta: paradas_cercanas ──────────────────────────────────────────

  server.tool(
    "paradas_cercanas",
    "Encuentra las paradas de autobús más cercanas a unas coordenadas GPS dadas.",
    {
      latitud: z
        .number()
        .describe("Latitud en grados decimales (ej: 43.4628)"),
      longitud: z
        .number()
        .describe("Longitud en grados decimales (ej: -3.8044)"),
      numero_resultados: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(5)
        .describe("Número de paradas cercanas a devolver (por defecto: 5)"),
    },
    async ({ latitud, longitud, numero_resultados }) => {
      const paradas = await getParadasCercanas(latitud, longitud, numero_resultados);

      return ok({
        coordenadasConsulta: { lat: latitud, lon: longitud },
        total: paradas.length,
        paradasCercanas: paradas.map((p) => ({
          numero: p.numero,
          nombre: p.nombre,
          direccion: p.direccion,
          sentido: p.sentido,
          distanciaMetrosAprox: p.distanciaMetrosAprox,
          lat: p.lat,
          lon: p.lon,
        })),
      });
    }
  );

  // ─── Herramienta: estimaciones_parada ──────────────────────────────────────

  server.tool(
    "estimaciones_parada",
    "Consulta en tiempo real las estimaciones de llegada de autobuses a una parada concreta.",
    {
      numero_parada: z
        .string()
        .describe('Número de la parada (ej: "539")'),
    },
    async ({ numero_parada }) => {
      const parada = await getParadaByNumero(numero_parada);
      const estimaciones = await getEstimacionesByParada(numero_parada);

      if (estimaciones.length === 0) {
        return ok({
          parada: parada
            ? { numero: parada.numero, nombre: parada.nombre }
            : { numero: numero_parada },
          mensaje:
            "No hay estimaciones disponibles en este momento para esta parada. Puede que no haya autobuses en servicio actualmente o que la parada no tenga buses asignados.",
          estimaciones: [],
          consultadoEn: new Date().toISOString(),
        });
      }

      return ok({
        parada: parada
          ? {
              numero: parada.numero,
              nombre: parada.nombre,
              direccion: parada.direccion,
              sentido: parada.sentido,
            }
          : { numero: numero_parada },
        totalLineas: estimaciones.length,
        estimaciones: estimaciones.map((e) => ({
          linea: e.linea,
          proximoBus: {
            tiempoMinutos: e.proximoBus.tiempoMinutos,
            llegadaEstimada: e.proximoBus.llegada,
            distanciaMetros: e.proximoBus.distanciaMetros,
            destino: e.destino1,
          },
          segundoBus:
            e.segundoBus.tiempoSegundos >= 0
              ? {
                  tiempoMinutos: e.segundoBus.tiempoMinutos,
                  llegadaEstimada: e.segundoBus.llegada,
                  distanciaMetros: e.segundoBus.distanciaMetros,
                  destino: e.destino2,
                }
              : null,
        })),
        consultadoEn: new Date().toISOString(),
      });
    }
  );

  // ─── Herramienta: estimaciones_linea ───────────────────────────────────────

  server.tool(
    "estimaciones_linea",
    "Consulta en tiempo real las estimaciones de paso de todos los autobuses en circulación de una línea concreta.",
    {
      numero_linea: z
        .string()
        .describe('Número o etiqueta de la línea (ej: "1", "15", "N3")'),
    },
    async ({ numero_linea }) => {
      const [linea, estimaciones] = await Promise.all([
        getLineaByNumero(numero_linea),
        getEstimacionesByLinea(numero_linea),
      ]);

      if (estimaciones.length === 0) {
        return ok({
          linea: linea
            ? { numero: linea.numero, nombre: linea.nombre }
            : { numero: numero_linea },
          mensaje:
            "No hay estimaciones disponibles en este momento para esta línea.",
          estimaciones: [],
          consultadoEn: new Date().toISOString(),
        });
      }

      const paradasMap = new Map();
      try {
        const paradas = await getParadas();
        for (const p of paradas) {
          paradasMap.set(p.numero?.toString(), p.nombre);
        }
      } catch (_) {
        // Si falla, continuamos sin nombres
      }

      return ok({
        linea: linea
          ? { numero: linea.numero, nombre: linea.nombre }
          : { numero: numero_linea },
        totalParadasConBuses: estimaciones.length,
        posicionesBuses: estimaciones
          .filter((e) => e.proximoBus.tiempoSegundos >= 0)
          .sort((a, b) => a.proximoBus.tiempoSegundos - b.proximoBus.tiempoSegundos)
          .map((e) => ({
            paradaId: e.paradaId,
            nombreParada: paradasMap.get(e.paradaId?.toString()) ?? null,
            proximoBus: {
              tiempoMinutos: e.proximoBus.tiempoMinutos,
              llegadaEstimada: e.proximoBus.llegada,
              distanciaMetros: e.proximoBus.distanciaMetros,
              destino: e.destino1,
            },
          })),
        consultadoEn: new Date().toISOString(),
      });
    }
  );

  // ─── Herramienta: planificar_ruta ───────────────────────────────────────────

  server.tool(
    "planificar_ruta",
    "Planifica cómo ir desde una parada de origen a una parada de destino usando el autobús TUS de Santander.",
    {
      parada_origen: z
        .string()
        .describe('Número de la parada de origen (ej: "539")'),
      parada_destino: z
        .string()
        .describe('Número de la parada de destino (ej: "1234")'),
    },
    async ({ parada_origen, parada_destino }) => {
      if (parada_origen === parada_destino) {
        return err("La parada de origen y destino son la misma.");
      }

      const resultado = await planificarRuta(parada_origen, parada_destino);

      const hayRutas =
        resultado.rutasDirectas.length > 0 ||
        resultado.rutasConTransbordo.length > 0;

      return ok({
        ...resultado,
        resumen: hayRutas
          ? `Se encontraron ${resultado.rutasDirectas.length} ruta(s) directa(s) y ${resultado.rutasConTransbordo.length} ruta(s) con transbordo.`
          : "No se encontraron rutas entre estas paradas. Verifica los números de parada con buscar_paradas.",
      });
    }
  );

  // ─── Herramienta: ruta_desde_nombres ───────────────────────────────────────

  server.tool(
    "ruta_desde_nombres",
    "Planifica una ruta entre dos puntos buscándolos por nombre o dirección, sin necesidad de saber el número de parada.",
    {
      origen: z
        .string()
        .describe(
          'Nombre del lugar o dirección de origen (ej: "Hospital Valdecilla", "Sardinero")'
        ),
      destino: z
        .string()
        .describe(
          'Nombre del lugar o dirección de destino (ej: "Cuatro Caminos", "Plaza del Ayuntamiento")'
        ),
    },
    async ({ origen, destino }) => {
      const [paradasOrigen, paradasDestino] = await Promise.all([
        buscarParadas(origen),
        buscarParadas(destino),
      ]);

      if (paradasOrigen.length === 0) {
        return err(
          `No se encontraron paradas cerca de "${origen}". Prueba con un nombre diferente.`
        );
      }
      if (paradasDestino.length === 0) {
        return err(
          `No se encontraron paradas cerca de "${destino}". Prueba con un nombre diferente.`
        );
      }

      const paradaOrigen = paradasOrigen[0];
      const paradaDestino = paradasDestino[0];

      const resultado = await planificarRuta(
        paradaOrigen.numero,
        paradaDestino.numero
      );

      const hayRutas =
        resultado.rutasDirectas.length > 0 ||
        resultado.rutasConTransbordo.length > 0;

      return ok({
        busqueda: {
          origen: {
            terminoBuscado: origen,
            paradaSeleccionada: {
              numero: paradaOrigen.numero,
              nombre: paradaOrigen.nombre,
              direccion: paradaOrigen.direccion,
            },
            otrasParadasEncontradas: paradasOrigen.slice(1, 4).map((p) => ({
              numero: p.numero,
              nombre: p.nombre,
            })),
          },
          destino: {
            terminoBuscado: destino,
            paradaSeleccionada: {
              numero: paradaDestino.numero,
              nombre: paradaDestino.nombre,
              direccion: paradaDestino.direccion,
            },
            otrasParadasEncontradas: paradasDestino.slice(1, 4).map((p) => ({
              numero: p.numero,
              nombre: p.nombre,
            })),
          },
        },
        ruta: resultado,
        resumen: hayRutas
          ? `Se encontraron ${resultado.rutasDirectas.length} ruta(s) directa(s) y ${resultado.rutasConTransbordo.length} ruta(s) con transbordo entre "${paradaOrigen.nombre}" y "${paradaDestino.nombre}".`
          : `No se encontraron rutas directas entre "${paradaOrigen.nombre}" y "${paradaDestino.nombre}". Prueba con otras paradas cercanas usando buscar_paradas.`,
      });
    }
  );

  return server;
}

// ─── Arranque ─────────────────────────────────────────────────────────────────

if (process.env.MCP_TRANSPORT === "stdio") {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/mcp", async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.error(`TUS Santander MCP server listening on port ${port}`);
  });
}
