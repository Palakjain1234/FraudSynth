// // src/api.js

// const BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';

// /**
//  * Verify Google OAuth token with optional mode.
//  * @param {string} id_token - Google ID token
//  * @param {string} [mode] - Optional mode parameter
//  * @returns {Promise<Object>}
//  */
// export async function verifyGoogle(id_token, mode) {
//   const res = await fetch(`${BASE}/auth/verify`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ id_token, mode }),
//   });

//   if (!res.ok) {
//     const msg = (await res.json()).detail || 'Auth failed';
//     throw new Error(msg);
//   }
//   return res.json();
// }

// /**
//  * Predict function for fraud detection or other ML tasks.
//  * @param {string} userId - ID of the user
//  * @param {Object} input - Input features for prediction
//  * @param {number} threshold - Threshold for risk prediction
//  * @returns {Promise<Object>}
//  */
// export async function predict(userId, input, threshold) {
//   const res = await fetch(`${BASE}/api/predict`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ user_id: userId, input, threshold }),
//   });

//   if (!res.ok) {
//     const msg = (await res.json()).detail || 'Predict failed';
//     throw new Error(msg);
//   }
//   return res.json();
// }

// /**
//  * Fetch overall metrics from backend.
//  * @returns {Promise<Object>}
//  */
// export async function getMetrics() {
//   const res = await fetch(`${BASE}/api/metrics`);
//   if (!res.ok) throw new Error('Metrics fetch failed');
//   return res.json();
// }

// /**
//  * Fetch top risky users/transactions.
//  * @param {number} [limit=50] - Maximum number of results
//  * @returns {Promise<Object>}
//  */
// export async function getTopRisks(limit = 50) {
//   const res = await fetch(`${BASE}/api/top-risks?limit=${limit}`);
//   if (!res.ok) throw new Error('Top risks fetch failed');
//   return res.json();
// }
// src/api.js

const BASE = 'http://127.0.0.1:8000'

// --- helpers ---
async function parseMaybeJson(res) {
  try {
    return await res.json()
  } catch {
    return { detail: await res.text() }
  }
}

async function handleJson(res, fallbackMsg) {
  const payload = await parseMaybeJson(res)
  if (!res.ok) {
    const msg = payload?.detail || fallbackMsg || 'Request failed'
    throw new Error(msg)
  }
  return payload
}

export async function predictCsv(file, threshold) {
  const fd = new FormData()
  fd.append('user_id', 'guest')                 // <- hard-coded guest
  if (threshold !== undefined && threshold !== null) {
    fd.append('threshold', String(threshold))
  }
  fd.append('file', file)

  const res = await fetch(`${BASE}/api/predict-csv`, {
    method: 'POST',
    body: fd,
  })
  return handleJson(res, 'Batch predict failed')
}

// --- download ready-to-fill template (CSV text) ---
export async function getTemplateCsv() {
  const res = await fetch(`${BASE}/api/template`)
  if (!res.ok) throw new Error('Template fetch failed')
  return res.text()
}

// --- dashboard metrics ---
export async function getMetrics() {
  const res = await fetch(`${BASE}/api/metrics`)
  return handleJson(res, 'Metrics fetch failed')
}

// --- top risky transactions for the table ---
export async function getTopRisks(limit = 50) {
  const res = await fetch(`${BASE}/api/top-risks?limit=${limit}`)
  return handleJson(res, 'Top risks fetch failed')
}
export async function getCurves() {
  const res = await fetch(`${BASE}/api/curves`)
  if (!res.ok) throw new Error('Curves fetch failed')
  return res.json()
}
export async function refreshArtifacts() {
  const res = await fetch(`${BASE}/api/refresh-artifacts?force=1`, { method: 'POST' })
  if (!res.ok) throw new Error((await res.json()).detail || 'Refresh failed')
  return res.json()
}

