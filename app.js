/* =============================================================
   PERROS DE LA ISLA — ISLA · app.js
   Rediseño Bloque 1 — estructura y estados visuales.

   Flujo: intro → cuestionario (17) → registro → riego x4 → mapa → total
   Modos de arranque:
     · directo        — flujo completo
     · cliente_activo — salta intro y registro
     · ?t=token       — recupera la evaluación y aterriza en el mapa

   NO toca la lógica de scoring ni las llamadas a Supabase
   (fetchPreguntas / submitEvaluacion / submitEvaluacionClienteActivo /
   getEvaluacion viven en supabase-client.js).
   ============================================================= */

/* ============================================================
   Constantes
   ============================================================ */

const DIMENSIONES = ['fisica', 'emocional', 'social', 'cognitiva'];

const DIM_INFO = {
  fisica: {
    label: 'Física',
    intro: 'Cuerpo, salud, energía. Lo que se ve y se toca.',
    reading: 'El cuerpo es la base. Una rutina sólida —descanso, ejercicio adecuado, revisiones— sostiene todo lo demás. Atender lo físico hoy es prevenir mañana.'
  },
  emocional: {
    label: 'Emocional',
    intro: 'Cómo se siente. Miedos, calma, regulación.',
    reading: 'Las emociones de tu perro son tan reales como las tuyas. Aprender a leerlas y acompañarlas marca la diferencia entre un perro que aguanta y un perro que vive bien.'
  },
  social: {
    label: 'Social',
    intro: 'Vínculos con personas, perros y entorno.',
    reading: 'Vivir entre personas y otros perros requiere herramientas. Las habilidades sociales se entrenan; el aislamiento no es una solución, la mediación cuidada sí.'
  },
  cognitiva: {
    label: 'Cognitiva',
    intro: 'Aprendizaje, curiosidad, resolución.',
    reading: 'Tu perro piensa, decide y resuelve. Darle problemas a su altura —olfato, masticación, exploración— es ofrecerle una vida con sentido, no solo entretenimiento.'
  }
};

/* Niveles de vegetación de la isla — definen qué archivo SVG se carga */
const LEVELS = [
  { id: 0, name: 'Árido',       min: 0,  max: 20  },
  { id: 1, name: 'Brotando',    min: 21, max: 40  },
  { id: 2, name: 'Creciendo',   min: 41, max: 60  },
  { id: 3, name: 'Floreciendo', min: 61, max: 80  },
  { id: 4, name: 'Plena',       min: 81, max: 100 }
];

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ============================================================
   Estado
   ============================================================ */

const state = {
  preguntas: [],
  indicePregunta: 0,
  nombrePerro: 'tu perro',
  tutorNombre: '',
  origen: 'directo',
  perro_id: null,
  cliente_id: null,
  es_cliente_activo: false,
  respuestas: {},          // pregunta_id -> puntos
  opcionElegidaIndex: {},  // pregunta_id -> índice de opción
  resultado: null,
  riegoIndex: 0,
  riegoRegada: false,
  riegoGrupos: null,
  totalRegado: false,
  openDim: null
};

/* ============================================================
   Arranque
   ============================================================ */

async function init() {
  const params = new URLSearchParams(window.location.search);
  state.origen = (params.get('origen') || 'directo').trim() || 'directo';
  state.perro_id = params.get('perro_id') || null;
  state.cliente_id = params.get('cliente_id') || null;
  state.es_cliente_activo = !!(state.origen === 'cliente_activo' && state.perro_id && state.cliente_id);
  const tokenURL = (params.get('t') || '').trim();

  /* Eventos estáticos */
  document.getElementById('btn-empezar').addEventListener('click', handleEmpezar);
  document.getElementById('btn-anterior').addEventListener('click', retrocederPregunta);
  document.getElementById('btn-siguiente').addEventListener('click', avanzarPregunta);
  document.getElementById('registro-form').addEventListener('submit', handleRegistro);

  try {
    state.preguntas = await fetchPreguntas();
    if (!Array.isArray(state.preguntas) || state.preguntas.length === 0) {
      mostrarErrorFatal('No hay preguntas activas en este momento. Inténtalo más tarde.');
      return;
    }

    /* Modo cliente_activo — salta intro y registro */
    if (state.es_cliente_activo) {
      iniciarCuestionario();
      return;
    }

    /* Modo recuperación por token — aterriza directo en el mapa */
    if (tokenURL) {
      try {
        const ev = await getEvaluacion(tokenURL);
        state.resultado = ev || {};
        state.resultado.token = tokenURL;
        state.nombrePerro = ev.nombre_perro || 'tu perro';
        state.tutorNombre = ev.nombre_tutor || '';
        renderMapa();
        showView('view-mapa');
        return;
      } catch (err) {
        mostrarBannerToken(err);
      }
    }

    showView('view-intro');
  } catch (err) {
    mostrarErrorFatal((err && err.message) || 'No pudimos cargar la evaluación.');
  }
}

function mostrarBannerToken(err) {
  const mensajes = {
    expirado: 'Tu enlace ha caducado. Puedes hacer una nueva evaluación si quieres.',
    no_encontrado: 'No encontramos esa evaluación. Puedes hacer una nueva.',
    borrado: 'Esa evaluación ya no está disponible. Puedes hacer una nueva.',
    invalido: 'El enlace no es válido. Puedes hacer una nueva evaluación.',
    desconocido: 'No pudimos recuperar la evaluación. Puedes hacer una nueva.'
  };
  const msg = mensajes[(err && err.tipo)] || mensajes.desconocido;
  const view = document.getElementById('view-intro');
  const banner = document.createElement('div');
  banner.className = 'banner-info';
  banner.textContent = msg;
  view.insertBefore(banner, view.firstChild);
}

