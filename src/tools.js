/**
 * Definiciones de las herramientas MCP del servidor TUS Santander
 */

export const TOOLS = [
  // ── Líneas ──────────────────────────────────────────────────────────────────
  {
    name: "listar_lineas",
    description:
      "Lista todas las líneas de autobús urbano TUS de Santander con su número y nombre de ruta. Úsalo para conocer qué líneas existen antes de hacer consultas más detalladas.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "info_linea",
    description:
      "Obtiene información detallada de una línea de autobús concreta, incluyendo la secuencia ordenada de paradas por sentido (ida/vuelta).",
    inputSchema: {
      type: "object",
      properties: {
        numero_linea: {
          type: "string",
          description:
            'Número o etiqueta de la línea (ej: "1", "15", "N3", "24C2")',
        },
        sentido: {
          type: "string",
          enum: ["ida", "vuelta", "ambos"],
          description:
            'Sentido de la ruta: "ida" (1), "vuelta" (2) o "ambos". Por defecto: "ambos"',
          default: "ambos",
        },
      },
      required: ["numero_linea"],
    },
  },

  // ── Paradas ─────────────────────────────────────────────────────────────────
  {
    name: "buscar_paradas",
    description:
      "Busca paradas de autobús por nombre, dirección o zona. Devuelve paradas que coincidan con el texto de búsqueda junto con sus coordenadas y número de parada.",
    inputSchema: {
      type: "object",
      properties: {
        texto: {
          type: "string",
          description:
            'Texto a buscar en nombre o dirección de la parada (ej: "Valdecilla", "Plaza del Ayuntamiento", "Sardinero")',
        },
      },
      required: ["texto"],
    },
  },
  {
    name: "info_parada",
    description:
      "Obtiene los detalles de una parada específica por su número de parada: nombre, dirección, sentido y coordenadas GPS.",
    inputSchema: {
      type: "object",
      properties: {
        numero_parada: {
          type: "string",
          description: 'Número identificador de la parada (ej: "539", "1234")',
        },
      },
      required: ["numero_parada"],
    },
  },
  {
    name: "paradas_cercanas",
    description:
      "Encuentra las paradas de autobús más cercanas a unas coordenadas GPS dadas. Útil para saber qué bus coger desde una ubicación concreta.",
    inputSchema: {
      type: "object",
      properties: {
        latitud: {
          type: "number",
          description: "Latitud en grados decimales (ej: 43.4628)",
        },
        longitud: {
          type: "number",
          description: "Longitud en grados decimales (ej: -3.8044)",
        },
        numero_resultados: {
          type: "integer",
          description: "Número de paradas cercanas a devolver (por defecto: 5)",
          default: 5,
          minimum: 1,
          maximum: 20,
        },
      },
      required: ["latitud", "longitud"],
    },
  },

  // ── Estimaciones en tiempo real ──────────────────────────────────────────────
  {
    name: "estimaciones_parada",
    description:
      "Consulta en tiempo real las estimaciones de llegada de autobuses a una parada concreta. Devuelve el tiempo en minutos y la hora estimada de llegada del próximo bus y el siguiente para cada línea que para en esa parada.",
    inputSchema: {
      type: "object",
      properties: {
        numero_parada: {
          type: "string",
          description: 'Número de la parada (ej: "539")',
        },
      },
      required: ["numero_parada"],
    },
  },
  {
    name: "estimaciones_linea",
    description:
      "Consulta en tiempo real las estimaciones de paso de todos los autobuses en circulación de una línea concreta, mostrando en qué paradas están y cuánto tardan.",
    inputSchema: {
      type: "object",
      properties: {
        numero_linea: {
          type: "string",
          description: 'Número o etiqueta de la línea (ej: "1", "15", "N3")',
        },
      },
      required: ["numero_linea"],
    },
  },

  // ── Planificación de rutas ───────────────────────────────────────────────────
  {
    name: "planificar_ruta",
    description:
      "Planifica cómo ir desde una parada de origen a una parada de destino usando el autobús TUS. Encuentra rutas directas y con transbordo, e incluye estimaciones de tiempo real del próximo bus disponible.",
    inputSchema: {
      type: "object",
      properties: {
        parada_origen: {
          type: "string",
          description: 'Número de la parada de origen (ej: "539")',
        },
        parada_destino: {
          type: "string",
          description: 'Número de la parada de destino (ej: "1234")',
        },
      },
      required: ["parada_origen", "parada_destino"],
    },
  },
  {
    name: "ruta_desde_nombres",
    description:
      "Planifica una ruta entre dos puntos buscándolos por nombre o dirección, sin necesidad de saber el número de parada. Busca las paradas más relevantes para cada punto y calcula la mejor conexión entre ellas.",
    inputSchema: {
      type: "object",
      properties: {
        origen: {
          type: "string",
          description:
            'Nombre del lugar o dirección de origen (ej: "Hospital Valdecilla", "Plaza del Ayuntamiento", "Sardinero")',
        },
        destino: {
          type: "string",
          description:
            'Nombre del lugar o dirección de destino (ej: "Cuatro Caminos", "Estadio El Sardinero")',
        },
      },
      required: ["origen", "destino"],
    },
  },
];
