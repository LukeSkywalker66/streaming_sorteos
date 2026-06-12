/* ═══════════════════════════════════════════════
   script.js - Sorteo detallado
   Fase 1: Espera + carrusel flyers + contador
   Fase 2: 4to → 3er → 2do → 1er premio con:
     ¡ATENTOS! → Anuncio Premio → Flyer → ¡A SORTEAR! → Ruleta → Ganador → ¡Siguiente!
   Fase 3: Resumen final + confeti
   ═══════════════════════════════════════════════ */

const STATE = {
  config: null,
  participantes: [],
  ganadores: [],
  premioActual: 0,              // índice de 0 a N-1 (pero sorteamos en reversa)
  fase: 'espera',
  cuentaRegresiva: 0,
  intervaloContador: null,
  ruletaActiva: false,
  participantesRestantes: [],
  flyers: [],
  flyerIndex: 0,
  intervaloFlyers: null,
  ordenSorteo: [],              // índices en orden reverso: [3,2,1,0] para 4 premios
};

// --- Referencias al DOM ---
const DOM = {
  app: document.getElementById('app'),
  logo: document.getElementById('logo'),
  // Espera
  faseEspera: document.getElementById('fase-espera'),
  flyerA: document.getElementById('flyer-a'),
  flyerB: document.getElementById('flyer-b'),
  contador: document.getElementById('contador'),
  horaObjetivo: document.getElementById('hora-objetivo'),
  // Sorteo
  faseSorteo: document.getElementById('fase-sorteo'),
  screenAtentos: document.getElementById('screen-atentos'),
  screenAnuncio: document.getElementById('screen-anuncio'),
  anuncioNumero: document.getElementById('anuncio-numero'),
  anuncioNombre: document.getElementById('anuncio-nombre'),
  screenFlyer: document.getElementById('screen-flyer'),
  flyerPremio: document.getElementById('flyer-premio'),
  screenAccion: document.getElementById('screen-accion'),
  screenRuleta: document.getElementById('screen-ruleta'),
  premioNombreRuleta: document.getElementById('premio-nombre-ruleta'),
  ruletaBox: document.getElementById('ruleta-box'),
  ruletaNumero: document.getElementById('ruleta-numero'),
  ruletaNombre: document.getElementById('ruleta-nombre'),
  ganadorOverlay: document.getElementById('ganador-overlay'),
  ganadorNumero: document.getElementById('ganador-numero'),
  ganadorNombre: document.getElementById('ganador-nombre'),
  ganadorPremio: document.getElementById('ganador-premio'),
  screenSiguiente: document.getElementById('screen-siguiente'),
  progresoActual: document.getElementById('progreso-actual'),
  progresoTotal: document.getElementById('progreso-total'),
  // Final
  faseFinal: document.getElementById('fase-final'),
  resumenGanadores: document.getElementById('resumen-ganadores'),
};

/* ═══════════════════════════════════════════════
   LOG (envía eventos al backend para archivo)
   ═══════════════════════════════════════════════ */
function enviarLog(evento, datos) {
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evento, datos }),
  }).catch(() => {}); // silencioso: no interrumpe el sorteo si falla
}

/* ═══════════════════════════════════════════════
   ESCALADO AUTOMÁTICO
   ═══════════════════════════════════════════════ */
function ajustarEscala() {
  const scaleX = window.innerWidth / 1080;
  const scaleY = window.innerHeight / 1920;
  DOM.app.style.transform = `scale(${Math.min(scaleX, scaleY, 1)})`;
}
window.addEventListener('resize', ajustarEscala);

/* ═══════════════════════════════════════════════
   INICIALIZACIÓN
   ═══════════════════════════════════════════════ */
