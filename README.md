# TUS Santander MCP Server

Servidor MCP para consultar en tiempo real el servicio de autobuses urbanos TUS (Transportes Urbanos de Santander). Conecta con la API de datos abiertos del Ayuntamiento de Santander.

## Instalación

```bash
cd tus-mcp
npm install
```

## Configuración en Claude Desktop

Añade esto a tu `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tus-santander": {
      "command": "node",
      "args": ["C:/Users/Usuario/Documents/Programacion/tus-mcp/src/index.js"]
    }
  }
}
```

## Herramientas disponibles

### Líneas

| Herramienta | Descripción |
|---|---|
| `listar_lineas` | Lista todas las líneas TUS activas (32 líneas) |
| `info_linea` | Secuencia completa de paradas de una línea por sentido |

### Paradas

| Herramienta | Descripción |
|---|---|
| `buscar_paradas` | Busca paradas por nombre o dirección |
| `info_parada` | Detalle de una parada por su número |
| `paradas_cercanas` | Paradas más cercanas a unas coordenadas GPS |

### Tiempo real

| Herramienta | Descripción |
|---|---|
| `estimaciones_parada` | Próximos autobuses en una parada (tiempo real) |
| `estimaciones_linea` | Posición de los buses de una línea (tiempo real) |

### Planificación

| Herramienta | Descripción |
|---|---|
| `planificar_ruta` | Ruta entre dos números de parada |
| `ruta_desde_nombres` | Ruta entre dos puntos por nombre/dirección |

## Ejemplos de uso

```
¿Cuánto tarda el próximo bus en la parada 539?
→ estimaciones_parada { numero_parada: "539" }

¿Qué líneas de bus pasan por el Sardinero?
→ buscar_paradas { texto: "Sardinero" }

¿Cómo llego desde Valdecilla al mercado de la Esperanza?
→ ruta_desde_nombres { origen: "Valdecilla", destino: "Esperanza" }

¿Cuáles son las paradas de la línea 15?
→ info_linea { numero_linea: "15", sentido: "ida" }

¿Qué buses hay cerca de la Plaza del Ayuntamiento?
→ paradas_cercanas { latitud: 43.4628, longitud: -3.8044 }
```

## Fuentes de datos

- **Paradas** (462): `datos.santander.es/api/rest/datasets/paradas_bus.json`
- **Líneas** (32): `datos.santander.es/api/rest/datasets/lineas_bus.json`
- **Secuencia de paradas** (2437): `datos.santander.es/api/rest/datasets/lineas_bus_secuencia.json`
- **Estimaciones tiempo real** (~780): `datos.santander.es/api/rest/datasets/control_flotas_estimaciones.json`