function mostrarErrorFatal(msg) {
  const loading = document.getElementById('loading');
  loading.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'error';
  p.textContent = msg;
  loading.appendChild(p);
  loading.classList.remove('hidden');
}

/* ============================================================
   Navegación de pantallas
   ============================================================ */

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('loading').classList.add('hidden');

  const v = document.getElementById(id);
  if (v) {
    v.classList.remove('hidden');
    v.classList.remove('fade-enter');
    void v.offsetWidth;          // reinicia la animación de entrada
    v.classList.add('fade-enter');
  }

  /* Logo de esquina: cuestionario / registro / riego / mapa */
  const conLogo = { 'view-cuestionario': 1, 'view-registro': 1, 'view-riego': 1, 'view-mapa': 1 };
  const cl = document.getElementById('corner-logo');
  if (conLogo[id]) {
    cl.classList.remove('hidden');
    cl.classList.toggle('on-dark', id === 'view-cuestionario');
  } else {
    cl.classList.add('hidden');
  }

  window.scrollTo(0, 0);
}

/* ============================================================
   1 · Intro
   ============================================================ */

function handleEmpezar() {
  iniciarCuestionario();
}

/* ============================================================
   2 · Cuestionario
   ============================================================ */

function iniciarCuestionario() {
  state.nombrePerro = 'tu perro';
  state.indicePregunta = 0;
  state.respuestas = {};
  state.opcionElegidaIndex = {};
  document.getElementById('progress-total').textContent = state.preguntas.length;
  renderPregunta();
  showView('view-cuestionario');
}

function renderPregunta() {
  const total = state.preguntas.length;
  const idx = state.indicePregunta;
  const p = state.preguntas[idx];
  if (!p) return;

  /* Progreso */
  document.getElementById('progress-actual').textContent = String(idx + 1).padStart(2, '0');
  document.getElementById('progress-fill').style.width =
    Math.round(((idx + 1) / total) * 100) + '%';

  /* Indicador de dimensión */
  const dim = DIM_INFO[p.bloque];
  document.getElementById('dim-indicador').textContent = dim ? dim.label : p.bloque;

  /* Enunciado — antes del registro el nombre es genérico ("tu perro") */
  const enunciado = String(p.enunciado || '').replace(/\{perro\}/g, state.nombrePerro);
  document.getElementById('pregunta-enunciado').textContent = enunciado;

  /* Opciones */
  const cont = document.getElementById('pregunta-opciones');
  cont.innerHTML = '';
  const opciones = Array.isArray(p.opciones) ? p.opciones : [];
  opciones.forEach((op, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'q-option';
    if (state.opcionElegidaIndex[p.id] === i) btn.classList.add('selected');

    const bullet = document.createElement('span');
    bullet.className = 'q-bullet';
    const txt = document.createElement('span');
    txt.textContent = op.label;
    btn.appendChild(bullet);
    btn.appendChild(txt);

    btn.addEventListener('click', () => seleccionarOpcion(i));
    cont.appendChild(btn);
  });

  /* Botones de navegación */
  document.getElementById('btn-anterior').disabled = (idx === 0);
  const siguiente = document.getElementById('btn-siguiente');
  siguiente.textContent = (idx + 1 === total) ? 'Continuar' : 'Siguiente';
  siguiente.disabled = (state.opcionElegidaIndex[p.id] == null);
}

function seleccionarOpcion(i) {
  const p = state.preguntas[state.indicePregunta];
  const op = (p.opciones || [])[i];
  if (!op) return;
  state.respuestas[p.id] = op.puntos;
  state.opcionElegidaIndex[p.id] = i;

  /* Marca visual + habilita "Siguiente" sin auto-avanzar */
  document.querySelectorAll('#pregunta-opciones .q-option').forEach((b, bi) => {
    b.classList.toggle('selected', bi === i);
  });
  document.getElementById('btn-siguiente').disabled = false;
}

function retrocederPregunta() {
  if (state.indicePregunta === 0) return;
  state.indicePregunta--;
  renderPregunta();
}

function avanzarPregunta() {
  const p = state.preguntas[state.indicePregunta];
  if (state.opcionElegidaIndex[p.id] == null) return;   // pregunta sin responder

  if (state.indicePregunta + 1 < state.preguntas.length) {
    state.indicePregunta++;
    renderPregunta();
    window.scrollTo(0, 0);
  } else {
    finalizarCuestionario();
  }
}

function finalizarCuestionario() {
  if (state.es_cliente_activo) {
    submitClienteActivo();
  } else {
    showView('view-registro');
    setTimeout(() => {
      const i = document.getElementById('input-nombre-perro');
      if (i) i.focus();
    }, 60);
  }
}

/* ============================================================
   3 · Registro — puerta a los resultados
   ============================================================ */

