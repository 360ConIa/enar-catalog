/**
 * Configuración del Agente IA - Asesor Comercial ENAR
 * Integra Google AI Studio + Gemini + Tools
 * v2.0 - 2026-02-03 - Migrado a @google/generative-ai SDK
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const SYSTEM_PROMPT = require('./systemPrompt');
const { toolDefinitions, executeTool } = require('./tools');

// API Key desde variable de entorno (secreto de Firebase)
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';

// Límite de historial para optimizar costos (últimos N mensajes)
const MAX_HISTORY_MESSAGES = 10;

// Inicializar Google Generative AI
const genAI = new GoogleGenerativeAI(API_KEY);

// Obtener modelo generativo
const generativeModel = genAI.getGenerativeModel({
  model: MODEL,
  systemInstruction: SYSTEM_PROMPT,
  generationConfig: {
    temperature: 0.3,
    maxOutputTokens: 512,
    topP: 0.9
  }
});

/**
 * Procesa un mensaje del usuario y genera respuesta del agente
 *
 * @param {string} mensaje - Mensaje del usuario
 * @param {Array} historial - Historial de la conversación (opcional)
 * @param {string} userId - ID del usuario autenticado (para crear órdenes)
 * @returns {Promise<Object>} Respuesta del agente y herramientas usadas
 */
async function procesarMensaje(mensaje, historial = [], userId = null) {
  // Guardar userId en contexto global para las herramientas
  global.currentUserId = userId;

  try {
    // Limitar historial para optimizar costos (últimos N mensajes)
    const historialLimitado = historial.slice(-MAX_HISTORY_MESSAGES);

    // Construir contenido del chat
    const chatHistory = historialLimitado.map(msg => ({
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
    let functionCalls = response.functionCalls ? response.functionCalls() : null;

    while (functionCalls && functionCalls.length > 0) {
      const functionResponses = [];

      // Ejecutar cada herramienta solicitada
      for (const call of functionCalls) {
        console.log(`Ejecutando herramienta: ${call.name}`, call.args);

        try {
          // Inyectar user_id automáticamente para crear_orden
          let args = call.args;
          if (call.name === 'crear_orden' && userId) {
            args = { ...args, user_id: userId };
          }

          const toolResult = await executeTool(call.name, args);

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
      functionCalls = response.functionCalls ? response.functionCalls() : null;
    }

    // Obtener texto final de la respuesta
    finalText = response.text();

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
