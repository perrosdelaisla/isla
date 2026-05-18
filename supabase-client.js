const SUPA_URL = 'https://sydzfwwiruxqaxojymdz.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5ZHpmd3dpcnV4cWF4b2p5bWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NjAwODAsImV4cCI6MjA5MjMzNjA4MH0.0SpunQTuSwYaAjzWEDQivZy7971-Tf3CX2KxAEo8Nuw';

const SUPA_HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPA_KEY,
  'Authorization': 'Bearer ' + SUPA_KEY,
  'Prefer': 'return=representation'
};

async function fetchPreguntas() {
  const url = SUPA_URL + '/rest/v1/preguntas_isla?activa=eq.true&version=eq.1&order=orden.asc';
  const res = await fetch(url, { headers: SUPA_HEADERS });
  if (!res.ok) {
    throw new Error('No se pudieron cargar las preguntas (HTTP ' + res.status + ').');
  }
  return res.json();
}

async function submitEvaluacion(payload) {
  const url = SUPA_URL + '/rest/v1/rpc/submit_evaluacion_isla';
  const res = await fetch(url, {
    method: 'POST',
    headers: SUPA_HEADERS,
    body: JSON.stringify({ payload })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('Error al enviar la evaluación (HTTP ' + res.status + '). ' + text);
  }
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function submitEvaluacionClienteActivo(payload) {
  const url = SUPA_URL + '/rest/v1/rpc/submit_evaluacion_cliente_activo';
  const res = await fetch(url, {
    method: 'POST',
    headers: SUPA_HEADERS,
    body: JSON.stringify({ payload })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('Error al enviar la evaluación cliente activo (HTTP ' + res.status + '). ' + text);
  }
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function getEvaluacion(token) {
  const url = SUPA_URL + '/rest/v1/rpc/get_evaluacion_isla';
  const res = await fetch(url, {
    method: 'POST',
    headers: SUPA_HEADERS,
    body: JSON.stringify({ token_input: token })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let tipoError = 'desconocido';
    if (text.includes('P0002')) tipoError = 'no_encontrado';
    else if (text.includes('P0003')) tipoError = 'expirado';
    else if (text.includes('P0001')) tipoError = 'invalido';
    else if (text.includes('P0004')) tipoError = 'borrado';
    const err = new Error('Error al recuperar evaluación: ' + tipoError);
    err.tipo = tipoError;
    throw err;
  }
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}
