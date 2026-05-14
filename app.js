const DIMENSIONES = ['fisica', 'emocional', 'social', 'cognitiva'];

const DIM_INFO = {
  fisica:    { label: 'Física',    emoji: '🩺', color: '#C8102E' },
  emocional: { label: 'Emocional', emoji: '💭', color: '#6B7A3A' },
  social:    { label: 'Social',    emoji: '🤝', color: '#1F4FA8' },
  cognitiva: { label: 'Cognitiva', emoji: '🧠', color: '#E8B62D' }
};

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const state = {
  preguntas: [],
  indicePregunta: 0,
  nombrePerro: '',
  origen: 'directo',
  respuestas: {},
  resultado: null
};

let chartBarras = null;
let chartTorta = null;

async function init() {
  const params = new URLSearchParams(window.location.search);
  state.origen = (params.get('origen') || 'directo').trim() || 'directo';

  try {
    state.preguntas = await fetchPreguntas();
    if (!Array.isArray(state.preguntas) || state.preguntas.length === 0) {
      mostrarErrorFatal('No hay preguntas activas en este momento. Inténtalo más tarde.');
      return;
    }
    document.getElementById('loading').classList.add('hidden');
    showView('view-bienvenida');
  } catch (err) {
    mostrarErrorFatal(err.message || 'No pudimos cargar la evaluación.');
  }
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

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('loading').classList.add('hidden');
  const v = document.getElementById(id);
  if (v) v.classList.remove('hidden');
  window.scrollTo(0, 0);
}

function vistaActual() {
  const v = document.querySelector('.view:not(.hidden)');
  return v ? v.id : null;
}

function handleContinuar() {
  const v = vistaActual();
  if (v === 'view-bienvenida') {
    showView('view-nombre-perro');
    setTimeout(() => {
      const i = document.getElementById('input-nombre-perro');
      if (i) i.focus();
    }, 50);
    return;
  }
  if (v === 'view-nombre-perro') {
    const input = document.getElementById('input-nombre-perro');
    const err = document.getElementById('error-nombre-perro');
    const nombre = input.value.trim();
    if (!nombre) {
      err.textContent = 'Necesitamos el nombre de tu perro para continuar.';
      err.classList.remove('hidden');
      return;
    }
    err.classList.add('hidden');
    state.nombrePerro = nombre;
    state.indicePregunta = 0;
    state.respuestas = {};
    showView('view-cuestionario');
    renderPregunta();
    return;
  }
  if (v === 'view-cierre') {
    actualizarTextosRegistro();
    showView('view-registro');
    setTimeout(() => {
      const i = document.getElementById('input-email');
      if (i) i.focus();
    }, 50);
    return;
  }
}

function renderPregunta() {
  const total = state.preguntas.length;
  const p = state.preguntas[state.indicePregunta];
  if (!p) return;

  const enunciado = String(p.enunciado || '').replace(/\{perro\}/g, state.nombrePerro);
  document.getElementById('pregunta-enunciado').textContent = enunciado;

  const dim = DIM_INFO[p.bloque];
  const bloqueIdx = DIMENSIONES.indexOf(p.bloque) + 1;

  const indicador = document.getElementById('bloque-indicador');
  indicador.dataset.bloque = p.bloque;
  indicador.textContent = dim ? (dim.emoji + ' ' + dim.label) : p.bloque;

  document.getElementById('progress-text').textContent =
    'Bloque ' + bloqueIdx + ' de 4 · Pregunta ' + (state.indicePregunta + 1) + ' de ' + total;

  document.getElementById('progress-fill').style.width =
    Math.round((state.indicePregunta / total) * 100) + '%';

  const cont = document.getElementById('pregunta-opciones');
  cont.innerHTML = '';
  const opciones = Array.isArray(p.opciones) ? p.opciones : [];
  opciones.forEach(op => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'opcion';
    btn.textContent = op.label;
    btn.onclick = function () {
      state.respuestas[p.id] = op.puntos;
      avanzarPregunta();
    };
    cont.appendChild(btn);
  });
}

function avanzarPregunta() {
  const actual = state.preguntas[state.indicePregunta];
  const idxSiguiente = state.indicePregunta + 1;

  if (idxSiguiente >= state.preguntas.length) {
    document.getElementById('progress-fill').style.width = '100%';
    mostrarCierre();
    return;
  }

  const siguiente = state.preguntas[idxSiguiente];
  state.indicePregunta = idxSiguiente;

  if (siguiente.bloque !== actual.bloque) {
    mostrarTransicionBloque(siguiente.bloque);
  } else {
    renderPregunta();
  }
}

function mostrarTransicionBloque(bloque) {
  const dim = DIM_INFO[bloque];
  const bloqueIdx = DIMENSIONES.indexOf(bloque) + 1;

  document.getElementById('transicion-titulo').textContent =
    'Vamos con la dimensión ' + (dim ? dim.label : bloque) + ' de ' + state.nombrePerro + '.';
  document.getElementById('transicion-sub').textContent =
    bloqueIdx + ' de 4 bloques.';

  showView('view-transicion-bloque');
  setTimeout(() => {
    showView('view-cuestionario');
    renderPregunta();
  }, 2000);
}

function mostrarCierre() {
  document.getElementById('cierre-titulo').textContent =
    'Listo. La evaluación de ' + state.nombrePerro + ' está completa.';
  document.getElementById('cierre-sub').textContent =
    'Ya tenemos su mapa de bienestar preparado. Antes de mostrártelo, déjanos saber dónde enviártelo.';
  document.getElementById('btn-ver-mapa').textContent =
    'Ver el mapa de ' + state.nombrePerro;
  showView('view-cierre');
}

