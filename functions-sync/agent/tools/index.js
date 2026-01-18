/**
 * Index de MCP Tools
 * Exporta todas las herramientas del agente
 */

const { consultarCatalogo, TOOL_DEFINITION: consultarCatalogoDefinition } = require('./consultarCatalogo');
const { verificarStock, TOOL_DEFINITION: verificarStockDefinition } = require('./verificarStock');
const { crearCotizacion, TOOL_DEFINITION: crearCotizacionDefinition } = require('./crearCotizacion');

// Funciones de las herramientas
const tools = {
  consultar_catalogo: consultarCatalogo,
  verificar_stock: verificarStock,
  crear_cotizacion: crearCotizacion
};

// Definiciones para Vertex AI
const toolDefinitions = [
  consultarCatalogoDefinition,
  verificarStockDefinition,
  crearCotizacionDefinition
];

// Ejecutar herramienta por nombre
async function executeTool(toolName, parameters) {
  const tool = tools[toolName];

  if (!tool) {
    throw new Error(`Herramienta no encontrada: ${toolName}`);
  }

  return await tool(parameters);
}

module.exports = {
  tools,
  toolDefinitions,
  executeTool
};
