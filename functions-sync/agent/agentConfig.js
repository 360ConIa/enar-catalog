/**
 * Configuración del Agente IA - Asesor Comercial ENAR
 * Integra Vertex AI + Gemini + MCP Tools
 */

const { VertexAI } = require('@google-cloud/aiplatform');
const SYSTEM_PROMPT = require('./systemPrompt');
const { toolDefinitions, executeTool } = require('./tools');

// Configuración del proyecto
const PROJECT_ID = 'enar-b2b';
const LOCATION = 'us-central1';
const MODEL = 'gemini-1.5-pro';

// Inicializar Vertex AI
const vertexAI = new VertexAI({
  project: PROJECT_ID,
  location: LOCATION
});

// Obtener modelo generativo
const generativeModel = vertexAI.getGenerativeModel({
  model: MODEL,
  systemInstruction: SYSTEM_PROMPT,
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 1024,
    topP: 0.95
  }
});

/**
 * Procesa un mensaje del usuario y genera respuesta del agente
 *
 * @param {string} mensaje - Mensaje del usuario
 * @param {Array} historial - Historial de la conversación (opcional)
 * @returns {Promise<Object>} Respuesta del agente y herramientas usadas
 */
async function procesarMensaje(mensaje, historial = []) {
  try {
    // Construir contenido del chat
    const chatHistory = historial.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // Crear sesión de chat
    const chat = generativeModel.startChat({
      history: chatHistory,
      tools: [{ functionDeclarations: toolDefinitions }]
    });

    // Enviar mensaje y obtener respuesta
    let result = await chat.sendMessage(mensaje);
    let response = result.response;

    const toolCalls = [];
    let finalText = '';

    // Procesar respuesta y llamadas a herramientas
    while (response.functionCalls && response.functionCalls.length > 0) {
      const functionResponses = [];

      // Ejecutar cada herramienta solicitada
      for (const call of response.functionCalls) {
        console.log(`Ejecutando herramienta: ${call.name}`, call.args);

        try {
          const toolResult = await executeTool(call.name, call.args);

          toolCalls.push({
            tool: call.name,
            params: call.args,
            result: toolResult
          });

          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: toolResult
            }
          });
        } catch (error) {
          console.error(`Error ejecutando ${call.name}:`, error);
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { error: error.message }
            }
          });
        }
      }

      // Enviar resultados de herramientas de vuelta al modelo
      result = await chat.sendMessage(functionResponses);
      response = result.response;
    }

    // Obtener texto final de la respuesta
    if (response.candidates && response.candidates[0]) {
      const candidate = response.candidates[0];
      if (candidate.content && candidate.content.parts) {
        finalText = candidate.content.parts
          .map(part => part.text || '')
          .join('');
      }
    }

    return {
      respuesta: finalText || 'Lo siento, no pude generar una respuesta.',
      herramientas_usadas: toolCalls,
      exito: true
    };

  } catch (error) {
    console.error('Error en procesarMensaje:', error);
    return {
      respuesta: 'Lo siento, ocurrió un error al procesar tu mensaje. Por favor intenta de nuevo.',
      error: error.message,
      exito: false
    };
  }
}

module.exports = {
  procesarMensaje
};
