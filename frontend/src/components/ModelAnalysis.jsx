// src/components/ModelAnalysis.jsx
import { useEffect, useMemo, useState, useCallback } from 'react'
import { getMetrics, getTopRisks, getCurves } from '../api'
import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend
} from 'chart.js'
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend)

/** ————— Model tabs & render policy ————— */
const MODELS = [
  { id: 'wgangp-lightgbm', label: 'WGAN-GP + LightGBM' },
  { id: 'CTGAN',            label: 'CTGAN' },
]

const RENDER = {
  'wgangp-lightgbm': {
    showThreshold: true,     // chart 1: Precision/Recall vs τ
    showQuality:   true,     // chart 2: |Δμ| bar
    showHistogram: true,     // chart 3: probability distribution
    showExactROC:  true,     // chart 4: ROC (exact)
    showExactPR:   true,     // chart 5: PR (exact)
    showTables:    true,     // threshold table + risks table
  },
  'CTGAN': {
    showThreshold: true,     // chart A: Precision/Recall vs τ
    showQuality:   false,    // hide |Δμ|
    showHistogram: false,    // hide histogram
    showExactROC:  true,     // chart B: ROC (exact)
    showExactPR:   true,     // chart C: PR (exact)
    showTables:    false,    // hide all tables
  }
}

