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

/* ---- Banner "versión en desarrollo" ---- */
(function initDevBanner() {
  const banner = document.getElementById('dev-banner');
  const closeBtn = document.getElementById('dev-banner-close');
  if (!banner || !closeBtn) return;

  if (sessionStorage.getItem('dev-banner-closed') === '1') {
    banner.setAttribute('hidden', '');
    return;
  }
  closeBtn.addEventListener('click', () => {
    banner.setAttribute('hidden', '');
    sessionStorage.setItem('dev-banner-closed', '1');
  });
})();

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
  const regada = state.riegoRegada;
  const nivel = regada ? levelFromScore(score).id : 0;
  const esUltima = (state.riegoIndex + 1 === total);

  let html =
    '<div class="water-header">' +
      '<div class="eyebrow">Riego ' + (state.riegoIndex + 1) + ' de ' + total + '</div>' +
      '<h2 class="water-dim">' + info.label + '</h2>' +
      '<p class="water-intro">' + info.intro + '</p>' +
    '</div>' +
    '<div class="water-stage">' +
      '<div style="position:relative;display:inline-block">' +
        islaHTML(nivel, 'big') +
        (regada ? scoreFloatHTML(score)
                : '<div class="cup-wrap" id="cup-riego"><div class="tap-hint">tócalo</div>' + cupSVG() + '</div>') +
      '</div>' +
    '</div>';

  if (regada) {
    html +=
      '<div class="water-next-row">' +
        '<button type="button" class="water-next" id="btn-riego-next">' +
          (esUltima ? 'Ver las 4 islas' : 'Siguiente') +
          '<span class="arr" aria-hidden="true">→</span>' +
        '</button>' +
      '</div>';
  } else {
    html +=
      '<div class="water-cta">Riega para descubrir</div>' +
      '<div class="water-helper">Toca el vasito</div>';
  }

  const body = document.getElementById('riego-body');
  body.innerHTML = html;

  if (regada) {
    body.querySelector('#btn-riego-next').addEventListener('click', avanzarRiego);
  } else {
    body.querySelector('#cup-riego').addEventListener('click', regarRiego);
  }
}

function regarRiego() {
  if (state.riegoRegada) return;
  state.riegoRegada = true;
  renderRiego();
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

function scoreFloatHTML(score) {
  return '<div class="score-float">' +
           '<div class="score-label">Puntaje</div>' +
           '<div class="score-impact">' + score + '<span class="max"> / 100</span></div>' +
         '</div>';
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
  const regado = state.totalRegado;
  const nivelVine = regado ? levelFromScore(global).id : 0;
  const critical = !!(state.resultado && state.resultado.bandera_roja);
  const nombre = state.nombrePerro || 'tu perro';

  let stage =
    '<div class="logo-wrap">' +
      '<img class="logo-img" src="https://i.ibb.co/3YNrs9tM/Dise-o-con-cambio-de-negro-a-blanco.png" alt="Perros de la Isla">' +
      '<div class="vine-layer">' + enredaderaImg(nivelVine) + '</div>' +
      (regado ? '' : '<div class="cup-wrap" id="cup-total"><div class="tap-hint">tócalo</div>' + cupSVG() + '</div>') +
    '</div>';

  if (regado) {
    stage +=
      '<div class="total-score-row">' +
        '<div class="total-score-label">Bienestar global</div>' +
        '<div class="score-impact">' + global + '<span class="max"> / 100</span></div>' +
      '</div>';
  } else {
    stage +=
      '<div>' +
        '<div class="water-cta">Riega el resultado</div>' +
        '<div class="water-helper">Toca el vasito</div>' +
      '</div>';
  }

  let foot = '';
  if (regado) {
    foot = renderTotalFoot(critical, nombre);
  }

  const html =
    '<div class="total-head">' +
      '<div class="eyebrow">Tu resultado total</div>' +
      '<h2 class="total-title">' + nombre + ' · hoy</h2>' +
    '</div>' +
    '<div class="total-stage">' + stage + '</div>' +
    '<div class="total-foot">' + foot + '</div>';

  const body = document.getElementById('total-body');
  body.innerHTML = html;

  if (!regado) {
    body.querySelector('#cup-total').addEventListener('click', regarTotal);
  } else {
    wireTotalFoot(body);
  }
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

function regarTotal() {
  if (state.totalRegado) return;
  state.totalRegado = true;
  renderTotal();
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
   El vasito (cupSVG) sigue inline: no es vegetación.
   ============================================================ */

/* <img> de la isla para un nivel (0 árida ··· 4 plena). Vive dentro de un
   div con la máscara de Mallorca, que lo recorta a la silueta de la isla. */
function vegetacionImg(level) {
  const n = Math.max(0, Math.min(4, level | 0));
  return '<img class="veg-img" alt="" src="assets/vegetacion/isla-nivel-' + n + '.svg">';
}

/* <img> de la enredadera para un nivel — pantalla Total. */
function enredaderaImg(level) {
  const n = Math.max(0, Math.min(4, level | 0));
  return '<img class="vine-img" alt="" src="assets/vegetacion/enredadera-nivel-' + n + '.svg">';
}

/* Isla: máscara de Mallorca + arte de vegetación + contorno. */
function islaHTML(level, size) {
  const big = size === 'big';
  const stageCls = big ? 'island-stage' : 'mini-stage';
  const maskCls  = big ? 'island-mask'  : 'mini-mask';
  const outCls   = big ? 'island-outline' : 'mini-outline';

  return '<div class="' + stageCls + '">' +
           '<div class="' + maskCls + '">' + vegetacionImg(level) + '</div>' +
           '<div class="' + outCls + '"></div>' +
         '</div>';
}

/* SVG del vasito de riego */
function cupSVG() {
  return '<svg viewBox="0 0 84 100">' +
    '<path d="M16 28 L22 88 Q22 94 28 94 L56 94 Q62 94 62 88 L68 28 Z" ' +
      'fill="#F5EFE0" stroke="#1A1A1A" stroke-width="2.4" stroke-linejoin="round"/>' +
    '<ellipse cx="42" cy="28" rx="26" ry="6" fill="#FAF5E8" stroke="#1A1A1A" stroke-width="2.4"/>' +
    '<ellipse cx="42" cy="28" rx="22" ry="4.5" fill="#7BC4E8"/>' +
    '<path d="M22 36 Q24 60 26 84" stroke="#FFFFFF" stroke-width="2" fill="none" ' +
      'opacity="0.55" stroke-linecap="round"/>' +
    '<path d="M68 38 Q80 42 78 60 Q76 72 64 70" stroke="#1A1A1A" stroke-width="2.4" ' +
      'fill="none" stroke-linecap="round"/>' +
  '</svg>';
}