async function init() {
  try {
    const [configRes, partRes] = await Promise.all([
      fetch('/api/config'),
      fetch('/api/participantes'),
    ]);
    STATE.config = await configRes.json();
    STATE.participantes = await partRes.json();

    console.log('📋 Config:', STATE.config);
    console.log(`👥 ${STATE.participantes.length} participantes`);

    if (STATE.participantes.length === 0) generarParticipantesDemo();
    if (STATE.participantes.length < STATE.config.premios.length) {
      console.warn('⚠️ Menos participantes que premios. Se reutilizarán si hace falta.');
    }

    ajustarEscala();
    aplicarConfigVisual();
    iniciarFaseEspera();

    // Log de inicio
    enviarLog('SORTEO_INICIADO', {
      participantes: STATE.participantes.length,
      premios: STATE.config.premios,
      horaSorteo: STATE.config.horaSorteo || '(minutos)',
      minutosEspera: STATE.config.minutosEspera,
    });
  } catch (err) {
    console.error('❌ Error:', err);
    document.body.innerHTML = `<div style="color:#fff;text-align:center;padding-top:400px;font-size:40px;font-family:sans-serif;background:#0a0a0f;width:100vw;height:100vh;">
      <p>⚠️ Error al cargar configuración.</p>
      <p style="font-size:24px;color:#888;">Verificá que el servidor esté corriendo.</p>
      <p style="font-size:20px;color:#666;margin-top:40px;">${err.message}</p></div>`;
  }
}

function generarParticipantesDemo() {
  const demo = ['Carlos Rodríguez','María Fernández','José Martínez','Ana García',
    'Luis Hernández','Laura López','Pedro González','Sofía Ramírez','Diego Torres','Valentina Flores',
    'Andrés Sánchez','Camila Díaz','Javier Morales','Martina Ruiz','Gabriel Pérez','Lucía Álvarez',
    'Facundo Gómez','Florencia Castro','Santiago Vargas','Julieta Medina','Matías Herrera','Bianca Ríos',
    'Emiliano Suárez','Agustina Acosta','Ignacio Benítez','Renata Núñez','Leonardo Ponce','Antonella Rojas',
    'Sebastián Silva','Victoria Mendoza','Nicolás Campos','Carolina Ferreyra','Alejandro Juárez','Delfina Navarro',
    'Maximiliano Vega','Lourdes Sosa','Daniel Pereyra','Bárbara Arias','Tomás Molina','Constanza Ledesma'];
  STATE.participantes = demo.map((n,i) => ({ numero: String(1001+i), nombre: n }));
}

/* ═══════════════════════════════════════════════
   CONFIGURACIÓN VISUAL
   ═══════════════════════════════════════════════ */
function aplicarConfigVisual() {
  const cfg = STATE.config;
  DOM.logo.src = cfg.rutaLogo;
  DOM.logo.onerror = () => { DOM.logo.src = generarLogoPlaceholder(); };

  STATE.flyers = [cfg.rutaFlyer, ...(cfg.flyersPromo || [])].filter(Boolean);
  STATE.flyerIndex = 0;
  cargarFlyer(DOM.flyerA, STATE.flyers[0]);
  if (STATE.flyers.length > 1) cargarFlyer(DOM.flyerB, STATE.flyers[1]);

  DOM.progresoTotal.textContent = cfg.premios.length;

  // Construir orden de sorteo: reverso (4to → 1er)
  STATE.ordenSorteo = cfg.premios.map((_, i) => i).reverse();
  // Ej: 4 premios → [3, 2, 1, 0]

  if (cfg.horaSorteo) {
    DOM.horaObjetivo.textContent = `🕒 Sorteo programado: ${cfg.horaSorteo} hs (ARG)`;
    DOM.horaObjetivo.classList.remove('hidden');
  }
}

function cargarFlyer(imgEl, src) {
  imgEl.src = src;
  imgEl.onerror = () => { imgEl.src = generarFlyerPlaceholder(); };
}