async function handleRegistro(e) {
  e.preventDefault();

  const perro = document.getElementById('input-nombre-perro').value.trim();
  const tutor = document.getElementById('input-nombre-tutor').value.trim();
  const email = document.getElementById('input-email').value.trim();
  const rgpd  = document.getElementById('input-rgpd').checked;
  const errEl = document.getElementById('error-registro');
  const btn   = document.getElementById('btn-registro');

  /* Limpia estados de error */
  errEl.classList.add('hidden');
  ['field-perro', 'field-tutor', 'field-email'].forEach(id =>
    document.getElementById(id).classList.remove('err'));

  /* Validación */
  let error = null;
  if (perro.length < 1) {
    document.getElementById('field-perro').classList.add('err');
    error = 'Necesitamos el nombre de tu perro.';
  } else if (tutor.length < 2) {
    document.getElementById('field-tutor').classList.add('err');
    error = 'Introduce tu nombre.';
  } else if (!RE_EMAIL.test(email)) {
    document.getElementById('field-email').classList.add('err');
    error = 'Introduce un email válido.';
  } else if (!rgpd) {
    error = 'Necesitamos tu permiso para enviarte la evaluación.';
  }
  if (error) {
    errEl.textContent = error;
    errEl.classList.remove('hidden');
    return;
  }

  state.nombrePerro = perro;
  state.tutorNombre = tutor;

  const payload = {
    email: email,
    nombre_tutor: tutor,
    nombre_perro: perro,
    origen: state.origen,
    respuestas: state.respuestas
  };

  btn.disabled = true;
  btn.textContent = 'Enviando…';

  try {
    const resultado = await submitEvaluacion(payload);
    state.resultado = resultado || {};
    iniciarRiego();
  } catch (err) {
    errEl.textContent = 'No pudimos enviar la evaluación. Inténtalo de nuevo en unos segundos.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ver los resultados';
  }
}

async function submitClienteActivo() {
  const loadingEl = document.getElementById('loading');
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  loadingEl.innerHTML = '<p>Guardando evaluación…</p>';
  loadingEl.classList.remove('hidden');

  const payload = {
    perro_id: state.perro_id,
    cliente_id: state.cliente_id,
    origen: 'cliente_activo',
    respuestas: state.respuestas
  };

  try {
    const resultado = await submitEvaluacionClienteActivo(payload);
    state.resultado = resultado || {};
    if (state.resultado.nombre_perro) state.nombrePerro = state.resultado.nombre_perro;
    iniciarRiego();
  } catch (err) {
    console.error('[isla] error submit cliente activo:', err);
    loadingEl.innerHTML =
      '<p class="error">No pudimos guardar la evaluación. Inténtalo de nuevo en unos segundos.</p>';
  }
}

/* ============================================================
   Scores (devueltos por el backend — no se calculan aquí)
   ============================================================ */

function getScores() {
  const r = state.resultado || {};
  return {
    fisica:    Number(r.score_fisica) || 0,
    emocional: Number(r.score_emocional) || 0,
    social:    Number(r.score_social) || 0,
    cognitiva: Number(r.score_cognitiva) || 0
  };
}

function scoreGlobal() {
  const s = getScores();
  return Math.round((s.fisica + s.emocional + s.social + s.cognitiva) / 4);
}

function levelFromScore(score) {
  const s = Number(score) || 0;
  for (const lv of LEVELS) if (s >= lv.min && s <= lv.max) return lv;
  return LEVELS[0];
}

/* ============================================================
   4 · Riego — una pantalla por dimensión
   ============================================================ */

function iniciarRiego() {
  state.riegoIndex = 0;
  state.riegoRegada = false;
  renderRiego();
  showView('view-riego');
}

function renderRiego() {
  const dimId = DIMENSIONES[state.riegoIndex];
  const info = DIM_INFO[dimId];
  const total = DIMENSIONES.length;
  const score = getScores()[dimId];
  const targetLevel = levelFromScore(score).id;

  const html =
    '<div class="water-header">' +
      '<div class="eyebrow">Riego ' + (state.riegoIndex + 1) + ' de ' + total + '</div>' +
      '<h2 class="water-dim">' + info.label + '</h2>' +
      '<p class="water-intro">' + info.intro + '</p>' +
    '</div>' +
    '<div class="water-stage">' +
      '<div class="riego-holder">' +
        '<div class="island-stage">' +
          '<div class="island-mask" id="isla-svg"></div>' +
          '<div class="island-outline"></div>' +
        '</div>' +
        '<div class="cup-wrap disabled" id="cup-riego"></div>' +
        '<div class="drops" id="drops-riego" aria-hidden="true"></div>' +
        '<div class="score-float hidden" id="score-float">' +
          '<div class="score-label">Puntaje</div>' +
          '<div class="score-impact"><span id="score-num">0</span><span class="max"> / 100</span></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="water-foot" id="riego-foot">' +
      '<div class="water-cta">Riega para descubrir</div>' +
      '<div class="water-helper">Toca la regadera</div>' +
    '</div>';

  const body = document.getElementById('riego-body');
  body.innerHTML = html;
  state.riegoGrupos = null;

  /* El vasito se habilita cuando la isla Y la regadera están montadas. */
  const cup = body.querySelector('#cup-riego');
  let vegListo = false, regListo = false;
  const habilitar = function () {
    if (!vegListo || !regListo) return;
    cup.classList.remove('disabled');
    cup.addEventListener('click', regar);
  };
  cargarRegadera(cup, function () { regListo = true; habilitar(); });
  cargarIslaSVG(targetLevel, body, function () { vegListo = true; habilitar(); });
}

/* Carga el SVG del nivel objetivo INLINE dentro de .island-mask y deja la
   vegetación en estado árido (scale 0). Llama onReady al terminar. */