function actualizarTextosRegistro() {
  document.getElementById('btn-enviar').textContent =
    'Ver el mapa de ' + state.nombrePerro;
}

async function handleRegistro() {
  const email = document.getElementById('input-email').value.trim();
  const nombre = document.getElementById('input-nombre-tutor').value.trim();
  const zona = document.getElementById('input-zona').value.trim();
  const rgpd = document.getElementById('input-rgpd').checked;
  const errEl = document.getElementById('error-registro');
  const btn = document.getElementById('btn-enviar');

  errEl.classList.add('hidden');

  if (!email || !RE_EMAIL.test(email)) {
    errEl.textContent = 'Introduce un email válido.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!nombre) {
    errEl.textContent = 'Introduce tu nombre.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!rgpd) {
    errEl.textContent = 'Necesitamos tu permiso para enviarte la evaluación.';
    errEl.classList.remove('hidden');
    return;
  }

  const payload = {
    email,
    nombre_tutor: nombre,
    nombre_perro: state.nombrePerro,
    origen: state.origen,
    respuestas: state.respuestas
  };
  if (zona) payload.zona = zona;

  const labelOriginal = 'Ver el mapa de ' + state.nombrePerro;
  btn.disabled = true;
  btn.textContent = 'Enviando…';

  try {
    const resultado = await submitEvaluacion(payload);
    state.resultado = resultado;
    renderResultado();
    showView('view-resultado');
  } catch (err) {
    errEl.textContent = 'No pudimos enviar la evaluación. Inténtalo de nuevo en unos segundos.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = labelOriginal;
  }
}

function lecturaPorScore(score) {
  const s = Number(score) || 0;
  if (s >= 75) return 'Tu perro está bien en esta área.';
  if (s >= 50) return 'Tu perro está bien, con algún punto a observar.';
  if (s >= 25) return 'Tu perro puede tener dificultades en esta área.';
  return 'Tu perro puede estar pasando un momento difícil en esta área.';
}

function renderResultado() {
  const r = state.resultado || {};
  const nombre = state.nombrePerro;

  document.getElementById('resultado-titulo').textContent = 'El mapa de ' + nombre;
  document.getElementById('footer-texto').textContent =
    'Te enviamos el mapa de ' + nombre + ' a tu email.';

  const scores = {
    fisica: Number(r.score_fisica) || 0,
    emocional: Number(r.score_emocional) || 0,
    social: Number(r.score_social) || 0,
    cognitiva: Number(r.score_cognitiva) || 0
  };

  const cards = document.getElementById('cards-dimensiones');
  cards.innerHTML = '';
  DIMENSIONES.forEach(d => {
    const info = DIM_INFO[d];
    const score = scores[d];

    const card = document.createElement('div');
    card.className = 'card-dimension';
    card.dataset.bloque = d;

    const head = document.createElement('div');
    head.className = 'card-head';

    const title = document.createElement('h4');
    title.className = 'card-title';
    title.textContent = info.emoji + ' ' + info.label;

    const scoreEl = document.createElement('span');
    scoreEl.className = 'card-score';
    scoreEl.style.color = info.color;
    scoreEl.textContent = score + '%';

    head.appendChild(title);
    head.appendChild(scoreEl);

    const lectura = document.createElement('p');
    lectura.className = 'card-lectura';
    lectura.textContent = lecturaPorScore(score);

    card.appendChild(head);
    card.appendChild(lectura);
    cards.appendChild(card);
  });

  const ctaTitulo = document.getElementById('cta-titulo');
  const ctaSub = document.getElementById('cta-sub');
  if (r.bandera_roja) {
    ctaTitulo.textContent = 'Vimos algo que conviene tratar pronto.';
    ctaSub.textContent = 'Reserva una primera clase con nosotros.';
  } else {
    ctaTitulo.textContent = '¿Quieres mejorar la Isla de ' + nombre + '?';
    ctaSub.textContent = 'En Perros de la Isla trabajamos exactamente lo que vimos hoy.';
  }

  renderCharts(scores);
}

function renderCharts(scores) {
  if (chartBarras) { chartBarras.destroy(); chartBarras = null; }
  if (chartTorta)  { chartTorta.destroy();  chartTorta = null; }

  const labels = DIMENSIONES.map(d => DIM_INFO[d].label);
  const data = DIMENSIONES.map(d => scores[d]);
  const colors = DIMENSIONES.map(d => DIM_INFO[d].color);

  const ctxB = document.getElementById('chart-barras').getContext('2d');
  chartBarras = new Chart(ctxB, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0,
        borderRadius: 6,
        barThickness: 22
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: c => c.parsed.x + '%' }
        }
      },
      scales: {
        x: {
          min: 0,
          max: 100,
          ticks: { callback: v => v + '%', font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.06)' }
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 12, weight: '600' } }
        }
      }
    }
  });

  const ctxT = document.getElementById('chart-torta').getContext('2d');
  chartTorta = new Chart(ctxT, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: '#F5EFE0',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 12 }, boxWidth: 12, padding: 12 }
        },
        tooltip: {
          callbacks: { label: c => c.label + ': ' + c.parsed + '%' }
        }
      }
    }
  });
}

function abrirCTA() {
  const r = state.resultado || {};
  const url = 'https://perrosdelaisla.github.io/hola/?origen=isla' +
    '&perro=' + encodeURIComponent(state.nombrePerro) +
    '&fis=' + (Number(r.score_fisica) || 0) +
    '&emo=' + (Number(r.score_emocional) || 0) +
    '&soc=' + (Number(r.score_social) || 0) +
    '&cog=' + (Number(r.score_cognitiva) || 0);
  window.open(url, '_blank', 'noopener,noreferrer');
}
