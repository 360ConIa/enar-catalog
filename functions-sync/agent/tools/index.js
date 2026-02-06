/**
 * Index de MCP Tools - Agente Comercial ENAR
 * Exporta todas las herramientas del agente
 */

const { consultarCatalogo, TOOL_DEFINITION: consultarCatalogoDefinition } = require('./consultarCatalogo');
const { verificarStock, TOOL_DEFINITION: verificarStockDefinition } = require('./verificarStock');
const { crearOrden, TOOL_DEFINITION: crearOrdenDefinition } = require('./crearOrden');
const {
  consultarFichaTecnica,
  buscarProductosComplementarios,
  TOOL_DEFINITION_FICHA,
  TOOL_DEFINITION_COMPLEMENTARIOS
} = require('./consultarFichaTecnica');

// Funciones de las herramientas
const tools = {
  consultar_catalogo: consultarCatalogo,
  verificar_stock: verificarStock,
  crear_orden: crearOrden,
  consultar_ficha_tecnica: consultarFichaTecnica,
  buscar_complementarios: buscarProductosComplementarios
};

// Definiciones para Vertex AI
const toolDefinitions = [
  consultarCatalogoDefinition,
  verificarStockDefinition,
  crearOrdenDefinition,
  TOOL_DEFINITION_FICHA,
  TOOL_DEFINITION_COMPLEMENTARIOS
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