export default function ModelAnalysis(){
  const [activeModel, setActiveModel] = useState('wgangp-lightgbm')
  return (
    <>
      <div className="subnav">
        {MODELS.map(m => (
          <button
            key={m.id}
            className={`subnav-btn ${activeModel === m.id ? 'active' : ''}`}
            onClick={() => setActiveModel(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <ModelPanel modelId={activeModel} />
    </>
  )
}

function ModelPanel({ modelId }){
  const [data, setData] = useState(null)
  const [risks, setRisks] = useState([])
  const [curves, setCurves] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [m, r] = await Promise.all([
        getMetrics(modelId),
        getTopRisks(25, modelId),
      ])
      setData(m || { threshold: [], quality: [], samples: [] })
      setRisks(r?.rows || [])
      // curves optional
      try {
        const c = await getCurves(modelId)
        setCurves((c && c.roc && c.pr) ? c : null)
      } catch {
        setCurves(null)
      }
    } catch (e) {
      setError(e?.message || 'Failed to load model analysis')
      setData({ threshold: [], quality: [], samples: [] })
      setRisks([]); setCurves(null)
    } finally { setLoading(false) }
  }, [modelId])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="card">Loading…</div>
  if (error) {
    return (
      <div className="card">
        <h3>Couldn’t load analysis</h3>
        <p style={{ marginTop: 8 }}>{error}</p>
        <button className="subnav-btn active" onClick={load}>Retry</button>
        <div className="note" style={{ marginTop: 8 }}>
          Ensure the backend is running and <code>/api/metrics?model={modelId}</code> returns JSON.
        </div>
      </div>
    )
  }

  const policy = RENDER[modelId] || RENDER['wgangp-lightgbm']
  return <Renderer data={data} risks={risks} curves={curves} policy={policy} />
}

/** ————— Generic renderer with per-model policy ————— */
function Renderer({ data, risks, curves, policy }){
  const sweepRaw   = Array.isArray(data?.threshold) ? data.threshold : []
  const qualRaw    = Array.isArray(data?.quality)   ? data.quality   : []
  const samplesRaw = Array.isArray(data?.samples)   ? data.samples   : []

  const sweep = useMemo(() => (
    sweepRaw.map(r => ({
      t: toNum(r.threshold),
      p: toNum(r.precisio ?? r.precision ?? r.Precision),
      r: toNum(r.recall ?? r.Recall),
      fp: or0(r.false_pos ?? r.FP ?? r.fp),
      fn: or0(r.false_neg ?? r.FN ?? r.fn),
      tp: or0(r.true_pos  ?? r.TP ?? r.tp),
    }))
    .filter(d => isFiniteNum(d.t) && isFiniteNum(d.p) && isFiniteNum(d.r))
    .sort((a, b) => a.t - b.t)
  ), [sweepRaw])

  const qual10 = useMemo(() => (
    qualRaw.slice(0, 10).map(r => ({
      f: String(r.Feature ?? r.feature ?? ''),
      d: Math.abs(toNum(r.Mean_Diff ?? r.mean_diff ?? r.delta_mean)),
    }))
  ), [qualRaw])

  const probKey = samplesRaw[0]
    ? Object.keys(samplesRaw[0]).find(k => /fraud.*prob/i.test(k))
      || Object.keys(samplesRaw[0]).find(k => /(proba|score)/i.test(k))
      || 'fraud_probability'
    : 'fraud_probability'
  const samples50 = samplesRaw.slice(0, 50).map(s => clamp01(s?.[probKey]))

  const prAt50 = (() => {
    if (!sweep.length) return { precision: 0, recall: 0 }
    const exact = sweep.find(x => x?.t?.toFixed?.(2) === '0.50')
    const pick  = exact ?? sweep[Math.floor(sweep.length / 2)]
    return { precision: pick.p ?? 0, recall: pick.r ?? 0 }
  })()

  return (
    <div className="grid">
      {policy.showThreshold && (
        <div className="card col-6">
          <h3>Precision &amp; Recall across thresholds (τ)</h3>
          <Line
            data={{
              labels: sweep.map(d => safeFixed(d.t, 2)),
              datasets: [
                { label: 'Precision', data: sweep.map(d => clamp01(d.p)), borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.2)', tension: 0.25, pointRadius: 2 },
                { label: 'Recall',    data: sweep.map(d => clamp01(d.r)), borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,0.2)', tension: 0.25, pointRadius: 2 },
              ]
            }}
            options={{ plugins: { legend: { position: 'bottom' } }, scales: { x: { title: { display: true, text: 'Threshold (τ)' } }, y: { min: 0, max: 1 } } }}
          />
        </div>
      )}

      {policy.showQuality && (
        <div className="card col-6">
          <h3>Feature mean difference |Δμ| (first 10)</h3>
          <Bar
            data={{ labels: qual10.map(q => q.f), datasets: [{ label: '|Δμ|', data: qual10.map(q => q.d), backgroundColor: 'rgba(167,139,250,0.6)' }] }}
            options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }}
          />
        </div>
      )}

      {policy.showHistogram && (
        <div className="card col-6">
          <h3>Fraud probability distribution (sample)</h3>
          <Bar
            data={{ labels: samples50.map((_, i) => i + 1), datasets: [{ label: 'Fraud Probability', data: samples50, backgroundColor: 'rgba(239,68,68,0.6)' }] }}
            options={{ plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 1, title: { display: true, text: 'Probability' } }, x: { title: { display: true, text: 'Sample index' } } } }}
          />
        </div>
      )}

      {policy.showExactROC && curves?.roc?.fpr?.length > 0 && curves?.roc?.tpr?.length > 0 && (
        <div className="card col-6">
          <h3>ROC Curve (exact)</h3>
          <Line
            data={{
              datasets: [{
                label: `ROC AUC${isFiniteNum(curves.roc.auc) ? ` = ${Number(curves.roc.auc).toFixed(3)}` : ''}`,
                data: curves.roc.fpr.map((x, i) => ({ x: toNum(x, 0), y: toNum(curves.roc.tpr[i], 0) })),
                borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.2)', showLine: true, tension: 0, pointRadius: 0
              }]
            }}
            options={{
              parsing: false,
              plugins: { legend: { position: 'bottom' } },
              scales: { x: { type: 'linear', min: 0, max: 1, title: { display: true, text: 'False Positive Rate' } },
                        y: { min: 0, max: 1, title: { display: true, text: 'True Positive Rate' } } }
            }}
          />
        </div>
      )}

      {policy.showExactPR && curves?.pr?.precision?.length > 0 && curves?.pr?.recall?.length > 0 && (
        <div className="card col-6">
          <h3>Precision–Recall Curve (exact)</h3>
          <Line
            data={{
              datasets: [{
                label: isFiniteNum(curves.pr.ap) ? `AP = ${Number(curves.pr.ap).toFixed(3)}` : 'Precision vs Recall',
                data: curves.pr.recall.map((r, i) => ({ x: toNum(r, 0), y: toNum(curves.pr.precision[i], 0) })),
                borderColor: '#facc15', backgroundColor: 'rgba(250,204,21,0.3)', showLine: true, tension: 0.2, pointRadius: 0
              }]
            }}
            options={{
              parsing: false,
              plugins: { legend: { position: 'bottom' } },
              scales: {
                x: { type: 'linear', min: 0, max: 1, title: { display: true, text: 'Recall' } },
                y: { min: 0, max: 1, title: { display: true, text: 'Precision' } }
              }
            }}
          />
        </div>
      )}

      {policy.showTables && <ThresholdTable sweep={sweep} prAt50={prAt50} />}
      {policy.showTables && <RiskTable risks={Array.isArray(risks) ? risks : []} />}
    </div>
  )
}

