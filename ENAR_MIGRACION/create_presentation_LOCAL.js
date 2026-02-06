const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const {
  FaUsers, FaMapMarkedAlt, FaMobileAlt, FaRobot, FaHandshake,
  FaMoneyBillWave, FaChartLine, FaCogs, FaClipboardCheck, FaRocket,
  FaStore, FaTruck, FaPercentage, FaUserTie, FaCalendarCheck,
  FaWhatsapp, FaDatabase, FaFileInvoiceDollar, FaRoute, FaBullseye,
  FaCreditCard, FaShoppingCart, FaBoxes, FaUserCheck, FaClock,
  FaCheckCircle, FaTimesCircle, FaExclamationTriangle, FaFileContract,
  FaSearch, FaList, FaHistory, FaBell
} = require("react-icons/fa");

// ENAR Official Color Palette
const COLORS = {
  // Primary
  redEnar: "D9232D",
  redHover: "b91c25",
  blueLight: "3b82f6",
  blueDark: "1e3a8a",

  // Status
  success: "28a745",
  warning: "ffc107",
  danger: "dc3545",
  info: "17a2b8",

  // Neutral
  background: "f5f7fa",
  white: "ffffff",
  text: "212529",
  textLight: "6c757d",
  border: "dee2e6",

  // Table
  rowOdd: "e3eef5",
  rowEven: "ffffff",
  rowHover: "fde8e8"
};

// Helper function to render icons
function renderIconSvg(IconComponent, color = "#000000", size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}

async function iconToBase64Png(IconComponent, color, size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}

// Load logo
function loadImageAsBase64(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
  return `${mimeType};base64,${imageBuffer.toString("base64")}`;
}

