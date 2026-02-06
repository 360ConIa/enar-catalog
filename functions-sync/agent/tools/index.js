/**
 * Index de Tools - Agente Comercial ENAR
 * v3.1 - Con agregar_carrito en lugar de crear_orden
 */

const { consultarCatalogo, TOOL_DEFINITION: consultarCatalogoDefinition } = require('./consultarCatalogo');
const { agregarCarrito, TOOL_DEFINITION: agregarCarritoDefinition } = require('./agregarCarrito');
const { consultarFichaTecnica, TOOL_DEFINITION_FICHA } = require('./consultarFichaTecnica');

// 3 herramientas esenciales
const tools = {
  consultar_catalogo: consultarCatalogo,
  agregar_carrito: agregarCarrito,
  consultar_ficha_tecnica: consultarFichaTecnica
};

const toolDefinitions = [
  consultarCatalogoDefinition,
  agregarCarritoDefinition,
  TOOL_DEFINITION_FICHA
];

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