function generarLogoPlaceholder() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="90" viewBox="0 0 280 90">
    <defs><filter id="g"><feGaussianBlur stdDeviation="3"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <text x="140" y="58" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="900" fill="#00f0ff" filter="url(#g)">LOGO</text>
  </svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function generarFlyerPlaceholder() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0a0a2e"/><stop offset="100%" stop-color="#1a0a2e"/></linearGradient>
    <filter id="g"><feGaussianBlur stdDeviation="4"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <rect width="800" height="1000" fill="url(#bg)"/>
    <rect x="20" y="20" width="760" height="960" rx="20" fill="none" stroke="#00f0ff" stroke-width="2" opacity="0.5"/>
    <text x="400" y="420" text-anchor="middle" font-family="sans-serif" font-size="80" font-weight="900" fill="#00f0ff" filter="url(#g)">SORTEO</text>
    <text x="400" y="520" text-anchor="middle" font-family="sans-serif" font-size="50" font-weight="700" fill="#ff00aa" filter="url(#g)">EN VIVO</text>
    <text x="400" y="700" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#888">Flyer no disponible</text>
  </svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/* ═══════════════════════════════════════════════
   FASE 1: ESPERA
   ═══════════════════════════════════════════════ */
function iniciarFaseEspera() {
  STATE.fase = 'espera';
  DOM.faseEspera.classList.remove('hidden');
  DOM.faseSorteo.classList.add('hidden');
  DOM.faseFinal.classList.add('hidden');

  const cfg = STATE.config;
  if (cfg.horaSorteo) {
    STATE.cuentaRegresiva = calcularSegundosHastaHora(cfg.horaSorteo);
    console.log(`🕒 Hora objetivo: ${cfg.horaSorteo}. Faltan ${STATE.cuentaRegresiva}s`);
  } else {
    STATE.cuentaRegresiva = cfg.minutosEspera * 60;
    console.log(`⏱️ Modo minutos: ${cfg.minutosEspera} min → ${STATE.cuentaRegresiva}s`);
  }

  if (STATE.cuentaRegresiva <= 0) {
    console.warn('⚠️ Hora ya pasó. Usando MINUTOS_ESPERA de fallback.');
    STATE.cuentaRegresiva = cfg.minutosEspera * 60;
    DOM.horaObjetivo.classList.add('hidden');
  }

  actualizarDisplayContador();
  STATE.intervaloContador = setInterval(tickContador, 1000);

  if (STATE.flyers.length > 1) {
    STATE.intervaloFlyers = setInterval(rotarFlyer, 8000);
  }
}

function calcularSegundosHastaHora(horaStr) {
  const [h, m] = horaStr.split(':').map(Number);
  const ahora = new Date();
  const objetivo = new Date(ahora);
  objetivo.setHours(h, m, 0, 0);
  if (objetivo <= ahora) objetivo.setDate(objetivo.getDate() + 1);
  return Math.floor((objetivo - ahora) / 1000);
}

function tickContador() {
  STATE.cuentaRegresiva--;
  if (STATE.cuentaRegresiva <= 0) {
    clearInterval(STATE.intervaloContador);
    STATE.intervaloContador = null;
    detenerCarruselFlyers();
    transicionASorteo();
    return;
  }
  actualizarDisplayContador();
}

function actualizarDisplayContador() {
  const t = Math.max(STATE.cuentaRegresiva, 0);
  const hh = Math.floor(t / 3600);
  const mm = Math.floor((t % 3600) / 60);
  const ss = t % 60;
  DOM.contador.textContent = hh > 0
    ? `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
    : `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  DOM.contador.classList.toggle('urgente', t <= 30);
}

function rotarFlyer() {
  STATE.flyerIndex = (STATE.flyerIndex + 1) % STATE.flyers.length;
  const nextSrc = STATE.flyers[STATE.flyerIndex];
  const activeEl = DOM.flyerA.classList.contains('flyer-active') ? DOM.flyerA : DOM.flyerB;
  const hiddenEl = DOM.flyerA.classList.contains('flyer-active') ? DOM.flyerB : DOM.flyerA;
  cargarFlyer(hiddenEl, nextSrc);
  activeEl.classList.remove('flyer-active'); activeEl.classList.add('flyer-next');
  hiddenEl.classList.remove('flyer-next');  hiddenEl.classList.add('flyer-active');
}

function detenerCarruselFlyers() {
  if (STATE.intervaloFlyers) { clearInterval(STATE.intervaloFlyers); STATE.intervaloFlyers = null; }
}