async function createPresentation() {
  let pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';
  pres.author = 'ENAR SAS';
  pres.title = 'Plan de Representación por Zonas - ENAR B2B';

  // Load ENAR logo (RUTA LOCAL)
  const logoPath = "./logo-enar.png";
  const logoBase64 = loadImageAsBase64(logoPath);

  // Load gradient images (RUTAS LOCALES)
  const headerGradientPath = "./header_gradient.png";
  const headerGradient = loadImageAsBase64(headerGradientPath);
  const titleGradientPath = "./title_gradient.png";
  const titleGradient = loadImageAsBase64(titleGradientPath);

  // Pre-render all icons with ENAR colors
  const icons = {
    users: await iconToBase64Png(FaUsers, "#" + COLORS.white),
    usersBlue: await iconToBase64Png(FaUsers, "#" + COLORS.blueDark),
    map: await iconToBase64Png(FaMapMarkedAlt, "#" + COLORS.redEnar),
    mobile: await iconToBase64Png(FaMobileAlt, "#" + COLORS.redEnar),
    mobileWhite: await iconToBase64Png(FaMobileAlt, "#" + COLORS.white),
    robot: await iconToBase64Png(FaRobot, "#" + COLORS.redEnar),
    robotWhite: await iconToBase64Png(FaRobot, "#" + COLORS.white),
    handshake: await iconToBase64Png(FaHandshake, "#" + COLORS.redEnar),
    money: await iconToBase64Png(FaMoneyBillWave, "#" + COLORS.redEnar),
    moneyWhite: await iconToBase64Png(FaMoneyBillWave, "#" + COLORS.white),
    chart: await iconToBase64Png(FaChartLine, "#" + COLORS.redEnar),
    cogs: await iconToBase64Png(FaCogs, "#" + COLORS.redEnar),
    clipboard: await iconToBase64Png(FaClipboardCheck, "#" + COLORS.redEnar),
    rocket: await iconToBase64Png(FaRocket, "#" + COLORS.white),
    store: await iconToBase64Png(FaStore, "#" + COLORS.redEnar),
    storeWhite: await iconToBase64Png(FaStore, "#" + COLORS.white),
    truck: await iconToBase64Png(FaTruck, "#" + COLORS.redEnar),
    percent: await iconToBase64Png(FaPercentage, "#" + COLORS.redEnar),
    percentWhite: await iconToBase64Png(FaPercentage, "#" + COLORS.white),
    userTie: await iconToBase64Png(FaUserTie, "#" + COLORS.blueDark),
    calendar: await iconToBase64Png(FaCalendarCheck, "#" + COLORS.redEnar),
    whatsapp: await iconToBase64Png(FaWhatsapp, "#" + COLORS.success),
    database: await iconToBase64Png(FaDatabase, "#" + COLORS.blueDark),
    invoice: await iconToBase64Png(FaFileInvoiceDollar, "#" + COLORS.redEnar),
    route: await iconToBase64Png(FaRoute, "#" + COLORS.blueDark),
    target: await iconToBase64Png(FaBullseye, "#" + COLORS.redEnar),
    creditCard: await iconToBase64Png(FaCreditCard, "#" + COLORS.blueDark),
    creditCardWhite: await iconToBase64Png(FaCreditCard, "#" + COLORS.white),
    cart: await iconToBase64Png(FaShoppingCart, "#" + COLORS.redEnar),
    cartWhite: await iconToBase64Png(FaShoppingCart, "#" + COLORS.white),
    boxes: await iconToBase64Png(FaBoxes, "#" + COLORS.redEnar),
    userCheck: await iconToBase64Png(FaUserCheck, "#" + COLORS.success),
    clock: await iconToBase64Png(FaClock, "#" + COLORS.warning),
    checkCircle: await iconToBase64Png(FaCheckCircle, "#" + COLORS.success),
    timesCircle: await iconToBase64Png(FaTimesCircle, "#" + COLORS.danger),
    exclamation: await iconToBase64Png(FaExclamationTriangle, "#" + COLORS.warning),
    contract: await iconToBase64Png(FaFileContract, "#" + COLORS.blueDark),
    search: await iconToBase64Png(FaSearch, "#" + COLORS.blueDark),
    list: await iconToBase64Png(FaList, "#" + COLORS.blueDark),
    history: await iconToBase64Png(FaHistory, "#" + COLORS.blueDark),
    bell: await iconToBase64Png(FaBell, "#" + COLORS.redEnar)
  };

  // Helper function for gradient header (using real gradient image)
  function addGradientHeader(slide, title) {
    // Gradient header image (135deg from #1e3a8a to #3b82f6)
    slide.addImage({
      data: headerGradient,
      x: 0, y: 0, w: 10, h: 0.85
    });
    // Red animated line
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0.85, w: 10, h: 0.06, fill: { color: COLORS.redEnar }
    });
    // Title
    slide.addText(title, {
      x: 0.5, y: 0.2, w: 9, h: 0.55,
      fontSize: 26, fontFace: "Calibri", color: COLORS.white, bold: true
    });
  }

  // ============================================
  // SLIDE 1: TITLE SLIDE
  // ============================================
  let slide1 = pres.addSlide();
  // Gradient background (real gradient image)
  slide1.background = { data: titleGradient };

  // Red accent line at top
  slide1.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 0.12, fill: { color: COLORS.redEnar }
  });

  // Logo (proporción 2:1)
  slide1.addImage({ data: logoBase64, x: 0.5, y: 0.8, w: 2.4, h: 1.2 });

  // Title
  slide1.addText("ENAR B2B", {
    x: 0.5, y: 2.3, w: 9, h: 0.8,
    fontSize: 52, fontFace: "Calibri", color: COLORS.white, bold: true
  });

  slide1.addText("✨ Asesor comercial con IA integrado al catálogo", {
    x: 0.5, y: 3.05, w: 9, h: 0.45,
    fontSize: 18, fontFace: "Calibri", color: COLORS.white, italic: true
  });

  // Red line divider
  slide1.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 3.6, w: 2.5, h: 0.06, fill: { color: COLORS.redEnar }
  });

  slide1.addText("Plan de Representación por Zonas Geográficas", {
    x: 0.5, y: 3.8, w: 9, h: 0.5,
    fontSize: 24, fontFace: "Calibri", color: COLORS.white, bold: true
  });

  slide1.addText("Modelo de Negocio para Representantes Comerciales en Colombia", {
    x: 0.5, y: 4.3, w: 9, h: 0.4,
    fontSize: 14, fontFace: "Calibri", color: COLORS.rowOdd
  });

  slide1.addText("Enero 2026", {
    x: 0.5, y: 5.1, w: 3, h: 0.3,
    fontSize: 12, fontFace: "Calibri", color: COLORS.textLight
  });

  // ============================================
  // SLIDE 2: EXECUTIVE SUMMARY
  // ============================================
  let slide2 = pres.addSlide();
  slide2.background = { color: COLORS.background };
  addGradientHeader(slide2, "Resumen Ejecutivo");

  // Small logo in corner
  slide2.addImage({ data: logoBase64, x: 8.4, y: 0.12, w: 1.2, h: 0.6 });

  // Content cards - 2x2 grid
  const summaryCards = [
    { title: "Objetivo", text: "Expandir la red de distribución de ENAR a través de representantes zonales que atiendan negocios minoristas de materiales de construcción.", icon: icons.target, x: 0.5, y: 1.15 },
    { title: "Cliente Objetivo", text: "Ferreterías, depósitos de materiales, tiendas de construcción y negocios que vendan directamente al consumidor final.", icon: icons.store, x: 5.1, y: 1.15 },
    { title: "Modelo", text: "Representantes por comisión pura, sin salario fijo, con territorio exclusivo y herramientas tecnológicas de soporte.", icon: icons.handshake, x: 0.5, y: 3.25 },
    { title: "Diferenciador", text: "Plataforma ENAR B2B con IA integrada para autogeneración de órdenes + acompañamiento personalizado y asistencia técnica remota.", icon: icons.robot, x: 5.1, y: 3.25 }
  ];

  summaryCards.forEach(card => {
    slide2.addShape(pres.shapes.RECTANGLE, {
      x: card.x, y: card.y, w: 4.4, h: 1.9, fill: { color: COLORS.white },
      shadow: { type: "outer", blur: 3, offset: 1, angle: 45, opacity: 0.2 }
    });
    slide2.addShape(pres.shapes.RECTANGLE, {
      x: card.x, y: card.y, w: 0.08, h: 1.9, fill: { color: COLORS.redEnar }
    });
    slide2.addImage({ data: card.icon, x: card.x + 0.25, y: card.y + 0.2, w: 0.5, h: 0.5 });
    slide2.addText(card.title, {
      x: card.x + 0.9, y: card.y + 0.25, w: 3.3, h: 0.4,
      fontSize: 16, fontFace: "Calibri", color: COLORS.blueDark, bold: true, margin: 0
    });
    slide2.addText(card.text, {
      x: card.x + 0.25, y: card.y + 0.85, w: 4.0, h: 1.0,
      fontSize: 12, fontFace: "Calibri", color: COLORS.text, valign: "top"
    });
  });

  // ============================================
  // SLIDE 3: ENAR B2B APP - MAIN FEATURES
  // ============================================
  let slide3 = pres.addSlide();
  slide3.background = { color: COLORS.background };
  addGradientHeader(slide3, "Plataforma ENAR B2B - Catálogo de Autogestión");
  slide3.addImage({ data: logoBase64, x: 8.4, y: 0.12, w: 1.2, h: 0.6 });

  // Main app description
  slide3.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.15, w: 4.4, h: 4.2, fill: { color: COLORS.white },
    shadow: { type: "outer", blur: 4, offset: 2, angle: 45, opacity: 0.15 }
  });

  // App mockup header
  slide3.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.15, w: 4.4, h: 0.7, fill: { color: COLORS.blueDark }
  });
  slide3.addImage({ data: logoBase64, x: 0.65, y: 1.22, w: 0.55, h: 0.45 });
  slide3.addText("ENAR B2B", {
    x: 1.25, y: 1.28, w: 2, h: 0.35,
    fontSize: 14, fontFace: "Calibri", color: COLORS.white, bold: true, margin: 0
  });
  slide3.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.85, w: 4.4, h: 0.05, fill: { color: COLORS.redEnar }
  });

  // App features list
  const appFeatures = [
    { icon: icons.search, text: "Búsqueda inteligente de productos" },
    { icon: icons.list, text: "Catálogo con precios mayoristas" },
    { icon: icons.cart, text: "Carrito de compras integrado" },
    { icon: icons.history, text: "Historial de órdenes de compra" },
    { icon: icons.bell, text: "Notificaciones de stock y ofertas" }
  ];

  appFeatures.forEach((feat, i) => {
    const y = 2.1 + (i * 0.58);
    slide3.addImage({ data: feat.icon, x: 0.7, y: y, w: 0.35, h: 0.35 });
    slide3.addText(feat.text, {
      x: 1.15, y: y + 0.05, w: 3.5, h: 0.35,
      fontSize: 12, fontFace: "Calibri", color: COLORS.text
    });
  });

  // IA Feature highlight
  slide3.addShape(pres.shapes.RECTANGLE, {
    x: 0.65, y: 4.85, w: 4.1, h: 0.4, fill: { color: COLORS.rowHover }
  });
  slide3.addImage({ data: icons.robot, x: 0.75, y: 4.88, w: 0.3, h: 0.3 });
  slide3.addText("IA: Autogeneración de órdenes de compra", {
    x: 1.15, y: 4.92, w: 3.4, h: 0.3,
    fontSize: 11, fontFace: "Calibri", color: COLORS.redEnar, bold: true
  });

  // Right side - Key benefits
  slide3.addText("Beneficios Clave", {
    x: 5.2, y: 1.15, w: 4, h: 0.4,
    fontSize: 18, fontFace: "Calibri", color: COLORS.blueDark, bold: true
  });

  const benefits = [
    { icon: icons.checkCircle, title: "Pedidos 24/7", desc: "Clientes ordenan desde cualquier lugar" },
    { icon: icons.checkCircle, title: "Reducción 70% tiempo", desc: "Menos tiempo en toma de pedidos" },
    { icon: icons.checkCircle, title: "Cero errores", desc: "Elimina errores de digitación" },
    { icon: icons.checkCircle, title: "Precios según cliente", desc: "Lógica de precios personalizada" },
    { icon: icons.checkCircle, title: "Stock en tiempo real", desc: "Disponibilidad actualizada al instante" },
    { icon: icons.checkCircle, title: "Plataforma amigable", desc: "Máximo rendimiento e interfaz intuitiva" }
  ];

  benefits.forEach((ben, i) => {
    const y = 1.7 + (i * 0.58);
    slide3.addShape(pres.shapes.RECTANGLE, {
      x: 5.2, y: y, w: 4.3, h: 0.52, fill: { color: COLORS.white },
      shadow: { type: "outer", blur: 2, offset: 1, angle: 45, opacity: 0.1 }
    });
    slide3.addImage({ data: ben.icon, x: 5.32, y: y + 0.08, w: 0.35, h: 0.35 });
    slide3.addText(ben.title, {
      x: 5.75, y: y + 0.05, w: 3.6, h: 0.22,
      fontSize: 11, fontFace: "Calibri", color: COLORS.blueDark, bold: true, margin: 0
    });
    slide3.addText(ben.desc, {
      x: 5.75, y: y + 0.27, w: 3.6, h: 0.2,
      fontSize: 9, fontFace: "Calibri", color: COLORS.textLight, margin: 0
    });
  });

  // ============================================
  // SLIDE 4: APP FEATURES - CATALOG & CART
  // ============================================
  let slide4 = pres.addSlide();
  slide4.background = { color: COLORS.background };
  addGradientHeader(slide4, "ENAR B2B - Catálogo y Carrito de Compras");
  slide4.addImage({ data: logoBase64, x: 8.4, y: 0.12, w: 1.2, h: 0.6 });

  // Left - Catalog mockup
  slide4.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.15, w: 4.6, h: 4.2, fill: { color: COLORS.white },
    shadow: { type: "outer", blur: 3, offset: 1, angle: 45, opacity: 0.15 }
  });

  // Catalog header
  slide4.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.15, w: 4.6, h: 0.45, fill: { color: COLORS.rowHover }
  });
  slide4.addText("📦 Catálogo de Productos", {
    x: 0.65, y: 1.22, w: 4, h: 0.35,
    fontSize: 14, fontFace: "Calibri", color: COLORS.redEnar, bold: true
  });

  // Table header
  slide4.addShape(pres.shapes.RECTANGLE, {
    x: 0.6, y: 1.7, w: 4.4, h: 0.35, fill: { color: COLORS.blueDark }
  });
  slide4.addText("CÓDIGO     PRODUCTO                    STOCK   P.MAYORISTA", {
    x: 0.7, y: 1.75, w: 4.2, h: 0.25,
    fontSize: 8, fontFace: "Consolas", color: COLORS.white
  });

  // Sample rows
  const products = [
    { code: "SR", name: "Soldadura Pvc 1/128", stock: "5709", price: "$1.641" },
    { code: "LR", name: "Limpiador Pvc-Cpvc", stock: "4749", price: "$1.402" },
    { code: "SS", name: "Soldadura Pvc 1/64", stock: "2541", price: "$2.803" },
    { code: "EQ", name: "Enarcril Bolsa", stock: "1425", price: "$6.082" },
    { code: "PY", name: "Pegante Amarillo 60", stock: "1185", price: "$1.950" }
  ];

  products.forEach((prod, i) => {
    const y = 2.1 + (i * 0.38);
    const bgColor = i % 2 === 0 ? COLORS.rowOdd : COLORS.rowEven;
    slide4.addShape(pres.shapes.RECTANGLE, {
      x: 0.6, y: y, w: 4.4, h: 0.36, fill: { color: bgColor }
    });
    slide4.addText(`${prod.code}        ${prod.name}`, {
      x: 0.7, y: y + 0.08, w: 2.8, h: 0.22,
      fontSize: 8, fontFace: "Calibri", color: COLORS.text
    });
    slide4.addText(prod.stock, {
      x: 3.4, y: y + 0.08, w: 0.6, h: 0.22,
      fontSize: 8, fontFace: "Calibri", color: COLORS.blueLight, bold: true
    });
    slide4.addText(prod.price, {
      x: 4.1, y: y + 0.08, w: 0.8, h: 0.22,
      fontSize: 8, fontFace: "Calibri", color: COLORS.redEnar, bold: true
    });
  });

  // Filters note
  slide4.addText("Filtros: Categoría • Marca • Ofertas", {
    x: 0.65, y: 4.1, w: 4.3, h: 0.25,
    fontSize: 9, fontFace: "Calibri", color: COLORS.textLight, italic: true
  });

  // Right - Cart mockup
  slide4.addShape(pres.shapes.RECTANGLE, {
    x: 5.3, y: 1.15, w: 4.2, h: 4.2, fill: { color: COLORS.white },
    shadow: { type: "outer", blur: 3, offset: 1, angle: 45, opacity: 0.15 }
  });

  slide4.addText("🛒 Carrito de Compras", {
    x: 5.45, y: 1.25, w: 3.8, h: 0.35,
    fontSize: 14, fontFace: "Calibri", color: COLORS.text, bold: true
  });

  // Cart items
  const cartItems = [
    { name: "Soldadura Pvc 1/64", qty: "3", price: "$8.408" },
    { name: "Limpiador Pvc-Cpvc 1/64", qty: "3", price: "$6.379" },
    { name: "Soldadura Pvc 1/32", qty: "6", price: "$27.835" }
  ];

  cartItems.forEach((item, i) => {
    const y = 1.75 + (i * 0.65);
    slide4.addShape(pres.shapes.RECTANGLE, {
      x: 5.45, y: y, w: 3.9, h: 0.55, fill: { color: COLORS.background }
    });
    slide4.addText(item.name, {
      x: 5.55, y: y + 0.08, w: 2.5, h: 0.22,
      fontSize: 10, fontFace: "Calibri", color: COLORS.text, bold: true
    });
    slide4.addText(`Cant: ${item.qty}`, {
      x: 5.55, y: y + 0.3, w: 1, h: 0.2,
      fontSize: 9, fontFace: "Calibri", color: COLORS.textLight
    });
    slide4.addText(item.price, {
      x: 8.2, y: y + 0.15, w: 1, h: 0.25,
      fontSize: 12, fontFace: "Calibri", color: COLORS.text, bold: true, align: "right"
    });
  });

  // Total section
  slide4.addShape(pres.shapes.RECTANGLE, {
    x: 5.45, y: 3.85, w: 3.9, h: 0.05, fill: { color: COLORS.redEnar }
  });
  slide4.addText("Total (IVA incluido):", {
    x: 5.55, y: 3.98, w: 2.2, h: 0.3,
    fontSize: 12, fontFace: "Calibri", color: COLORS.redEnar, bold: true
  });
  slide4.addText("$42.621", {
    x: 7.8, y: 3.95, w: 1.5, h: 0.35,
    fontSize: 16, fontFace: "Calibri", color: COLORS.redEnar, bold: true, align: "right"
  });

  // Buttons
  slide4.addShape(pres.shapes.RECTANGLE, {
    x: 5.55, y: 4.45, w: 1.7, h: 0.4, fill: { color: COLORS.textLight }
  });
  slide4.addText("Vaciar carrito", {
    x: 5.55, y: 4.52, w: 1.7, h: 0.3,
    fontSize: 10, fontFace: "Calibri", color: COLORS.white, align: "center"
  });
  slide4.addShape(pres.shapes.RECTANGLE, {
    x: 7.45, y: 4.45, w: 1.7, h: 0.4, fill: { color: COLORS.redEnar }
  });
  slide4.addText("Crear Orden", {
    x: 7.45, y: 4.52, w: 1.7, h: 0.3,
    fontSize: 10, fontFace: "Calibri", color: COLORS.white, align: "center", bold: true
  });

  // ============================================
  // SLIDE 5: BUSINESS MODEL
  // ============================================
  let slide5 = pres.addSlide();
  slide5.background = { color: COLORS.background };
  addGradientHeader(slide5, "Modelo de Negocio: Representante de Zona");
  slide5.addImage({ data: logoBase64, x: 8.4, y: 0.12, w: 1.2, h: 0.6 });

  // Left column
  slide5.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.15, w: 4.4, h: 4.2, fill: { color: COLORS.white },
    shadow: { type: "outer", blur: 3, offset: 1, angle: 45, opacity: 0.15 }
  });
  slide5.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.15, w: 4.4, h: 0.5, fill: { color: COLORS.blueDark }
  });
  slide5.addText("¿Qué es el Representante de Zona?", {
    x: 0.7, y: 1.22, w: 4.0, h: 0.4,
    fontSize: 14, fontFace: "Calibri", color: COLORS.white, bold: true
  });

  slide5.addText([
    { text: "Profesional comercial independiente que:", options: { breakLine: true } },
    { text: "", options: { breakLine: true } },
    { text: "Representa exclusivamente a ENAR en un territorio geográfico definido", options: { bullet: true, breakLine: true } },
    { text: "Visita negocios minoristas para captar nuevos clientes", options: { bullet: true, breakLine: true } },
    { text: "Capacita clientes en el uso de la plataforma ENAR B2B", options: { bullet: true, breakLine: true } },
    { text: "Coordina entregas y frecuencias", options: { bullet: true, breakLine: true } },
    { text: "Apoya en el proceso de cobranza", options: { bullet: true, breakLine: true } },
    { text: "Gana comisión sobre ventas realizadas", options: { bullet: true } }
  ], {
    x: 0.7, y: 1.75, w: 4.0, h: 3.5,
    fontSize: 11, fontFace: "Calibri", color: COLORS.text, valign: "top"
  });

  // Right column
  slide5.addShape(pres.shapes.RECTANGLE, {
    x: 5.1, y: 1.15, w: 4.4, h: 4.2, fill: { color: COLORS.white },
    shadow: { type: "outer", blur: 3, offset: 1, angle: 45, opacity: 0.15 }
  });
  slide5.addShape(pres.shapes.RECTANGLE, {
    x: 5.1, y: 1.15, w: 4.4, h: 0.5, fill: { color: COLORS.success }
  });
  slide5.addText("Beneficios del Modelo", {
    x: 5.3, y: 1.22, w: 4.0, h: 0.4,
    fontSize: 14, fontFace: "Calibri", color: COLORS.white, bold: true
  });

  slide5.addText([
    { text: "Para ENAR:", options: { bold: true, breakLine: true } },
    { text: "Expansión sin costos fijos de nómina", options: { bullet: true, breakLine: true } },
    { text: "Presencia local con conocimiento de mercado", options: { bullet: true, breakLine: true } },
    { text: "Escalabilidad rápida a nuevas zonas", options: { bullet: true, breakLine: true } },
    { text: "", options: { breakLine: true } },
    { text: "Para el Representante:", options: { bold: true, breakLine: true } },
    { text: "Ingresos ilimitados según desempeño", options: { bullet: true, breakLine: true } },
    { text: "Flexibilidad horaria y autonomía", options: { bullet: true, breakLine: true } },
    { text: "Territorio exclusivo protegido", options: { bullet: true, breakLine: true } },
    { text: "Plataforma tecnológica de soporte", options: { bullet: true } }
  ], {
    x: 5.3, y: 1.75, w: 4.0, h: 3.5,
    fontSize: 11, fontFace: "Calibri", color: COLORS.text, valign: "top"
  });

  // ============================================
  // SLIDE 6: SALES CONDITIONS - CASH VS CREDIT
  // ============================================
  let slide6 = pres.addSlide();
  slide6.background = { color: COLORS.background };
  addGradientHeader(slide6, "Condiciones de Venta: Contado vs Crédito");
  slide6.addImage({ data: logoBase64, x: 8.4, y: 0.12, w: 1.2, h: 0.6 });

  // CASH PAYMENT CARD
  slide6.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.15, w: 4.4, h: 4.15, fill: { color: COLORS.white },
    shadow: { type: "outer", blur: 3, offset: 1, angle: 45, opacity: 0.15 }
  });
  slide6.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.15, w: 4.4, h: 0.7, fill: { color: COLORS.success }
  });
  slide6.addImage({ data: icons.moneyWhite, x: 0.7, y: 1.28, w: 0.45, h: 0.45 });
  slide6.addText("PAGO DE CONTADO", {
    x: 1.25, y: 1.35, w: 3.4, h: 0.4,
    fontSize: 18, fontFace: "Calibri", color: COLORS.white, bold: true, margin: 0
  });

  slide6.addText([
    { text: "Beneficios:", options: { bold: true, color: COLORS.success, breakLine: true } },
    { text: "", options: { breakLine: true } },
    { text: "3% de descuento sobre el total", options: { bullet: true, breakLine: true } },
    { text: "Prioridad en despacho", options: { bullet: true, breakLine: true } },
    { text: "Sin documentación adicional", options: { bullet: true, breakLine: true } },
    { text: "Acceso inmediato al catálogo completo", options: { bullet: true, breakLine: true } },
    { text: "", options: { breakLine: true } },
    { text: "Condiciones:", options: { bold: true, color: COLORS.blueDark, breakLine: true } },
    { text: "", options: { breakLine: true } },
    { text: "Pedido mínimo: $500.000 COP", options: { bullet: true, breakLine: true } },
    { text: "Pago antes del despacho", options: { bullet: true, breakLine: true } },
    { text: "Transferencia, efectivo o datáfono", options: { bullet: true } }
  ], {
    x: 0.7, y: 2.0, w: 4.0, h: 3.2,
    fontSize: 12, fontFace: "Calibri", color: COLORS.text, valign: "top"
  });

  // CREDIT PAYMENT CARD
  slide6.addShape(pres.shapes.RECTANGLE, {
    x: 5.1, y: 1.15, w: 4.4, h: 4.15, fill: { color: COLORS.white },
    shadow: { type: "outer", blur: 3, offset: 1, angle: 45, opacity: 0.15 }
  });
  slide6.addShape(pres.shapes.RECTANGLE, {
    x: 5.1, y: 1.15, w: 4.4, h: 0.7, fill: { color: COLORS.blueDark }
  });
  slide6.addImage({ data: icons.creditCardWhite, x: 5.3, y: 1.28, w: 0.45, h: 0.45 });
  slide6.addText("CRÉDITO 30 DÍAS", {
    x: 5.85, y: 1.35, w: 3.4, h: 0.4,
    fontSize: 18, fontFace: "Calibri", color: COLORS.white, bold: true, margin: 0
  });

  slide6.addText([
    { text: "Requisitos para acceder:", options: { bold: true, color: COLORS.redEnar, breakLine: true } },
    { text: "", options: { breakLine: true } },
    { text: "Mínimo 3 órdenes de contado previas", options: { bullet: true, breakLine: true } },
    { text: "Antigüedad del negocio: 1 año", options: { bullet: true, breakLine: true } },
    { text: "2 referencias comerciales", options: { bullet: true, breakLine: true } },
    { text: "Cámara de comercio vigente", options: { bullet: true, breakLine: true } },
    { text: "", options: { breakLine: true } },
    { text: "Condiciones:", options: { bold: true, color: COLORS.blueDark, breakLine: true } },
    { text: "", options: { breakLine: true } },
    { text: "Cupo inicial: Según evaluación", options: { bullet: true, breakLine: true } },
    { text: "Plazo máximo: 30 días", options: { bullet: true, breakLine: true } },
    { text: "Pedido mínimo: $1.000.000 COP", options: { bullet: true } }
  ], {
    x: 5.3, y: 2.0, w: 4.0, h: 3.2,
    fontSize: 12, fontFace: "Calibri", color: COLORS.text, valign: "top"
  });

  // ============================================
  // SLIDE 7: CREDIT POLICY DETAILS
  // ============================================
  let slide7 = pres.addSlide();
  slide7.background = { color: COLORS.background };
  addGradientHeader(slide7, "Política de Crédito - Requisitos y Proceso");
  slide7.addImage({ data: logoBase64, x: 8.4, y: 0.12, w: 1.2, h: 0.6 });

  // Requirements grid
  const creditReqs = [
    { icon: icons.cart, title: "3 Órdenes Previas", desc: "Historial de compras de contado satisfactorio" },
    { icon: icons.calendar, title: "1 Año de Antigüedad", desc: "Negocio establecido con estabilidad demostrada" },
    { icon: icons.contract, title: "2 Referencias", desc: "Proveedores activos que validen comportamiento" },
    { icon: icons.clipboard, title: "Documentación", desc: "Cámara de comercio, RUT, cédula representante" }
  ];

  creditReqs.forEach((req, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.5 + (col * 4.7);
    const y = 1.15 + (row * 1.45);

    slide7.addShape(pres.shapes.RECTANGLE, {
      x: x, y: y, w: 4.5, h: 1.3, fill: { color: COLORS.white },
      shadow: { type: "outer", blur: 2, offset: 1, angle: 45, opacity: 0.1 }
    });
    slide7.addShape(pres.shapes.RECTANGLE, {
      x: x, y: y, w: 0.08, h: 1.3, fill: { color: COLORS.redEnar }
    });
    slide7.addImage({ data: req.icon, x: x + 0.25, y: y + 0.2, w: 0.5, h: 0.5 });
    slide7.addText(req.title, {
      x: x + 0.9, y: y + 0.2, w: 3.4, h: 0.35,
      fontSize: 14, fontFace: "Calibri", color: COLORS.blueDark, bold: true, margin: 0
    });
    slide7.addText(req.desc, {
      x: x + 0.9, y: y + 0.6, w: 3.4, h: 0.55,
      fontSize: 11, fontFace: "Calibri", color: COLORS.textLight
    });
  });

  // Credit limits table
  slide7.addText("Escalamiento de Cupo de Crédito", {
    x: 0.5, y: 4.15, w: 9, h: 0.35,
    fontSize: 14, fontFace: "Calibri", color: COLORS.blueDark, bold: true
  });

  // Table header
  slide7.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 4.55, w: 9, h: 0.4, fill: { color: COLORS.blueDark }
  });
  slide7.addText("NIVEL              REQUISITO                              CUPO MÁXIMO         PLAZO", {
    x: 0.6, y: 4.62, w: 8.8, h: 0.25,
    fontSize: 10, fontFace: "Calibri", color: COLORS.white, bold: true
  });

  // Table rows
  const creditLevels = [
    { level: "Inicial", req: "Aprobación de crédito", cupo: "$3.000.000", plazo: "30 días" },
    { level: "Bronce", req: "3 meses sin mora", cupo: "$5.000.000", plazo: "30 días" },
    { level: "Plata", req: "6 meses + $50M compras", cupo: "$10.000.000", plazo: "30 días" }
  ];

  creditLevels.forEach((lvl, i) => {
    const y = 4.95 + (i * 0.35);
    const bgColor = i % 2 === 0 ? COLORS.rowOdd : COLORS.rowEven;
    slide7.addShape(pres.shapes.RECTANGLE, {
      x: 0.5, y: y, w: 9, h: 0.35, fill: { color: bgColor }
    });
    slide7.addText(`${lvl.level}            ${lvl.req}                    ${lvl.cupo}          ${lvl.plazo}`, {
      x: 0.6, y: y + 0.08, w: 8.8, h: 0.22,
      fontSize: 10, fontFace: "Calibri", color: COLORS.text
    });
  });

  // ============================================
  // SLIDE 8: COMMISSION STRUCTURE
  // ============================================
  let slide8 = pres.addSlide();
  slide8.background = { color: COLORS.background };
  addGradientHeader(slide8, "Estructura de Comisiones del Representante");
  slide8.addImage({ data: logoBase64, x: 8.4, y: 0.12, w: 1.2, h: 0.6 });

  // Main model card
  slide8.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.15, w: 4.2, h: 2.0, fill: { color: COLORS.redEnar }
  });
  slide8.addImage({ data: icons.percentWhite, x: 0.7, y: 1.35, w: 0.5, h: 0.5 });
  slide8.addText("Modelo: Comisión Pura", {
    x: 1.3, y: 1.4, w: 3.0, h: 0.4,
    fontSize: 16, fontFace: "Calibri", color: COLORS.white, bold: true, margin: 0
  });
  slide8.addText([
    { text: "Sin salario base fijo", options: { breakLine: true } },
    { text: "100% variable según ventas", options: { breakLine: true } },
    { text: "Pagos quincenales", options: { breakLine: true } },
    { text: "Bonos por cumplimiento", options: { breakLine: true } }
  ], {
    x: 0.7, y: 1.95, w: 3.8, h: 1.1,
    fontSize: 11, fontFace: "Calibri", color: COLORS.white
  });

  // Commission tiers
  slide8.addText("Escala de Comisiones", {
    x: 5.0, y: 1.15, w: 4.5, h: 0.35,
    fontSize: 14, fontFace: "Calibri", color: COLORS.blueDark, bold: true
  });

  const tiers = [
    { level: "Básica", range: "Ventas $0 - $10M", percent: "5%", color: COLORS.textLight },
    { level: "Media", range: "Ventas $10M - $30M", percent: "7%", color: COLORS.blueLight },
    { level: "Alta", range: "Ventas > $30M", percent: "10%", color: COLORS.success }
  ];

  tiers.forEach((tier, i) => {
    const y = 1.6 + (i * 0.7);
    slide8.addShape(pres.shapes.RECTANGLE, {
      x: 5.0, y: y, w: 4.5, h: 0.6, fill: { color: COLORS.white },
      shadow: { type: "outer", blur: 2, offset: 1, angle: 45, opacity: 0.1 }
    });
    slide8.addShape(pres.shapes.RECTANGLE, {
      x: 5.0, y: y, w: 0.06, h: 0.6, fill: { color: tier.color }
    });
    slide8.addText(tier.level, {
      x: 5.2, y: y + 0.1, w: 1.5, h: 0.22,
      fontSize: 12, fontFace: "Calibri", color: COLORS.blueDark, bold: true
    });
    slide8.addText(tier.range, {
      x: 5.2, y: y + 0.32, w: 2.5, h: 0.22,
      fontSize: 10, fontFace: "Calibri", color: COLORS.textLight
    });
    slide8.addText(tier.percent, {
      x: 8.5, y: y + 0.12, w: 0.8, h: 0.4,
      fontSize: 20, fontFace: "Calibri", color: tier.color, bold: true
    });
  });

  // Additional incentives
  slide8.addText("Incentivos Adicionales", {
    x: 0.5, y: 3.4, w: 9, h: 0.35,
    fontSize: 14, fontFace: "Calibri", color: COLORS.blueDark, bold: true
  });

  const incentives = [
    { text: "Bono por cliente nuevo activo", value: "+$50.000" },
    { text: "Bono trimestral meta cumplida", value: "+1%" },
    { text: "Comisión recurrente recompras", value: "3%" }
  ];

  incentives.forEach((inc, i) => {
    slide8.addShape(pres.shapes.RECTANGLE, {
      x: 0.5 + (i * 3.1), y: 3.8, w: 2.9, h: 0.85, fill: { color: COLORS.rowHover },
      shadow: { type: "outer", blur: 2, offset: 1, angle: 45, opacity: 0.1 }
    });
    slide8.addText(inc.text, {
      x: 0.6 + (i * 3.1), y: 3.88, w: 2.7, h: 0.4,
      fontSize: 10, fontFace: "Calibri", color: COLORS.text
    });
    slide8.addText(inc.value, {
      x: 0.6 + (i * 3.1), y: 4.28, w: 2.7, h: 0.3,
      fontSize: 14, fontFace: "Calibri", color: COLORS.success, bold: true
    });
  });

  // Simulated earnings
  slide8.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 4.8, w: 9, h: 0.5, fill: { color: COLORS.blueDark }
  });
  slide8.addText("💡 Ejemplo: Con ventas de $25M/mes = Comisión $1.750.000 + bonos", {
    x: 0.7, y: 4.9, w: 8.6, h: 0.35,
    fontSize: 12, fontFace: "Calibri", color: COLORS.white, bold: true
  });

  // ============================================
  // SLIDE 9: OPERATIONAL PROCESS
  // ============================================
  let slide9 = pres.addSlide();
  slide9.background = { color: COLORS.background };
  addGradientHeader(slide9, "Proceso Operativo del Representante");
  slide9.addImage({ data: logoBase64, x: 8.4, y: 0.12, w: 1.2, h: 0.6 });

  // Process steps
  const steps = [
    { num: "1", title: "Prospección", desc: "Identificar negocios potenciales", icon: icons.target },
    { num: "2", title: "Visita", desc: "Presentar ENAR B2B", icon: icons.handshake },
    { num: "3", title: "Registro", desc: "Crear cuenta en la app", icon: icons.mobile },
    { num: "4", title: "Seguimiento", desc: "Coordinar entregas", icon: icons.truck },
    { num: "5", title: "Cobranza", desc: "Gestionar cartera", icon: icons.money }
  ];

  steps.forEach((step, i) => {
    const x = 0.35 + (i * 1.95);

    slide9.addShape(pres.shapes.OVAL, {
      x: x + 0.55, y: 1.2, w: 0.5, h: 0.5, fill: { color: COLORS.redEnar }
    });
    slide9.addText(step.num, {
      x: x + 0.55, y: 1.25, w: 0.5, h: 0.45,
      fontSize: 16, fontFace: "Calibri", color: COLORS.white, bold: true, align: "center", valign: "middle"
    });

    if (i < steps.length - 1) {
      slide9.addShape(pres.shapes.RECTANGLE, {
        x: x + 1.5, y: 1.4, w: 0.5, h: 0.05, fill: { color: COLORS.border }
      });
    }

    slide9.addShape(pres.shapes.RECTANGLE, {
      x: x, y: 1.85, w: 1.75, h: 1.6, fill: { color: COLORS.white },
      shadow: { type: "outer", blur: 2, offset: 1, angle: 45, opacity: 0.1 }
    });
    slide9.addImage({ data: step.icon, x: x + 0.6, y: 2.0, w: 0.5, h: 0.5 });
    slide9.addText(step.title, {
      x: x + 0.1, y: 2.6, w: 1.55, h: 0.3,
      fontSize: 11, fontFace: "Calibri", color: COLORS.blueDark, bold: true, align: "center"
    });
    slide9.addText(step.desc, {
      x: x + 0.1, y: 2.9, w: 1.55, h: 0.45,
      fontSize: 9, fontFace: "Calibri", color: COLORS.textLight, align: "center"
    });
  });

  // Weekly cycle
  slide9.addText("Ciclo Semanal del Representante", {
    x: 0.5, y: 3.7, w: 9, h: 0.35,
    fontSize: 14, fontFace: "Calibri", color: COLORS.blueDark, bold: true
  });

  const days = [
    { day: "Lun-Mié", activity: "Visitas a clientes activos y prospectos", color: COLORS.blueLight },
    { day: "Jueves", activity: "Seguimiento pedidos y entregas", color: COLORS.success },
    { day: "Viernes", activity: "Cobranza y reportes semanales", color: COLORS.redEnar }
  ];

  days.forEach((d, i) => {
    slide9.addShape(pres.shapes.RECTANGLE, {
      x: 0.5 + (i * 3.1), y: 4.1, w: 2.9, h: 0.85, fill: { color: COLORS.white },
      shadow: { type: "outer", blur: 2, offset: 1, angle: 45, opacity: 0.1 }
    });
    slide9.addShape(pres.shapes.RECTANGLE, {
      x: 0.5 + (i * 3.1), y: 4.1, w: 2.9, h: 0.28, fill: { color: d.color }
    });
    slide9.addText(d.day, {
      x: 0.5 + (i * 3.1), y: 4.13, w: 2.9, h: 0.22,
      fontSize: 11, fontFace: "Calibri", color: COLORS.white, bold: true, align: "center"
    });
    slide9.addText(d.activity, {
      x: 0.6 + (i * 3.1), y: 4.5, w: 2.7, h: 0.4,
      fontSize: 10, fontFace: "Calibri", color: COLORS.text, align: "center"
    });
  });

  // ============================================
  // SLIDE 10: KPIs
  // ============================================
  let slide10 = pres.addSlide();
  slide10.background = { color: COLORS.background };
  addGradientHeader(slide10, "Indicadores de Éxito (KPIs)");
  slide10.addImage({ data: logoBase64, x: 8.4, y: 0.12, w: 1.2, h: 0.6 });

  const kpis = [
    { metric: "15-20", unit: "clientes activos", desc: "Meta zona primer trimestre", icon: icons.store },
    { metric: "$25M", unit: "ventas/mes", desc: "Objetivo mensual representante", icon: icons.money },
    { metric: "85%", unit: "recaudo", desc: "Cartera en plazos acordados", icon: icons.chart },
    { metric: "8", unit: "visitas/día", desc: "Promedio visitas efectivas", icon: icons.route },
    { metric: "4", unit: "clientes nuevos", desc: "Captación mensual mínima", icon: icons.handshake },
    { metric: "90%", unit: "pedidos app", desc: "Adopción plataforma ENAR B2B", icon: icons.mobile }
  ];

  kpis.forEach((kpi, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.5 + (col * 3.1);
    const y = 1.15 + (row * 2.1);

    slide10.addShape(pres.shapes.RECTANGLE, {
      x: x, y: y, w: 2.9, h: 1.9, fill: { color: COLORS.white },
      shadow: { type: "outer", blur: 3, offset: 1, angle: 45, opacity: 0.15 }
    });

    slide10.addImage({ data: kpi.icon, x: x + 0.15, y: y + 0.15, w: 0.4, h: 0.4 });

    slide10.addText(kpi.metric, {
      x: x + 0.1, y: y + 0.6, w: 2.7, h: 0.5,
      fontSize: 28, fontFace: "Calibri", color: COLORS.redEnar, bold: true, align: "center"
    });
    slide10.addText(kpi.unit, {
      x: x + 0.1, y: y + 1.1, w: 2.7, h: 0.3,
      fontSize: 12, fontFace: "Calibri", color: COLORS.blueDark, bold: true, align: "center"
    });
    slide10.addText(kpi.desc, {
      x: x + 0.15, y: y + 1.45, w: 2.6, h: 0.4,
      fontSize: 9, fontFace: "Calibri", color: COLORS.textLight, align: "center"
    });
  });

  // ============================================
  // SLIDE 11: RECOMMENDED TECHNOLOGY
  // ============================================
  let slide11 = pres.addSlide();
  slide11.background = { color: COLORS.background };
  addGradientHeader(slide11, "Herramientas Tecnológicas Recomendadas");
  slide11.addImage({ data: logoBase64, x: 8.4, y: 0.12, w: 1.2, h: 0.6 });

  const tools = [
    { title: "CRM Móvil", subtitle: "Zoho, HubSpot, Pipedrive", desc: "Gestión de contactos y pipeline de ventas", icon: icons.database, x: 0.5, y: 1.15 },
    { title: "App de Ruteo", subtitle: "Badger Maps, Route4Me", desc: "Optimización de rutas y ahorro de tiempo", icon: icons.route, x: 5.1, y: 1.15 },
    { title: "WhatsApp Business API", subtitle: "Integración con ENAR B2B", desc: "Comunicación automatizada con clientes", icon: icons.whatsapp, x: 0.5, y: 2.85 },
    { title: "Firma Digital", subtitle: "DocuSign, SignNow", desc: "Contratos y acuerdos desde el celular", icon: icons.clipboard, x: 5.1, y: 2.85 }
  ];

  tools.forEach(tool => {
    slide11.addShape(pres.shapes.RECTANGLE, {
      x: tool.x, y: tool.y, w: 4.4, h: 1.5, fill: { color: COLORS.white },
      shadow: { type: "outer", blur: 3, offset: 1, angle: 45, opacity: 0.15 }
    });
    slide11.addShape(pres.shapes.RECTANGLE, {
      x: tool.x, y: tool.y, w: 0.08, h: 1.5, fill: { color: COLORS.redEnar }
    });
    slide11.addImage({ data: tool.icon, x: tool.x + 0.25, y: tool.y + 0.2, w: 0.45, h: 0.45 });
    slide11.addText(tool.title, {
      x: tool.x + 0.85, y: tool.y + 0.18, w: 3.3, h: 0.28,
      fontSize: 14, fontFace: "Calibri", color: COLORS.blueDark, bold: true, margin: 0
    });
    slide11.addText(tool.subtitle, {
      x: tool.x + 0.85, y: tool.y + 0.45, w: 3.3, h: 0.22,
      fontSize: 10, fontFace: "Calibri", color: COLORS.textLight, italic: true, margin: 0
    });
    slide11.addText(tool.desc, {
      x: tool.x + 0.25, y: tool.y + 0.85, w: 4.0, h: 0.55,
      fontSize: 11, fontFace: "Calibri", color: COLORS.text
    });
  });

  // Additional recommendations
  slide11.addText("Otras integraciones recomendadas:", {
    x: 0.5, y: 4.5, w: 9, h: 0.3,
    fontSize: 12, fontFace: "Calibri", color: COLORS.blueDark, bold: true
  });
  slide11.addText([
    { text: "Dashboard de KPIs en tiempo real (Power BI/Tableau) para monitoreo gerencial", options: { bullet: true, breakLine: true } },
    { text: "Pasarela de pagos móvil (Wompi, Mercado Pago) para recaudo en campo", options: { bullet: true, breakLine: true } },
    { text: "GPS tracking integrado para verificación de visitas realizadas", options: { bullet: true } }
  ], {
    x: 0.5, y: 4.8, w: 9.0, h: 0.8,
    fontSize: 11, fontFace: "Calibri", color: COLORS.text
  });

  // ============================================
  // SLIDE 12: NEXT STEPS
  // ============================================
  let slide12 = pres.addSlide();
  // Gradient background (real gradient image)
  slide12.background = { data: titleGradient };

  // Red accent line
  slide12.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 0.12, fill: { color: COLORS.redEnar }
  });

  // Logo (proporción 2:1)
  slide12.addImage({ data: logoBase64, x: 0.5, y: 0.4, w: 2.0, h: 1.0 });

  slide12.addText("Próximos Pasos", {
    x: 0.5, y: 1.5, w: 9, h: 0.55,
    fontSize: 32, fontFace: "Calibri", color: COLORS.white, bold: true
  });

  const nextSteps = [
    "Definir las zonas geográficas prioritarias para lanzamiento",
    "Establecer el contrato de representación y políticas de comisión",
    "Preparar material de capacitación para representantes",
    "Configurar las herramientas tecnológicas adicionales",
    "Iniciar proceso de reclutamiento y selección",
    "Lanzar programa piloto en 2-3 zonas seleccionadas"
  ];

  nextSteps.forEach((step, i) => {
    const y = 2.15 + (i * 0.52);
    slide12.addShape(pres.shapes.OVAL, {
      x: 0.5, y: y, w: 0.4, h: 0.4, fill: { color: COLORS.redEnar }
    });
    slide12.addText(String(i + 1), {
      x: 0.5, y: y + 0.03, w: 0.4, h: 0.35,
      fontSize: 14, fontFace: "Calibri", color: COLORS.white, bold: true, align: "center", valign: "middle"
    });
    slide12.addText(step, {
      x: 1.05, y: y + 0.05, w: 8.4, h: 0.35,
      fontSize: 13, fontFace: "Calibri", color: COLORS.white
    });
  });

  // Call to action
  slide12.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 5.1, w: 9, h: 0.04, fill: { color: COLORS.redEnar }
  });

  slide12.addImage({ data: icons.rocket, x: 8.8, y: 4.7, w: 0.6, h: 0.6 });

  slide12.addText("¿Listos para expandir ENAR en toda Colombia?", {
    x: 0.5, y: 5.2, w: 8, h: 0.3,
    fontSize: 14, fontFace: "Calibri", color: COLORS.rowOdd, italic: true
  });

  // Save (RUTA LOCAL)
  await pres.writeFile({ fileName: "./ENAR_B2B_Plan_Representacion_v3.pptx" });
  console.log("✅ Presentación generada: ENAR_B2B_Plan_Representacion_v3.pptx");
}

createPresentation().catch(console.error);
