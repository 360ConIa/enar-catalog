/**
 * Widget de Chat IA - Asesor Comercial Farmaweb
 * Interfaz para interactuar con el agente IA
 */

class ChatWidget {
  constructor() {
    this.historial = [];
    this.usuario = null;
    this.isOpen = false;
    this.chatAgent = null;
  }

  /**
   * Inicializa el widget de chat
   */
  async init() {
    // Inicializar Callable Function
    const functions = firebase.app().functions('us-central1');
    this.chatAgent = functions.httpsCallable('chatAgent');

    // Verificar autenticación
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        this.usuario = user;
        this.mostrarWidget();
      } else {
        this.ocultarWidget();
      }
    });

    // Crear elementos del DOM
    this.crearHTML();
    this.attachEventListeners();
  }

  /**
   * Crea el HTML del widget
   */
  crearHTML() {
    const widgetHTML = `
      <!-- Botón flotante -->
      <div id="chat-fab" class="fixed bottom-6 right-6 z-50 hidden">
        <button class="bg-gradient-to-r from-[#ff9410] to-[#18aed1] text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-110">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
          </svg>
        </button>
      </div>

      <!-- Widget de chat -->
      <div id="chat-widget" class="fixed bottom-24 right-6 w-96 h-[600px] bg-white rounded-lg shadow-2xl z-50 flex flex-col hidden">
        <!-- Header -->
        <div class="bg-gradient-to-r from-[#ff9410] to-[#18aed1] text-white p-4 rounded-t-lg flex justify-between items-center">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span class="font-semibold">Asesor Comercial</span>
          </div>
          <button id="chat-close" class="hover:bg-white/20 rounded p-1 transition">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <!-- Mensajes -->
        <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          <!-- Mensaje de bienvenida -->
          <div class="flex gap-2">
            <div class="flex-shrink-0">
              <div class="w-8 h-8 rounded-full bg-gradient-to-r from-[#ff9410] to-[#18aed1] flex items-center justify-center text-white text-sm font-bold">
                F
              </div>
            </div>
            <div class="bg-white rounded-lg p-3 shadow-sm max-w-[80%]">
              <p class="text-gray-800">¡Hola! Soy el Asesor Comercial de Farmaweb. ¿En qué puedo ayudarte hoy? 😊</p>
            </div>
          </div>
        </div>

        <!-- Indicador de escritura -->
        <div id="typing-indicator" class="px-4 py-2 hidden">
          <div class="flex gap-2 items-center">
            <div class="w-8 h-8 rounded-full bg-gradient-to-r from-[#ff9410] to-[#18aed1] flex items-center justify-center">
              <div class="flex gap-1">
                <div class="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style="animation-delay: 0s"></div>
                <div class="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                <div class="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style="animation-delay: 0.4s"></div>
              </div>
            </div>
            <span class="text-sm text-gray-500">Escribiendo...</span>
          </div>
        </div>

        <!-- Input -->
        <div class="p-4 border-t bg-white rounded-b-lg">
          <div class="flex gap-2">
            <input
              type="text"
              id="chat-input"
              placeholder="Escribe tu mensaje..."
              class="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#ff9410]"
            />
            <button
              id="chat-send"
              class="bg-gradient-to-r from-[#ff9410] to-[#18aed1] text-white rounded-lg px-4 py-2 hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', widgetHTML);
  }

  /**
   * Adjunta event listeners
   */
  attachEventListeners() {
    // Botón flotante
    document.getElementById('chat-fab').addEventListener('click', () => {
      this.toggleWidget();
    });

    // Botón cerrar
    document.getElementById('chat-close').addEventListener('click', () => {
      this.toggleWidget();
    });

    // Botón enviar
    document.getElementById('chat-send').addEventListener('click', () => {
      this.enviarMensaje();
    });

    // Enter en input
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.enviarMensaje();
      }
    });
  }

  /**
   * Muestra el widget (usuario autenticado)
   */
  mostrarWidget() {
    document.getElementById('chat-fab').classList.remove('hidden');
  }

  /**
   * Oculta el widget (usuario no autenticado)
   */
  ocultarWidget() {
    document.getElementById('chat-fab').classList.add('hidden');
    document.getElementById('chat-widget').classList.add('hidden');
    this.isOpen = false;
  }

  /**
   * Toggle del widget
   */
  toggleWidget() {
    const widget = document.getElementById('chat-widget');
    this.isOpen = !this.isOpen;

    if (this.isOpen) {
      widget.classList.remove('hidden');
      document.getElementById('chat-input').focus();
    } else {
      widget.classList.add('hidden');
    }
  }

  /**
   * Envía mensaje al agente
   */
  async enviarMensaje() {
    const input = document.getElementById('chat-input');
    const mensaje = input.value.trim();

    if (!mensaje) return;

    // Limpiar input
    input.value = '';

    // Mostrar mensaje del usuario
    this.agregarMensaje('user', mensaje);

    // Mostrar indicador de escritura
    this.mostrarTyping();

    try {
      // Llamar a la Callable Function (autenticación automática)
      const result = await this.chatAgent({
        mensaje: mensaje,
        historial: this.historial
      });

      const data = result.data;

      // Ocultar indicador
      this.ocultarTyping();

      if (data.success) {
        // Mostrar respuesta del agente
        this.agregarMensaje('assistant', data.respuesta);

        // Actualizar historial
        this.historial.push(
          { role: 'user', content: mensaje },
          { role: 'assistant', content: data.respuesta }
        );

        // Limitar historial a últimos 10 mensajes
        if (this.historial.length > 20) {
          this.historial = this.historial.slice(-20);
        }
      } else {
        this.agregarMensaje('error', data.respuesta || 'Error al procesar el mensaje');
      }

    } catch (error) {
      console.error('Error:', error);
      this.ocultarTyping();

      // Manejar errores de Firebase Functions
      const errorMessage = error.message || 'Error de conexión. Por favor intenta de nuevo.';
      this.agregarMensaje('error', errorMessage);
    }
  }

  /**
   * Agrega mensaje al chat
   */
  agregarMensaje(role, content) {
    const container = document.getElementById('chat-messages');
    const isUser = role === 'user';
    const isError = role === 'error';

    const messageHTML = `
      <div class="flex gap-2 ${isUser ? 'flex-row-reverse' : ''}">
        ${!isUser ? `
          <div class="flex-shrink-0">
            <div class="w-8 h-8 rounded-full bg-gradient-to-r from-[#ff9410] to-[#18aed1] flex items-center justify-center text-white text-sm font-bold">
              F
            </div>
          </div>
        ` : ''}
        <div class="${isUser ? 'bg-[#ff9410] text-white' : isError ? 'bg-red-100 text-red-800' : 'bg-white text-gray-800'} rounded-lg p-3 shadow-sm max-w-[80%]">
          <p class="whitespace-pre-wrap">${this.formatearTexto(content)}</p>
        </div>
      </div>
    `;

    container.insertAdjacentHTML('beforeend', messageHTML);
    container.scrollTop = container.scrollHeight;
  }

  /**
   * Formatea texto (markdown básico)
   */
  formatearTexto(texto) {
    return texto
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  /**
   * Muestra indicador de escritura
   */
  mostrarTyping() {
    document.getElementById('typing-indicator').classList.remove('hidden');
    const container = document.getElementById('chat-messages');
    container.scrollTop = container.scrollHeight;
  }

  /**
   * Oculta indicador de escritura
   */
  ocultarTyping() {
    document.getElementById('typing-indicator').classList.add('hidden');
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  const chatWidget = new ChatWidget();
  chatWidget.init();
});