/* ═══════════════════════════════════════════════
   TRANSICIÓN ESPERA → SORTEO
   ═══════════════════════════════════════════════ */
function transicionASorteo() {
  console.log('🎰 Iniciando fase de sorteo...');
  DOM.faseEspera.style.opacity = '0';
  DOM.faseEspera.style.transform = 'scale(1.05)';

  setTimeout(() => {
    DOM.faseEspera.classList.add('hidden');
    DOM.faseEspera.style.opacity = '';
    DOM.faseEspera.style.transform = '';
    DOM.faseSorteo.classList.remove('hidden');

    STATE.participantesRestantes = [...STATE.participantes];
    STATE.ganadores = [];
    STATE.premioActual = 0;
    DOM.progresoActual.textContent = '1';

    // Iniciar secuencia de sorteo detallada
    setTimeout(() => ejecutarSecuenciaPremio(), 800);
  }, 800);
}

/* ═══════════════════════════════════════════════
   SECUENCIA COMPLETA POR PREMIO
   ═══════════════════════════════════════════════ */
const LABELS_PREMIO = ['1er PREMIO', '2do PREMIO', '3er PREMIO', '4to PREMIO'];
// Como ordenSorteo es reverso: [3,2,1,0], el índice 0 del orden es 3 → "4to PREMIO"

function ejecutarSecuenciaPremio() {
  const idxOrden = STATE.premioActual;
  if (idxOrden >= STATE.ordenSorteo.length) {
    // Todos los premios sorteados
    transicionAFinal();
    return;
  }

  const idxPremio = STATE.ordenSorteo[idxOrden]; // índice real en config.premios
  const premio = STATE.config.premios[idxPremio];
  const label = LABELS_PREMIO[idxPremio]; // "4to PREMIO", "3er PREMIO", etc.
  const esPrimero = idxOrden === 0;        // ¿Es el primero de la secuencia (4to)?
  const esUltimo = idxOrden === STATE.ordenSorteo.length - 1; // ¿Es el último (1er)?

  console.log(`🎁 Secuencia: ${label} → ${premio} (índice real ${idxPremio})`);

  DOM.progresoActual.textContent = idxOrden + 1;

  // Elegir ganador (lo hacemos ahora, no se muestra hasta la ruleta)
  if (STATE.participantesRestantes.length === 0) {
    STATE.participantesRestantes = [...STATE.participantes];
    console.warn('⚠️ Lista repuesta.');
  }
  const idxAleat = Math.floor(Math.random() * STATE.participantesRestantes.length);
  const ganador = STATE.participantesRestantes.splice(idxAleat, 1)[0];
  STATE.ganadores.push({ premio, numero: ganador.numero, nombre: ganador.nombre });
  console.log(`👤 Ganador: #${ganador.numero} ${ganador.nombre}`);
  enviarLog('GANADOR', {
    premio,
    numero: ganador.numero,
    nombre: ganador.nombre,
    orden: idxOrden + 1,
    label,
  });

  // Encadenar las pantallas con retardos
  // Paso 0: ¡ATENTOS! (solo la primera vez)
  const iniciar = () => {
    if (esPrimero) {
      mostrarScreen(DOM.screenAtentos, () => {
        setTimeout(() => paso1_anuncio(), 2000);
      });
    } else {
      paso1_anuncio();
    }
  };

  // Paso 1: Anuncio del premio (3 seg)
  const paso1_anuncio = () => {
    DOM.anuncioNumero.textContent = label;
    DOM.anuncioNombre.textContent = premio;
    mostrarScreen(DOM.screenAnuncio, () => {
      setTimeout(() => paso2_flyer(), 3000);
    });
  };

  // Paso 2: Flyer del premio (4 seg)
  const paso2_flyer = () => {
    const flyerSrc = STATE.config.flyersPremio && STATE.config.flyersPremio[idxPremio];
    if (flyerSrc) {
      DOM.flyerPremio.src = flyerSrc;
      DOM.flyerPremio.onerror = () => { DOM.flyerPremio.src = generarFlyerPlaceholder(); };
    } else {
      DOM.flyerPremio.src = generarFlyerPlaceholder();
    }
    mostrarScreen(DOM.screenFlyer, () => {
      setTimeout(() => paso3_accion(), 4000);
    });
  };

  // Paso 3: ¡A SORTEAR! (2 seg)
  const paso3_accion = () => {
    mostrarScreen(DOM.screenAccion, () => {
      setTimeout(() => paso4_ruleta(ganador, premio), 2000);
    });
  };

  // Paso 4: Ruleta (5 seg) + Ganador (10 seg)
  const paso4_ruleta = (gan, prem) => {
    DOM.premioNombreRuleta.textContent = prem;
    DOM.ganadorOverlay.classList.remove('visible');
    DOM.ruletaBox.classList.remove('winner-stop');
    DOM.ruletaNumero.classList.remove('blur');
    DOM.ruletaNombre.classList.remove('blur');
    DOM.ruletaNumero.textContent = '----';
    DOM.ruletaNombre.textContent = '????';

    mostrarScreen(DOM.screenRuleta, () => {
      ejecutarRuleta(gan, () => {
        // Mostrar ganador
        DOM.ganadorNumero.textContent = gan.numero;
        DOM.ganadorNombre.textContent = gan.nombre;
        DOM.ganadorPremio.textContent = `🎁 ${prem}`;
        setTimeout(() => {
          DOM.ganadorOverlay.classList.add('visible');
        }, 600);

        // Después de 10 seg, decidir siguiente paso
        setTimeout(() => {
          if (esUltimo) {
            transicionAFinal();
          } else {
            paso5_siguiente();
          }
        }, 10000);
      });
    });
  };

  // Paso 5: ¡SIGUIENTE PREMIO! (2 seg)
  const paso5_siguiente = () => {
    mostrarScreen(DOM.screenSiguiente, () => {
      setTimeout(() => {
        STATE.premioActual++;
        ejecutarSecuenciaPremio();
      }, 2000);
    });
  };

  iniciar();
}