function cargarIslaSVG(targetLevel, body, onReady) {
  const cont = body.querySelector('#isla-svg');

  fetch('assets/vegetacion/isla-nivel-' + targetLevel + '.svg')
    .then(function (r) { return r.text(); })
    .then(function (txt) {
      cont.innerHTML = txt;
      const svg = cont.querySelector('svg');
      const grupos = svg ? vegElementos(svg) : [];
      /* Estado inicial árido: la vegetación arranca colapsada (scale 0). */
      grupos.forEach(function (g) {
        g.el.setAttribute('transform', g.orig + ' scale(0)');
      });
      state.riegoGrupos = grupos;
      if (onReady) onReady();
    })
    .catch(function () {
      /* Fallback improbable (fetch falla): isla estática, sin cascada. */
      cont.innerHTML = vegetacionImg(targetLevel);
      state.riegoGrupos = [];
      if (onReady) onReady();
    });
}

/* Grupos de vegetación animables: <g id> HOJA (sin <g id> dentro), con
   translate, que no sean terreno. Los contenedores y el terreno se saltan. */
function vegElementos(svg) {
  const TERRENO = /^(terreno|sombra-isla|textura-suelo|piedras)/;
  return Array.from(svg.querySelectorAll('g[id]')).filter(function (g) {
    if (TERRENO.test(g.id)) return false;
    const tr = g.getAttribute('transform') || '';
    if (tr.indexOf('translate') === -1) return false;
    if (g.querySelector('g[id]')) return false;        // es un contenedor
    return true;
  }).map(function (g) {
    const tr = g.getAttribute('transform');
    const m = tr.match(/translate\(\s*-?[\d.]+[ ,]+(-?[\d.]+)/);
    return { el: g, orig: tr, y: m ? parseFloat(m[1]) : 140, tipo: tipoVeg(g.id), listo: false };
  });
}

/* Tipo de vegetación según el prefijo del id — define cómo se anima. */
function tipoVeg(id) {
  if (id.indexOf('arbol') === 0) return 'arbol';
  if (id.indexOf('arbusto') === 0) return 'arbusto';
  if (id.indexOf('helecho') === 0) return 'helecho';
  if (id.indexOf('flor') === 0 || id.indexOf('capullo') === 0) return 'flor';
  if (id.indexOf('hierba') === 0 || id.indexOf('brote') === 0) return 'hierba';
  return 'cobertura';   // m-* y cualquier otro
}

/* Riega la isla: la regadera se inclina, el agua sale del pitorro y la
   vegetación FLORECE en cascada — elemento por elemento, en una onda que
   sube por la isla. */
function regar() {
  if (state.riegoRegada) return;
  state.riegoRegada = true;

  const dimId = DIMENSIONES[state.riegoIndex];
  const score = getScores()[dimId];
  const esUltima = (state.riegoIndex + 1 === DIMENSIONES.length);
  const body = document.getElementById('riego-body');

  const cup = body.querySelector('#cup-riego');
  cup.classList.add('pour', 'disabled');

  /* La regadera se inclina; al volcar el pitorro arranca la ducha. El agua
     frena en la superficie de la isla (~mitad del alto de #isla-svg). */
  inclinarRegadera(cup.querySelector('svg'), function () {
    spawnShower(cup, body.querySelector('#drops-riego'),
                body.querySelector('#isla-svg'), 0.5);
  });

  /* La regadera se retira cuando el agua terminó de caer. */
  setTimeout(function () { cup.classList.add('spent'); }, 1700);

  /* La floración arranca cuando el agua moja la isla (~820ms). */
  setTimeout(function () {
    cascadaFloracion(state.riegoGrupos || [], function () {
      const sf = body.querySelector('#score-float');
      sf.classList.remove('hidden');
      sf.classList.add('revelado');
      countUp(body.querySelector('#score-num'), score, 700);

      const foot = body.querySelector('#riego-foot');
      foot.innerHTML =
        '<div class="water-next-row">' +
          '<button type="button" class="water-next" id="btn-riego-next">' +
            (esUltima ? 'Ver las 4 islas' : 'Siguiente') +
            '<span class="arr" aria-hidden="true">→</span>' +
          '</button>' +
        '</div>';
      foot.classList.add('fade-enter');
      foot.querySelector('#btn-riego-next').addEventListener('click', avanzarRiego);
    });
  }, 820);
}

/* ---- Cascada de floración ---- */

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
/* Overshoot suave para las flores (rebote leve al abrirse). */
function easeOutBack(t) {
  const c = 1.5;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

/* Perfil por tipo: duración (ms), easing y un pequeño offset de delay
   (los árboles entran con más peso y un poco después). */
const PERFIL_VEG = {
  cobertura: { dur: 240, ease: easeOutCubic, off: 0   },
  hierba:    { dur: 320, ease: easeOutCubic, off: 0   },
  arbusto:   { dur: 440, ease: easeOutCubic, off: 70  },
  helecho:   { dur: 470, ease: easeOutCubic, off: 70  },
  arbol:     { dur: 660, ease: easeOutCubic, off: 140 },
  flor:      { dur: 480, ease: easeOutBack,  off: 110 }
};

/* ---- Viento ambiente ---- */

/* Perfil de oscilación por tipo: amplitud (grados) y rango de período (ms).
   Árboles: lento y leve. Hierba y flores: más vivo y rápido. La cobertura
   del suelo (m-*, ~158 elementos) NO está acá a propósito → queda quieta,
   por rendimiento. Para sumar/quitar un tipo del viento, editá esta tabla. */
const PERFIL_VIENTO = {
  arbol:   { amp: 2.6, durMin: 5200, durMax: 7000 },
  arbusto: { amp: 3.2, durMin: 4400, durMax: 5600 },
  helecho: { amp: 3.6, durMin: 3900, durMax: 5100 },
  hierba:  { amp: 4.4, durMin: 2700, durMax: 3800 },
  flor:    { amp: 4.6, durMin: 2900, durMax: 4100 }
};

/* Pone un grupo ya brotado a mecerse con el viento. La oscilación es una
   animación CSS (keyframes vegWind + custom properties por elemento), no un
   loop de JS — corre fuera del hilo principal. El keyframe arranca y termina
   en reposo (rotate 0) → sin salto al pasar del brote al viento. Cada
   elemento lleva período y desfase propios para que no se mezan en sincro.
   Rota sobre su origen local (base de la planta / centro de la flor). */
function mecer(g) {
  if (g.meciendo) return;
  const p = PERFIL_VIENTO[g.tipo];
  if (!p) return;                       // cobertura y demás: quietos
  g.meciendo = true;
  const m = g.orig.match(/translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/);
  const el = g.el;
  el.style.setProperty('--w-tx', (m ? m[1] : '0') + 'px');
  el.style.setProperty('--w-ty', (m ? m[2] : '0') + 'px');
  el.style.setProperty('--w-amp', p.amp.toFixed(2) + 'deg');
  el.style.setProperty('--w-dur',
    (p.durMin + Math.random() * (p.durMax - p.durMin)).toFixed(0) + 'ms');
  el.style.setProperty('--w-delay', (Math.random() * 1400).toFixed(0) + 'ms');
  el.classList.add('veg-wind');
}

/* Hace crecer cada grupo de scale 0 → 1 sobre su atributo transform
   original (translate/rotate intactos, scale se compone al final → el
   elemento crece desde su origen local sin desplazarse). El delay sale
   de la posición vertical: onda que sube por la isla + jitter. */
function cascadaFloracion(grupos, onDone) {
  if (!grupos.length) { setTimeout(onDone, 280); return; }

  const SPREAD = 950;   // ms — ventana de la onda espacial
  const ys = grupos.map(function (g) { return g.y; });
  const yMin = Math.min.apply(null, ys);
  const yMax = Math.max.apply(null, ys);
  const rango = Math.max(1, yMax - yMin);

  let maxFin = 0;
  grupos.forEach(function (g) {
    const p = PERFIL_VEG[g.tipo];
    const subir = (yMax - g.y) / rango;            // 0 = abajo · 1 = arriba
    const jitter = (Math.random() - 0.5) * 160;
    g.delay = Math.max(0, subir * SPREAD + p.off + jitter);
    g.dur = p.dur;
    g.ease = p.ease;
    g.listo = false;
    maxFin = Math.max(maxFin, g.delay + g.dur);
  });

  const inicio = performance.now();
  function frame(now) {
    const t = now - inicio;
    for (let i = 0; i < grupos.length; i++) {
      const g = grupos[i];
      if (g.listo) continue;
      const local = t - g.delay;
      if (local <= 0) continue;                    // todavía no brota
      let s;
      if (local >= g.dur) { s = 1; g.listo = true; }
      else s = g.ease(local / g.dur);
      g.el.setAttribute('transform', g.orig + ' scale(' + s.toFixed(4) + ')');
      /* Brote terminado → el elemento pasa a mecerse con el viento. */
      if (g.listo) mecer(g);
    }
    if (t < maxFin) {
      requestAnimationFrame(frame);
    } else {
      grupos.forEach(function (g) {
        if (!g.listo) { g.el.setAttribute('transform', g.orig + ' scale(1)'); g.listo = true; }
        mecer(g);
      });
      onDone();
    }
  }
  requestAnimationFrame(frame);
}

function avanzarRiego() {
  if (state.riegoIndex + 1 < DIMENSIONES.length) {
    state.riegoIndex++;
    state.riegoRegada = false;
    renderRiego();
    showView('view-riego');
  } else {
    renderMapa();
    showView('view-mapa');
  }
}

/* ============================================================
   5 · Mapa — las 4 islas
   ============================================================ */

function renderMapa() {
  const scores = getScores();

  let islas = '';
  DIMENSIONES.forEach(d => {
    const info = DIM_INFO[d];
    const s = scores[d];
    const nivel = levelFromScore(s).id;
    islas +=
      '<button type="button" class="mini-island" data-dim="' + d + '">' +
        '<div class="mini-stage">' +
          '<div class="mini-mask">' + vegetacionImg(nivel) + '</div>' +
          '<div class="mini-outline"></div>' +
        '</div>' +
        '<div class="mini-label">' + info.label + '</div>' +
        '<div class="mini-score">' + s + '<sup> /100</sup></div>' +
      '</button>';
  });

  const html =
    '<div class="overview-head">' +
      '<div class="eyebrow">Tu mapa de bienestar</div>' +
      '<h2 class="overview-title">Las cuatro islas</h2>' +
      '<p class="overview-sub">Toca una isla para leer qué dice.</p>' +
    '</div>' +
    '<div class="overview-stage">' +
      '<div class="overview-brujula"></div>' +
      islas +
      (state.openDim ? readingPanelHTML(state.openDim, scores[state.openDim]) : '') +
    '</div>' +
    '<div class="overview-foot">' +
      '<button type="button" class="btn-pill btn-negro" id="btn-ver-total">Ver resultado total →</button>' +
    '</div>';

  const body = document.getElementById('mapa-body');
  body.innerHTML = html;

  body.querySelectorAll('.mini-island').forEach(btn => {
    btn.addEventListener('click', () => abrirLectura(btn.dataset.dim));
  });
  body.querySelector('#btn-ver-total').addEventListener('click', () => {
    state.openDim = null;
    renderTotal();
    showView('view-total');
  });
  const cerrar = body.querySelector('#rp-close');
  if (cerrar) cerrar.addEventListener('click', cerrarLectura);
}

function readingPanelHTML(dimId, score) {
  const info = DIM_INFO[dimId];
  return '<div class="reading-panel">' +
           '<button type="button" class="rp-close" id="rp-close" aria-label="Cerrar">×</button>' +
           '<div class="rp-head">' +
             '<div class="rp-dim">' + info.label + '</div>' +
             '<div class="rp-score">' + score + '<sup> /100</sup></div>' +
           '</div>' +
           '<p class="rp-body">' + info.reading + '</p>' +
         '</div>';
}

function abrirLectura(dimId) {
  state.openDim = dimId;
  renderMapa();
}

function cerrarLectura() {
  state.openDim = null;
  renderMapa();
}

/* ============================================================
   6 · Total — resultado global
   ============================================================ */

function renderTotal() {
  const global = scoreGlobal();
  const targetVine = levelFromScore(global).id;
  const nombre = state.nombrePerro || 'tu perro';

  const html =
    '<div class="total-head">' +
      '<div class="eyebrow">Tu resultado total</div>' +
      '<h2 class="total-title">' + nombre + ' · hoy</h2>' +
    '</div>' +
    '<div class="total-stage">' +
      '<div class="logo-wrap">' +
        '<img class="logo-img" src="https://i.ibb.co/3YNrs9tM/Dise-o-con-cambio-de-negro-a-blanco.png" alt="Perros de la Isla">' +
        '<div class="vine-layer">' + enredaderaStackHTML(targetVine) + '</div>' +
        '<div class="drops" id="drops-total" aria-hidden="true"></div>' +
        '<div class="cup-wrap disabled" id="cup-total"></div>' +
      '</div>' +
      '<div class="total-reveal" id="total-reveal">' +
        '<div class="water-cta">Riega el resultado</div>' +
        '<div class="water-helper">Toca la regadera</div>' +
      '</div>' +
    '</div>' +
    '<div class="total-foot" id="total-foot"></div>';

  const body = document.getElementById('total-body');
  body.innerHTML = html;
  const cup = body.querySelector('#cup-total');
  cargarRegadera(cup, function () {
    cup.classList.remove('disabled');
    cup.addEventListener('click', regarTotal);
  });
}

function renderTotalFoot(critical, nombre) {
  let foot = '';

  if (state.es_cliente_activo) {
    foot +=
      '<p class="total-foot-body">Tu adiestrador ya tiene esta evaluación. ' +
      'La trabajaréis juntos en la próxima clase.</p>' +
      '<a href="https://perrosdelaisla.github.io/clases/" class="btn-pill btn-rojo total-cta">Volver a la app</a>';
    return foot;
  }

  if (critical) {
    foot +=
      '<div class="critical-banner">' +
        '<span class="cb-ico"></span>' +
        '<div class="cb-body"><strong>Conviene que hablemos pronto.</strong> ' +
        'Hay señales que merecen mirada experta antes de seguir solos. Esto no es un ' +
        'diagnóstico: es una invitación a parar y revisarlo bien.</div>' +
      '</div>' +
      '<p class="total-foot-body">Reserva una primera clase a domicilio. Sin compromiso, ' +
      'sin guion: empezamos por escuchar y mirar a ' + nombre + '.</p>' +
      '<button type="button" class="btn-pill btn-rojo total-cta" id="btn-cta">Reservar primera clase</button>';
  } else {
    foot +=
      '<p class="total-foot-body">Hay margen para que ' + nombre + ' viva mejor cada día. ' +
      'Te acompañamos a domicilio, con paciencia y método, en una primera clase sin compromiso.</p>' +
      '<button type="button" class="btn-pill btn-rojo total-cta" id="btn-cta">Pide tu primera clase</button>';
  }

  /* Enlace personal — magic link, 30 días */
  const token = state.resultado && state.resultado.token;
  if (token) {
    const base = window.location.origin + window.location.pathname;
    foot +=
      '<div class="enlace-personal">' +
        '<p class="enlace-label">Tu enlace personal — guárdalo para volver durante 30 días:</p>' +
        '<div class="enlace-row">' +
          '<input id="enlace-input" type="text" readonly value="' + base + '?t=' + token + '">' +
          '<button type="button" class="btn-copiar" id="btn-copiar">Copiar</button>' +
        '</div>' +
      '</div>';
  }

  foot += '<button type="button" class="total-restart" id="btn-restart">Repetir evaluación</button>';
  return foot;
}

function wireTotalFoot(body) {
  const cta = body.querySelector('#btn-cta');
  if (cta) cta.addEventListener('click', abrirCTA);

  const copiar = body.querySelector('#btn-copiar');
  if (copiar) copiar.addEventListener('click', copiarEnlace);

  const restart = body.querySelector('#btn-restart');
  if (restart) restart.addEventListener('click', reiniciar);
}

/* Riega el Total: la regadera se inclina y riega el logo desde el costado;
   el agua dispara el crecimiento de la enredadera/corona hasta el nivel
   del puntaje global. */
function regarTotal() {
  if (state.totalRegado) return;
  state.totalRegado = true;

  const global = scoreGlobal();
  const targetVine = levelFromScore(global).id;
  const critical = !!(state.resultado && state.resultado.bandera_roja);
  const nombre = state.nombrePerro || 'tu perro';
  const body = document.getElementById('total-body');

  const cup = body.querySelector('#cup-total');
  cup.classList.add('pour', 'disabled');

  /* La regadera se inclina; al volcar el pitorro arranca la ducha. El agua
     frena sobre el logo, no se pasa de largo. */
  inclinarRegadera(cup.querySelector('svg'), function () {
    spawnShower(cup, body.querySelector('#drops-total'),
                body.querySelector('.logo-img'), 0.42);
  });
  setTimeout(function () { cup.classList.add('spent'); }, 1700);

  /* El agua moja el logo (~420ms) y dispara el crecimiento de la corona. */
  setTimeout(function () {
    growStack(body.querySelector('.vine-layer'), targetVine, function () {
      const reveal = body.querySelector('#total-reveal');
      reveal.innerHTML =
        '<div class="total-score-row fade-enter">' +
          '<div class="total-score-label">Bienestar global</div>' +
          '<div class="score-impact"><span id="total-score-num">0</span><span class="max"> / 100</span></div>' +
        '</div>';
      countUp(body.querySelector('#total-score-num'), global, 800);

      const foot = body.querySelector('#total-foot');
      foot.innerHTML = renderTotalFoot(critical, nombre);
      foot.classList.add('fade-enter');
      wireTotalFoot(foot);
    });
  }, 420);
}

function abrirCTA() {
  const s = getScores();
  const url = 'https://perrosdelaisla.github.io/hola/?origen=isla' +
    '&perro=' + encodeURIComponent(state.nombrePerro) +
    '&fis=' + s.fisica +
    '&emo=' + s.emocional +
    '&soc=' + s.social +
    '&cog=' + s.cognitiva;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function copiarEnlace() {
  const input = document.getElementById('enlace-input');
  const btn = document.getElementById('btn-copiar');
  if (!input || !btn) return;
  input.select();
  input.setSelectionRange(0, 99999);
  const ok = () => {
    const original = 'Copiar';
    btn.textContent = '✓ Copiado';
    btn.classList.add('copiado');
    setTimeout(() => { btn.textContent = original; btn.classList.remove('copiado'); }, 1800);
  };
  try {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(input.value).then(ok).catch(() => {
        document.execCommand('copy'); ok();
      });
    } else {
      document.execCommand('copy'); ok();
    }
  } catch (e) { /* silencio */ }
}

function reiniciar() {
  state.indicePregunta = 0;
  state.respuestas = {};
  state.opcionElegidaIndex = {};
  state.resultado = null;
  state.riegoIndex = 0;
  state.riegoRegada = false;
  state.totalRegado = false;
  state.openDim = null;
  state.nombrePerro = 'tu perro';
  state.tutorNombre = '';

  ['input-nombre-perro', 'input-nombre-tutor', 'input-email'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const rgpd = document.getElementById('input-rgpd');
  if (rgpd) rgpd.checked = false;

  showView('view-intro');
}

/* ============================================================
   Vegetación — se carga desde archivos SVG externos.
   Arte definitivo de Claude Design en assets/vegetacion/:
   isla-nivel-0..4.svg (viewBox 340×280) y
   enredadera-nivel-0..4.svg (viewBox 290×290).
   La regadera (cargarRegadera) también va inline: no es vegetación.
   ============================================================ */

/* <img> de la isla para un nivel (0 árida ··· 4 plena). Vive dentro de un
   div con la máscara de Mallorca, que lo recorta a la silueta de la isla. */
function vegetacionImg(level) {
  const n = Math.max(0, Math.min(4, level | 0));
  return '<img class="veg-img" alt="" src="assets/vegetacion/isla-nivel-' + n + '.svg">';
}

/* Enredadera del Total — capas 0..targetLevel apiladas (crossfade growStack). */
function enredaderaStackHTML(targetLevel) {
  const t = Math.max(0, Math.min(4, targetLevel | 0));
  let capas = '';
  for (let l = 0; l <= t; l++) {
    capas += '<img class="veg-layer' + (l === 0 ? ' grown' : '') + '" ' +
             'data-level="' + l + '" alt="" ' +
             'src="assets/vegetacion/enredadera-nivel-' + l + '.svg">';
  }
  return capas;
}

/* La regadera de riego — se monta INLINE desde assets/regadera.svg dentro
   del .cup-wrap (hay que poder inclinar el grupo #regadera y leer el
   #pitorro). Se cachea tras la primera carga; onReady corre con el SVG ya
   en el DOM. La usan las dos pantallas que riegan (riego de islas y total). */
let _regaderaSVG = null;
function cargarRegadera(cupEl, onReady) {
  const montar = function (txt) {
    cupEl.innerHTML = '<div class="tap-hint">tócalo</div>' + txt;
    if (onReady) onReady();
  };
  if (_regaderaSVG !== null) { montar(_regaderaSVG); return; }
  fetch('assets/regadera.svg')
    .then(function (r) { return r.text(); })
    .then(function (txt) {
      const i = txt.indexOf('<svg');
      _regaderaSVG = (i >= 0 ? txt.slice(i) : txt);
      montar(_regaderaSVG);
    })
    .catch(function () { _regaderaSVG = ''; montar(''); });
}

/* ============================================================
   Animación de riego (Bloque 3)
   ============================================================ */

/* Revela las capas de vegetación 1..target de a una, escalonadas, para que
   la isla/enredadera crezca de forma suave. La capa 0 ya está visible.
   Llama onDone cuando termina el crecimiento. Ritmo: ~0.6 s (nivel bajo) a
   ~1.5 s (nivel 4), dentro del rango de 1-2 s por isla. */
function growStack(contenedor, targetLevel, onDone) {
  const ESPERA = 460;   // ms — deja caer el agua antes de empezar a crecer
  const PASO   = 200;   // ms entre niveles
  const FADE   = 420;   // ms — coincide con la transición CSS de .veg-layer

  for (let l = 1; l <= targetLevel; l++) {
    const capa = contenedor.querySelector('.veg-layer[data-level="' + l + '"]');
    setTimeout(function () {
      if (capa) capa.classList.add('grown');
    }, ESPERA + (l - 1) * PASO);
  }

  const fin = targetLevel >= 1
    ? ESPERA + (targetLevel - 1) * PASO + FADE
    : ESPERA + 160;
  setTimeout(onDone, fin);
}

/* Inclina la regadera para verter. Anima el atributo transform del grupo
   #regadera (rotación SVG, no CSS) pivotando sobre la base del cuerpo —
   así getScreenCTM del #pitorro refleja la posición real del agua. El
   pitorro está a la izquierda, así que la regadera se inclina hacia ese
   lado. onVierte se dispara cuando el pitorro ya bajó: ahí cae el agua. */
function inclinarRegadera(svg, onVierte) {
  const reg = svg && svg.querySelector('#regadera');
  if (!reg) { if (onVierte) onVierte(); return; }
  const PIVX = 168, PIVY = 200;   // base del cuerpo, en coords del viewBox
  const ANG  = -33;               // inclinación final hacia el pitorro
  const DUR  = 620;               // ms
  const inicio = performance.now();
  let vertido = false;
  function frame(now) {
    const t = Math.min(1, (now - inicio) / DUR);
    const ang = ANG * easeOutCubic(t);
    reg.setAttribute('transform',
      'rotate(' + ang.toFixed(2) + ' ' + PIVX + ' ' + PIVY + ')');
    if (!vertido && t >= 0.62) { vertido = true; if (onVierte) onVierte(); }
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* Ducha de agua desde la roseta de la regadera. Lee la posición real del
   #pitorro (ya inclinado) y esparce hilos finos cayendo — como las
   perforaciones de la roseta, no unas pocas gotas gruesas. El agua frena
   en la SUPERFICIE del objetivo (isla / logo): la caída no es fija, se
   calcula con la posición real en pantalla del objetivo. Ahí se absorbe. */
function spawnShower(cupWrap, contenedor, objetivo, fraccion) {
  if (!cupWrap || !contenedor) return;
  contenedor.innerHTML = '';
  const svg = cupWrap.querySelector('svg');
  const pitorro = svg && svg.querySelector('#pitorro');
  if (!svg || !pitorro) return;

  const DURACION = 900;   // ms — cuánto sigue saliendo agua
  const LOTE = 44;        // ms entre lotes de hilos
  const pt = svg.createSVGPoint();

  /* Y de impacto en pantalla: la superficie del objetivo. fraccion ubica
     el punto dentro de su alto (0 = borde superior, 1 = inferior). */
  function superficieY() {
    if (objetivo) {
      const r = objetivo.getBoundingClientRect();
      return r.top + r.height * (fraccion || 0.5);
    }
    return contenedor.getBoundingClientRect().bottom - 8;
  }

  function caer() {
    const ctm = pitorro.getScreenCTM();
    if (!ctm) return;
    pt.x = 0; pt.y = 0;
    const sp = pt.matrixTransform(ctm);          // pitorro → píxeles de pantalla
    const box = contenedor.getBoundingClientRect();
    const ox = sp.x - box.left;
    const oy = sp.y - box.top;
    const impacto = superficieY();

    const n = 2 + Math.floor(Math.random() * 3);  // 2-4 hilos por lote
    for (let i = 0; i < n; i++) {
      const dx = (Math.random() - 0.5) * 34;      // dispersión de la roseta
      /* caída = del pitorro a la superficie (± leve, la superficie no es plana) */
      const caida = Math.max(34, impacto - sp.y + (Math.random() - 0.5) * 10);
      const d = document.createElement('span');
      d.className = 'shower-drop';
      d.style.left = (ox + dx).toFixed(1) + 'px';
      d.style.top  = oy.toFixed(1) + 'px';
      d.style.setProperty('--dist',  caida.toFixed(0) + 'px');
      d.style.setProperty('--drift', (dx * 0.3).toFixed(1) + 'px');
      d.style.setProperty('--fall',  (430 + Math.random() * 200).toFixed(0) + 'ms');
      contenedor.appendChild(d);
    }
  }

  caer();
  let pasado = 0;
  const iv = setInterval(function () {
    caer();
    pasado += LOTE;
    if (pasado >= DURACION) clearInterval(iv);
  }, LOTE);

  setTimeout(function () { contenedor.innerHTML = ''; }, DURACION + 900);
}

/* Conteo animado del puntaje, 0 → valor final, con easing suave. */
function countUp(el, destino, duracion) {
  if (!el) return;
  const inicio = performance.now();
  function tick(t) {
    const k = Math.min(1, (t - inicio) / duracion);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(destino * eased);
    if (k < 1) requestAnimationFrame(tick);
    else el.textContent = destino;
  }
  requestAnimationFrame(tick);
}
