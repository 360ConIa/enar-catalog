/**
 * Widget de Chat IA - ENAR IA
 * Diseño inspirado en Canva IA
 * Versión 3.0
 */

class EnarIAWidget {
  constructor() {
    this.historial = [];
    this.usuario = null;
    this.isOpen = false;
    this.isExpanded = false;
    this.isProcessing = false;
    this.chatAgent = null;
    this.sugerencias = [
      { icon: '🎨', text: 'Pinturas exteriores' },
      { icon: '🛡️', text: 'Anticorrosivos' },
      { icon: '🏠', text: 'Vinilos decorativos' },
      { icon: '📋', text: 'Mi última orden' }
    ];
  }

  async init() {
    // Cargar fuentes Google
    this.cargarFuentes();

    const functions = firebase.app().functions('us-central1');
    this.chatAgent = functions.httpsCallable('chatAgent');

    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        this.usuario = user;
        this.mostrarBoton();
      } else {
        this.ocultarTodo();
      }
    });

    this.crearHTML();
    this.attachEventListeners();
  }

  cargarFuentes() {
    // Verificar si ya se cargaron las fuentes
    if (document.getElementById('enar-ia-fonts')) return;

    const link = document.createElement('link');
    link.id = 'enar-ia-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Great+Vibes&family=Allura&family=Tangerine:wght@700&family=Poppins:wght@400;700&display=swap';
    document.head.appendChild(link);
  }

  crearHTML() {
    const widgetHTML = `
      <style>
        /* ========== ENAR IA Widget Styles ========== */

        :root {
          --enar-primary: #0066B3;
          --enar-primary-dark: #004d86;
          --enar-primary-light: rgba(0, 102, 179, 0.1);
          --enar-gradient: linear-gradient(135deg, #0066B3 0%, #6B4CE6 100%);
          --enar-gradient-border: linear-gradient(135deg, #0066B3 0%, #8B5CF6 50%, #0066B3 100%);
          --enar-shadow: 0 4px 20px rgba(0, 102, 179, 0.15);
          --enar-shadow-hover: 0 8px 30px rgba(0, 102, 179, 0.25);
        }

        #enar-ia-container * {
          font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
          box-sizing: border-box;
        }

        /* Botón ENAR IA en filtros - Mismo tamaño que "Limpiar" */
        #btn-enar-ia {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 0.4rem 0.6rem 0.25rem 0.6rem;
          height: auto;
          background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
          border: 1px solid transparent;
          border-radius: 8px;
          color: white;
          font-family: 'Poppins', sans-serif;
          font-weight: 700;
          font-size: 0.75rem;
          line-height: 1.5;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 2px 6px rgba(255, 255, 255, 0.12);
          position: relative;
          overflow: visible;
          vertical-align: middle;
        }

        #btn-enar-ia:hover {
          background: linear-gradient(135deg, #1e40af 0%, #2563eb 100%);
          box-shadow: 0 3px 10px rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }

        #btn-enar-ia:focus {
          box-shadow: 0 0 0 0.2rem rgba(59, 130, 246, 0.4);
          outline: none;
        }

        #btn-enar-ia:active {
          transform: translateY(0);
          background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
        }

        #btn-enar-ia .btn-icon {
          font-size: 0.8rem;
          line-height: 1;
        }

        #btn-enar-ia .btn-text-enar {
          font-family: 'Great Vibes', 'Allura', 'Brush Script MT', cursive;
          font-weight: 400;
          font-size: 1.15rem;
          letter-spacing: 0.02em;
          line-height: 1;
          font-style: normal;
        }

        #btn-enar-ia .btn-text-ia {
          font-family: 'Poppins', sans-serif;
          font-weight: 700;
          font-size: 0.7rem;
          line-height: 1;
          letter-spacing: 0.05em;
        }

        #btn-enar-ia.active {
          background: linear-gradient(135deg, #1e40af 0%, #60a5fa 100%);
          box-shadow: 0 3px 10px rgba(255, 255, 255, 0.25);
        }

        /* Modal ENAR IA */
        #enar-ia-modal {
          position: fixed;
          bottom: 220px;
          right: 24px;
          width: 840px;
          max-width: calc(100vw - 48px);
          background: white;
          border-radius: 20px;
          box-shadow: 0 10px 50px rgba(0, 0, 0, 0.15);
          z-index: 9999;
          opacity: 0;
          visibility: hidden;
          transform: translateY(20px) scale(0.95);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
        }

        #enar-ia-modal::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 20px;
          padding: 2px;
          background: var(--enar-gradient-border);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
          opacity: 0.5;
          transition: opacity 0.3s ease;
        }

        #enar-ia-modal.open {
          opacity: 1;
          visibility: visible;
          transform: translateY(0) scale(1);
        }

        #enar-ia-modal.expanded::before {
          opacity: 1;
        }

        /* Header del modal */
        .enar-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid #f0f0f0;
          background: linear-gradient(135deg, #fafbfc 0%, #f5f7fa 100%);
        }

        .enar-modal-header .enar-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
        }

        .enar-modal-header .header-text-enar {
          font-family: 'Great Vibes', 'Allura', 'Brush Script MT', cursive !important;
          font-weight: 400 !important;
          font-size: 1.15rem !important;
          letter-spacing: 0.02em !important;
          line-height: 1 !important;
          font-style: normal !important;
          color: #1a1a2e;
        }

        .enar-modal-header .header-text-ia {
          font-family: 'Poppins', sans-serif;
          font-weight: 700;
          font-size: 0.7rem;
          color: #1a1a2e;
        }

        .enar-modal-header .header-icon {
          width: 32px;
          height: 32px;
          background: var(--enar-gradient);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 16px;
        }

        .enar-modal-close {
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #666;
          transition: all 0.2s ease;
        }

        .enar-modal-close:hover {
          background: #f0f0f0;
          color: #333;
        }

        /* Área de conversación */
        .enar-chat-area {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s ease;
          background: #fafbfc;
        }

        #enar-ia-modal.has-messages .enar-chat-area {
          max-height: 300px;
          overflow-y: auto;
        }

        .enar-messages {
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .enar-message {
          display: flex;
          gap: 10px;
          animation: messageSlide 0.3s ease;
        }

        @keyframes messageSlide {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .enar-message.user {
          flex-direction: row-reverse;
        }

        .enar-message-avatar {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 14px;
          font-weight: 600;
        }

        .enar-message.assistant .enar-message-avatar {
          background: var(--enar-gradient);
          color: white;
        }

        .enar-message.user .enar-message-avatar {
          background: #e8e8e8;
          color: #666;
        }

        .enar-message-content {
          max-width: 80%;
          padding: 12px 16px;
          border-radius: 16px;
          font-size: 14px;
          line-height: 1.5;
        }

        .enar-message.assistant .enar-message-content {
          background: white;
          color: #333;
          border: 1px solid #e8e8e8;
          border-radius: 16px 16px 16px 4px;
        }

        .enar-message.user .enar-message-content {
          background: var(--enar-primary);
          color: white;
          border-radius: 16px 16px 4px 16px;
        }

        .enar-message.error .enar-message-content {
          background: #fef2f2;
          color: #dc2626;
          border: 1px solid #fecaca;
        }

        /* Área de input */
        .enar-input-area {
          padding: 16px 20px;
          background: white;
        }

        .enar-input-wrapper {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          padding: 8px 8px 8px 16px;
          background: #f8f9fb;
          border-radius: 16px;
          border: 2px solid transparent;
          transition: all 0.3s ease;
        }

        .enar-input-wrapper:focus-within {
          background: white;
          border-color: var(--enar-primary);
          box-shadow: 0 0 0 4px var(--enar-primary-light);
        }

        .enar-input-wrapper.expanded {
          border-color: var(--enar-primary);
        }

        .enar-btn-attach {
          width: 36px;
          height: 36px;
          border: none;
          background: transparent;
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #999;
          transition: all 0.2s ease;
          flex-shrink: 0;
          opacity: 0;
          transform: scale(0.8);
          transition: all 0.3s ease;
        }

        .enar-input-wrapper.expanded .enar-btn-attach {
          opacity: 1;
          transform: scale(1);
        }

        .enar-btn-attach:hover {
          background: #e8e8e8;
          color: #666;
        }

        #enar-ia-input {
          flex: 1;
          border: none;
          background: transparent;
          font-size: 14px;
          font-weight: 400;
          color: #333;
          resize: none;
          min-height: 36px;
          max-height: 100px;
          padding: 8px 0;
          line-height: 1.4;
          outline: none;
        }

        #enar-ia-input::placeholder {
          color: #999;
          font-weight: 400;
        }

        .enar-btn-voice {
          width: 36px;
          height: 36px;
          border: none;
          background: transparent;
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #999;
          transition: all 0.2s ease;
          flex-shrink: 0;
          opacity: 0;
          transform: scale(0.8);
        }

        .enar-input-wrapper.expanded .enar-btn-voice {
          opacity: 1;
          transform: scale(1);
        }

        .enar-btn-voice:hover {
          background: #e8e8e8;
          color: #666;
        }

        .enar-btn-send {
          width: 40px;
          height: 40px;
          border: none;
          background: #e0e0e0;
          border-radius: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #999;
          transition: all 0.3s ease;
          flex-shrink: 0;
        }

        .enar-btn-send.active {
          background: var(--enar-gradient);
          color: white;
          box-shadow: 0 4px 12px rgba(0, 102, 179, 0.3);
        }

        .enar-btn-send.active:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 16px rgba(0, 102, 179, 0.4);
        }

        .enar-btn-send:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Sugerencias */
        .enar-suggestions {
          padding: 12px 20px 16px;
          background: var(--enar-primary-light);
          border-top: 1px solid rgba(0, 102, 179, 0.1);
        }

        .enar-suggestions-label {
          font-size: 11px;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 10px;
          font-weight: 500;
        }

        .enar-suggestions-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .enar-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 50px;
          font-size: 13px;
          font-weight: 400;
          color: #444;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .enar-chip:hover {
          border-color: var(--enar-primary);
          color: var(--enar-primary);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 102, 179, 0.15);
        }

        .enar-chip-icon {
          font-size: 14px;
        }

        /* Typing indicator */
        .enar-typing {
          display: none;
          align-items: center;
          gap: 10px;
          padding: 12px 20px;
          background: #fafbfc;
        }

        .enar-typing.visible {
          display: flex;
        }

        .enar-typing-dots {
          display: flex;
          gap: 4px;
        }

        .enar-typing-dots span {
          width: 8px;
          height: 8px;
          background: var(--enar-primary);
          border-radius: 50%;
          animation: typingBounce 1.4s ease-in-out infinite;
        }

        .enar-typing-dots span:nth-child(1) { animation-delay: 0s; }
        .enar-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
        .enar-typing-dots span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-8px); opacity: 1; }
        }

        .enar-typing-text {
          font-size: 13px;
          color: #666;
        }

        /* Footer */
        .enar-modal-footer {
          padding: 10px 20px;
          text-align: center;
          border-top: 1px solid #f0f0f0;
          background: white;
        }

        .enar-modal-footer p {
          margin: 0;
          font-size: 11px;
          color: #999;
        }

        /* Responsive */
        @media (max-width: 480px) {
          #enar-ia-modal {
            right: 12px;
            left: 12px;
            width: auto;
            bottom: 80px;
          }

          .enar-suggestions-chips {
            overflow-x: auto;
            flex-wrap: nowrap;
            padding-bottom: 4px;
          }
        }

        /* Backdrop */
        #enar-ia-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.2);
          z-index: 9998;
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s ease;
        }

        #enar-ia-backdrop.visible {
          opacity: 1;
          visibility: visible;
        }
      </style>

      <div id="enar-ia-container">
        <!-- Backdrop -->
        <div id="enar-ia-backdrop"></div>

        <!-- Modal ENAR IA -->
        <div id="enar-ia-modal">
          <!-- Header -->
          <div class="enar-modal-header">
            <div class="enar-title">
              <span class="header-icon">✨</span>
              <span class="header-text-enar">Enar</span>
              <span class="header-text-ia">IA</span>
            </div>
            <button class="enar-modal-close" id="enar-modal-close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <!-- Chat Area -->
          <div class="enar-chat-area">
            <div class="enar-messages" id="enar-messages"></div>
          </div>

          <!-- Typing Indicator -->
          <div class="enar-typing" id="enar-typing">
            <div class="enar-typing-dots">
              <span></span><span></span><span></span>
            </div>
            <span class="enar-typing-text">ENAR IA está escribiendo...</span>
          </div>

          <!-- Input Area -->
          <div class="enar-input-area">
            <div class="enar-input-wrapper" id="enar-input-wrapper">
              <button class="enar-btn-attach" title="Agregar contexto">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </button>
              <textarea
                id="enar-ia-input"
                placeholder="Cuéntame, ¿qué puedo hacer a tu favor?"
                rows="1"
              ></textarea>
              <button class="enar-btn-voice" title="Entrada de voz">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </button>
              <button class="enar-btn-send" id="enar-btn-send" disabled>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Sugerencias -->
          <div class="enar-suggestions" id="enar-suggestions">
            <div class="enar-suggestions-chips">
              ${this.sugerencias.map(s => `
                <button class="enar-chip" data-text="${s.text}">
                  <span class="enar-chip-icon">${s.icon}</span>
                  <span>${s.text}</span>
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Footer -->
          <div class="enar-modal-footer">
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', widgetHTML);

    // Insertar botón en la barra de filtros
    this.insertarBotonEnFiltros();
  }

  insertarBotonEnFiltros() {
    const btnLimpiar = document.getElementById('btnLimpiarFiltros');
    if (btnLimpiar) {
      const container = btnLimpiar.parentElement;

      // Crear contenedor para el botón ENAR IA (mismo tamaño que Limpiar)
      const btnContainer = document.createElement('div');
      btnContainer.className = 'col-6 col-md-3 col-lg-1';
      btnContainer.innerHTML = `
        <button id="btn-enar-ia" class="w-100">
          <span class="btn-icon">✨</span>
          <span class="btn-text-enar">Enar</span>
          <span class="btn-text-ia">IA</span>
        </button>
      `;

      // Insertar después del botón Limpiar
      container.parentNode.insertBefore(btnContainer, container.nextSibling);
    }
  }

  attachEventListeners() {
    // Botón ENAR IA
    document.addEventListener('click', (e) => {
      if (e.target.closest('#btn-enar-ia')) {
        this.toggleModal();
      }
    });

    // Cerrar modal
    document.getElementById('enar-modal-close')?.addEventListener('click', () => {
      this.closeModal();
    });

    // Backdrop
    document.getElementById('enar-ia-backdrop')?.addEventListener('click', () => {
      this.closeModal();
    });

    // Input
    const input = document.getElementById('enar-ia-input');
    const inputWrapper = document.getElementById('enar-input-wrapper');
    const sendBtn = document.getElementById('enar-btn-send');

    input?.addEventListener('focus', () => {
      inputWrapper?.classList.add('expanded');
      document.getElementById('enar-ia-modal')?.classList.add('expanded');
    });

    input?.addEventListener('input', (e) => {
      // Auto-resize
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';

      // Activar/desactivar botón enviar
      const hasText = e.target.value.trim().length > 0;
      sendBtn?.classList.toggle('active', hasText);
      if (sendBtn) sendBtn.disabled = !hasText;
    });

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.enviarMensaje();
      }
    });

    // Botón enviar
    sendBtn?.addEventListener('click', () => {
      this.enviarMensaje();
    });

    // Chips de sugerencias
    document.querySelectorAll('.enar-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.dataset.text;
        if (input) {
          input.value = text;
          input.dispatchEvent(new Event('input'));
          this.enviarMensaje();
        }
      });
    });

    // Escape para cerrar
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.closeModal();
      }
    });
  }

  mostrarBoton() {
    const btn = document.getElementById('btn-enar-ia');
    if (btn) btn.style.display = 'inline-flex';
  }

  ocultarTodo() {
    const btn = document.getElementById('btn-enar-ia');
    if (btn) btn.style.display = 'none';
    this.closeModal();
  }

  toggleModal() {
    if (this.isOpen) {
      this.closeModal();
    } else {
      this.openModal();
    }
  }

  openModal() {
    const modal = document.getElementById('enar-ia-modal');
    const backdrop = document.getElementById('enar-ia-backdrop');
    const btn = document.getElementById('btn-enar-ia');

    modal?.classList.add('open');
    backdrop?.classList.add('visible');
    btn?.classList.add('active');
    this.isOpen = true;

    setTimeout(() => {
      document.getElementById('enar-ia-input')?.focus();
    }, 300);
  }

  closeModal() {
    const modal = document.getElementById('enar-ia-modal');
    const backdrop = document.getElementById('enar-ia-backdrop');
    const btn = document.getElementById('btn-enar-ia');
    const inputWrapper = document.getElementById('enar-input-wrapper');

    modal?.classList.remove('open', 'expanded');
    backdrop?.classList.remove('visible');
    btn?.classList.remove('active');
    inputWrapper?.classList.remove('expanded');
    this.isOpen = false;
  }

  async enviarMensaje() {
    const input = document.getElementById('enar-ia-input');
    const mensaje = input?.value.trim();

    if (!mensaje || this.isProcessing) return;

    this.isProcessing = true;

    // Ocultar sugerencias
    const suggestions = document.getElementById('enar-suggestions');
    if (suggestions) suggestions.style.display = 'none';

    // Mostrar área de chat
    const modal = document.getElementById('enar-ia-modal');
    modal?.classList.add('has-messages');

    // Limpiar input
    if (input) {
      input.value = '';
      input.style.height = 'auto';
    }

    // Desactivar botón
    const sendBtn = document.getElementById('enar-btn-send');
    sendBtn?.classList.remove('active');
    if (sendBtn) sendBtn.disabled = true;

    // Agregar mensaje del usuario
    this.agregarMensaje('user', mensaje);

    // Mostrar typing
    this.mostrarTyping();

    try {
      const result = await this.chatAgent({
        mensaje: mensaje,
        historial: this.historial
      });

      const data = result.data;
      this.ocultarTyping();

      if (data.success) {
        this.agregarMensaje('assistant', data.respuesta);
        this.historial.push(
          { role: 'user', content: mensaje },
          { role: 'assistant', content: data.respuesta }
        );

        if (this.historial.length > 20) {
          this.historial = this.historial.slice(-20);
        }
      } else {
        this.agregarMensaje('error', data.respuesta || 'Error al procesar');
      }
    } catch (error) {
      console.error('Error:', error);
      this.ocultarTyping();
      this.agregarMensaje('error', 'Error de conexión. Intenta de nuevo.');
    }

    this.isProcessing = false;
  }

  agregarMensaje(role, content) {
    const container = document.getElementById('enar-messages');
    if (!container) return;

    const isUser = role === 'user';
    const isError = role === 'error';

    const avatarContent = isUser ? (this.usuario?.email?.[0]?.toUpperCase() || 'U') : 'E';

    const messageHTML = `
      <div class="enar-message ${role}">
        <div class="enar-message-avatar">${avatarContent}</div>
        <div class="enar-message-content">${this.formatearTexto(content)}</div>
      </div>
    `;

    container.insertAdjacentHTML('beforeend', messageHTML);

    // Scroll al final
    const chatArea = container.closest('.enar-chat-area');
    if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
  }

  formatearTexto(texto) {
    return texto
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code style="background:#f0f0f0;padding:2px 6px;border-radius:4px;font-size:12px;">$1</code>')
      .replace(/\n/g, '<br>');
  }

  mostrarTyping() {
    const typing = document.getElementById('enar-typing');
    typing?.classList.add('visible');
  }

  ocultarTyping() {
    const typing = document.getElementById('enar-typing');
    typing?.classList.remove('visible');
  }
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
  const widget = new EnarIAWidget();
  widget.init();
});