/* ═══════════════════════════════════════════════
   HELPERS DE PANTALLAS
   ═══════════════════════════════════════════════ */

/** Oculta todas las screens, luego muestra la indicada con callback al terminar la transición */
function mostrarScreen(screenEl, onDone) {
  // Ocultar todas
  const todas = [
    DOM.screenAtentos, DOM.screenAnuncio, DOM.screenFlyer,
    DOM.screenAccion, DOM.screenRuleta, DOM.screenSiguiente,
  ];
  todas.forEach(s => {
    if (s !== screenEl && !s.classList.contains('hidden')) {
      s.classList.add('hidden');
    }
  });

  // Mostrar la elegida
  screenEl.classList.remove('hidden');
  // Forzar reflow para que la transición funcione
  void screenEl.offsetWidth;

  if (onDone) {
    // La transición CSS dura 0.5s; esperamos eso más un pequeño margen
    setTimeout(onDone, 550);
  }
}

/* ═══════════════════════════════════════════════
   RULETA
   ═══════════════════════════════════════════════ */
function ejecutarRuleta(ganadorFinal, callback) {
  STATE.ruletaActiva = true;
  DOM.ruletaBox.classList.add('spinning');

  const DURACION = 5000;
  const inicio = performance.now();

  function tickRuleta(now) {
    const elapsed = now - inicio;
    if (elapsed >= DURACION) {
      DOM.ruletaNumero.textContent = ganadorFinal.numero;
      DOM.ruletaNombre.textContent = ganadorFinal.nombre;
      DOM.ruletaBox.classList.remove('spinning');
      DOM.ruletaBox.classList.add('winner-stop');
      DOM.ruletaNumero.classList.remove('blur');
      DOM.ruletaNombre.classList.remove('blur');
      STATE.ruletaActiva = false;
      if (callback) callback();
      return;
    }

    const progreso = elapsed / DURACION;
    const intervalo = 50 + progreso * progreso * 350;
    const rand = STATE.participantes[Math.floor(Math.random() * STATE.participantes.length)];

    DOM.ruletaNumero.textContent = rand.numero;
    DOM.ruletaNombre.textContent = rand.nombre;

    if (intervalo < 120) {
      DOM.ruletaNumero.classList.add('blur');
      DOM.ruletaNombre.classList.add('blur');
    } else {
      DOM.ruletaNumero.classList.remove('blur');
      DOM.ruletaNombre.classList.remove('blur');
    }

    setTimeout(() => {
      if (STATE.ruletaActiva) requestAnimationFrame(tickRuleta);
    }, intervalo);
  }

  requestAnimationFrame(tickRuleta);
}

