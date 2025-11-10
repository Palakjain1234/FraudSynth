
const BASE = (import.meta?.env?.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '')

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

// --- prediction (CSV upload) ---
// modelId is optional; backend can ignore if not wired yet
export async function predictCsv(file, threshold, modelId) {
  const fd = new FormData()
  fd.append('user_id', 'guest') // keep guest for now
  if (threshold !== undefined && threshold !== null) {
    fd.append('threshold', String(threshold))
  }
  fd.append('file', file)

  let url = `${BASE}/api/predict-csv`
  if (modelId) url += `?model=${encodeURIComponent(modelId)}`

  const res = await fetch(url, { method: 'POST', body: fd })
  return handleJson(res, 'Batch predict failed')
}

// --- download ready-to-fill template (CSV text) ---
export async function getTemplateCsv() {
  const res = await fetch(`${BASE}/api/template`)
  if (!res.ok) throw new Error('Template fetch failed')
  return res.text()
}

// --- dashboard metrics (switchable by model) ---
export async function getMetrics(modelId) {
  const q = modelId ? `?model=${encodeURIComponent(modelId)}` : ''
  const res = await fetch(`${BASE}/api/metrics${q}`)
  return handleJson(res, 'Metrics fetch failed')
}

// --- top risky transactions for the table (switchable by model) ---
export async function getTopRisks(limit = 50, modelId) {
  const q = `?limit=${encodeURIComponent(limit)}${modelId ? `&model=${encodeURIComponent(modelId)}` : ''}`
  const res = await fetch(`${BASE}/api/top-risks${q}`)
  return handleJson(res, 'Top risks fetch failed')
}

// --- exact ROC/PR curves if available (switchable by model) ---
export async function getCurves(modelId) {
  const q = modelId ? `?model=${encodeURIComponent(modelId)}` : ''
  const res = await fetch(`${BASE}/api/curves${q}`)
  if (!res.ok) throw new Error('Curves fetch failed')
  return res.json()
}

// --- refresh server-side artifacts cache (if you added that endpoint) ---
export async function refreshArtifacts() {
  const res = await fetch(`${BASE}/api/refresh-artifacts?force=1`, { method: 'POST' })
  if (!res.ok) throw new Error((await parseMaybeJson(res)).detail || 'Refresh failed')
  return res.json()
}