/** ————— Tables ————— */
function ThresholdTable({ sweep, prAt50 }){
  return (
    <div className="card col-12">
      <h3>Threshold sweep</h3>
      <div className="scrollarea">
        <table className="table roomy zebra wide">
          <thead>
            <tr>
              <th style={{whiteSpace:'nowrap'}}>τ</th>
              <th>Precision</th>
              <th>Recall</th>
              <th className="num">FP</th>
              <th className="num">FN</th>
              <th className="num">TP</th>
            </tr>
          </thead>
          <tbody>
            {(sweep || []).slice(0, 50).map((r, i) => (
              <tr key={i}>
                <td style={{whiteSpace:'nowrap'}}>{safeFixed(r.t, 2)}</td>
                <td>{safeFixed(r.p, 3)}</td>
                <td>{safeFixed(r.r, 3)}</td>
                <td className="num">{r.fp ?? 0}</td>
                <td className="num">{r.fn ?? 0}</td>
                <td className="num">{r.tp ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10 }}>
        <span className="badge ok">
          @0.50 ➜ P={safeFixed(prAt50.precision, 2)}, R={safeFixed(prAt50.recall, 2)}
        </span>
      </div>
    </div>
  )
}

function RiskTable({ risks }){
  return (
    <div className="card col-12">
      <h3>Top risky transactions</h3>
      <table className="table">
        <thead><tr><th>#</th><th>Time</th><th>Amount</th><th>Prob</th><th>Decision</th><th>True</th></tr></thead>
        <tbody>
          {risks.slice(0, 25).map((r, i) => {
            const prob = toNum(r?.fraud_probability ?? r?.proba ?? r?.score)
            const cls = prob > 0.9 ? 'badge bad' : prob > 0.7 ? 'badge warn' : 'badge ok'
            const amt = r?.Amount ?? r?.amount ?? 0
            return (
              <tr key={i}>
                <td>{i+1}</td>
                <td>{r?.Time ?? r?.time ?? ''}</td>
                <td>${safeFixed(amt, 2)}</td>
                <td><span className={cls}>{safeFixed(prob, 3)}</span></td>
                <td>{r?.model_decision ?? ''}</td>
                <td>{r?.true_label ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** ————— Utils ————— */
const toNum = (v, d = 0) => {
  const n = Number(v); return Number.isFinite(n) ? n : d
}
const or0 = (v) => Number.isFinite(Number(v)) ? Number(v) : 0
const isFiniteNum = (n) => Number.isFinite(Number(n))
const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(Number(n)) ? Number(n) : 0))
const safeFixed = (n, k) => Number.isFinite(Number(n)) ? Number(n).toFixed(k) : (0).toFixed(k)