/* ═══════════════════════════════════════════════
   TRANSICIÓN A FASE FINAL
   ═══════════════════════════════════════════════ */
function transicionAFinal() {
  console.log('🏆 Sorteo finalizado.');

  enviarLog('SORTEO_FINALIZADO', {
    ganadores: STATE.ganadores.map(g => ({
      premio: g.premio,
      numero: g.numero,
      nombre: g.nombre,
    })),
  });
  DOM.faseSorteo.style.opacity = '0';
  DOM.faseSorteo.style.transform = 'scale(1.05)';

  setTimeout(() => {
    DOM.faseSorteo.classList.add('hidden');
    DOM.faseSorteo.style.opacity = '';
    DOM.faseSorteo.style.transform = '';
    DOM.faseFinal.classList.remove('hidden');
    STATE.fase = 'final';
    construirResumen();
    lanzarConfeti();
  }, 800);
}

function construirResumen() {
  const emojis = ['🥇', '🥈', '🥉', '🏅'];
  DOM.resumenGanadores.innerHTML = STATE.ganadores
    .map((g, i) => `
      <div class="resumen-item">
        <span class="resumen-emoji">${emojis[i] || '🎁'}</span>
        <div class="resumen-info">
          <span class="resumen-premio">${g.premio}</span>
          <span class="resumen-ganador-numero">Cliente #${g.numero}</span>
          <span class="resumen-ganador-nombre">${g.nombre}</span>
        </div>
      </div>`)
    .join('');
}

/* ═══════════════════════════════════════════════
   CONFETI
   ═══════════════════════════════════════════════ */
function lanzarConfeti() {
  if (typeof confetti !== 'function') { console.warn('⚠️ confetti no disponible.'); return; }

  const duration = 15 * 1000;
  const end = Date.now() + duration;
  const defs = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };
  const rnd = (a,b) => Math.random()*(b-a)+a;

  const iv = setInterval(() => {
    const left = end - Date.now();
    if (left <= 0) return clearInterval(iv);
    const n = 50 * (left / duration);
    confetti({...defs, particleCount:n, origin:{x:rnd(0.1,0.3), y:Math.random()-0.2}, colors:['#00f0ff','#ff00aa','#ffd700','#00ff88','#fff']});
    confetti({...defs, particleCount:n, origin:{x:rnd(0.7,0.9), y:Math.random()-0.2}, colors:['#00f0ff','#ff00aa','#ffd700','#00ff88','#fff']});
    confetti({...defs, particleCount:n*0.6, origin:{x:0.5,y:0.4}, spread:180, startVelocity:40, colors:['#ffd700','#ff00aa','#00f0ff']});
  }, 250);

  setTimeout(()=>confetti({particleCount:300,spread:180,origin:{x:0.5,y:0.4},colors:['#ffd700','#00f0ff','#ff00aa','#00ff88','#fff'],startVelocity:45,ticks:100}),300);
  setTimeout(()=>confetti({particleCount:200,spread:180,origin:{x:0.5,y:0.4},colors:['#ffd700','#00f0ff','#ff00aa','#00ff88','#fff'],startVelocity:45,ticks:100}),1500);
  setTimeout(()=>confetti({particleCount:150,spread:180,origin:{x:0.5,y:0.4},colors:['#ffd700','#00f0ff','#ff00aa'],startVelocity:50,ticks:120}),3000);
}

document.addEventListener('DOMContentLoaded', init);
