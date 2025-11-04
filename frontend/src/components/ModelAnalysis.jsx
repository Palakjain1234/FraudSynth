// src/components/ModelAnalysis.jsx
import { useEffect, useState } from 'react'
import { getMetrics, getTopRisks, getCurves } from '../api'

import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend
} from 'chart.js'
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend)

export default function ModelAnalysis(){
  const [data, setData] = useState(null)
  const [risks, setRisks] = useState([])
  const [curves, setCurves] = useState(null)

  useEffect(() => {
    (async () => {
      const m = await getMetrics()
      const r = await getTopRisks(25)
      setData(m)
      setRisks(r.rows || [])
      try { setCurves(await getCurves()) } catch { /* optional */ }
    })()
  }, [])

  if (!data) return <div className="card">Loading…</div>

  // ---- normalize sweep ----
  const sweep = (data.threshold || [])
    .map(r => ({
      t: Number(r.threshold),
      p: Number(r.precisio ?? r.precision ?? r.Precision ?? 0),
      r: Number(r.recall ?? r.Recall ?? 0),
      fp: r.false_pos ?? r.FP ?? r.fp,
      fn: r.false_neg ?? r.FN ?? r.fn,
      tp: r.true_pos ?? r.TP ?? r.tp,
    }))
    .filter(d => Number.isFinite(d.t) && Number.isFinite(d.p) && Number.isFinite(d.r))
    .sort((a, b) => a.t - b.t)

  // ---- quality bars ----
  const qual10 = (data.quality || []).slice(0, 10).map(r => ({
    f: r.Feature ?? r.feature ?? '',
    d: Math.abs(Number(r.Mean_Diff ?? r.mean_diff ?? r.delta_mean ?? 0)),
  }))

  // ---- probability histogram (auto-detect key) ----
  const sample0 = (data.samples || [])[0] || {}
  const probKey = Object.keys(sample0).find(k => /fraud.*prob/i.test(k))
                 || Object.keys(sample0).find(k => /proba|score/i.test(k))
                 || 'fraud_probability'
  const samples50 = (data.samples || []).slice(0, 50).map(s => Number(s?.[probKey] ?? 0))

  const prAt50 = (() => {
    if (sweep.length === 0) return { precision: 0, recall: 0 }
    const exact = sweep.find(x => x.t.toFixed(2) === '0.50')
    const pick = exact ?? sweep[Math.floor(sweep.length / 2)]
    return { precision: pick.p, recall: pick.r }
  })()

  return (
    <div className="grid">

      {/* ===== Your existing 4 charts ===== */}
      <div className="card col-6">
        <h3>Precision &amp; Recall across thresholds (τ)</h3>
        <Line
          data={{
            labels: sweep.map(d => d.t.toFixed(2)),
            datasets: [
              { label: 'Precision', data: sweep.map(d => d.p), borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.2)', tension: 0.25, pointRadius: 2 },
              { label: 'Recall',    data: sweep.map(d => d.r), borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,0.2)', tension: 0.25, pointRadius: 2 },
            ]
          }}
          options={{
            plugins: { legend: { position: 'bottom' } },
            scales: { x: { title: { display: true, text: 'Threshold (τ)' } }, y: { min: 0, max: 1 } }
          }}
        />
      </div>

      <div className="card col-6">
        <h3>Precision–Recall Curve (from sweep)</h3>
        <Line
          data={{
            datasets: [{
              label: 'Precision vs Recall',
              data: sweep.map(d => ({ x: d.r, y: d.p })),
              borderColor: '#facc15', backgroundColor: 'rgba(250,204,21,0.3)', showLine: true, tension: 0.15, pointRadius: 2
            }]
          }}
          options={{
            parsing: false,
            plugins: { legend: { position: 'bottom' } },
            scales: { x: { type: 'linear', title: { display: true, text: 'Recall' }, min: 0, max: 1 },
                      y: { title: { display: true, text: 'Precision' }, min: 0, max: 1 } }
          }}
        />
      </div>

      <div className="card col-6">
        <h3>Feature mean difference |Δμ| (first 10)</h3>
        <Bar
          data={{ labels: qual10.map(q => q.f), datasets: [{ label: '|Δμ|', data: qual10.map(q => q.d), backgroundColor: 'rgba(167,139,250,0.6)' }] }}
          options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }}
        />
      </div>

      <div className="card col-6">
        <h3>Fraud probability distribution (test sample)</h3>
        <Bar
          data={{ labels: samples50.map((_, i) => i + 1), datasets: [{ label: 'Fraud Probability', data: samples50, backgroundColor: 'rgba(239,68,68,0.6)' }] }}
          options={{ plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 1, title: { display: true, text: 'Probability' } }, x: { title: { display: true, text: 'Sample index' } } } }}
        />
      </div>

      {/* ===== NEW: exact model curves (if /api/curves succeeded) ===== */}
      {curves && (
        <>
          <div className="card col-6">
            <h3>ROC Curve (exact)</h3>
            <Line
              data={{
                labels: curves.roc.fpr.map((_, i) => i),
                datasets: [{
                  label: `ROC AUC = ${Number(curves.roc.auc).toFixed(3)}`,
                  data: curves.roc.fpr.map((x, i) => ({ x: Number(x), y: Number(curves.roc.tpr[i]) })),
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

          <div className="card col-6">
            <h3>Precision–Recall Curve (exact)</h3>
            <Line
              data={{
                labels: curves.pr.recall.map((_, i) => i),
                datasets: [{
                  label: curves.pr.ap ? `AP = ${Number(curves.pr.ap).toFixed(3)}` : 'Precision vs Recall',
                  data: curves.pr.recall.map((r, i) => ({ x: Number(r), y: Number(curves.pr.precision[i]) })),
                  borderColor: '#facc15', backgroundColor: 'rgba(250,204,21,0.3)', showLine: true, tension: 0, pointRadius: 0
                }]
              }}
              options={{
                parsing: false,
                plugins: { legend: { position: 'bottom' } },
                scales: { x: { type: 'linear', min: 0, max: 1, title: { display: true, text: 'Recall' } },
                          y: { min: 0, max: 1, title: { display: true, text: 'Precision' } } }
              }}
            />
          </div>

          {/* <div className="card col-12">
            <h3>Top 15 Features Influencing Fraud Detection (exact)</h3>
            <Bar
              data={{
                labels: (curves.feature_importance || []).map(r => r.feature),
                datasets: [{ label: 'Importance', data: (curves.feature_importance || []).map(r => Number(r.importance)), backgroundColor: 'rgba(167,139,250,0.7)' }]
              }}
              options={{
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: { x: { title: { display: true, text: 'Feature Importance Score' } },
                          y: { title: { display: true, text: 'Feature Name' } } }
              }}
            />
          </div> */}
        </>
      )}

      {/* ===== Tables remain the same ===== */}
      <div className="card col-6">
        <h3>Threshold sweep</h3>
        <div className="note">Quick view of precision/recall across thresholds.</div>
        <table className="table">
          <thead><tr><th>τ</th><th>Precision</th><th>Recall</th><th>FP</th><th>FN</th><th>TP</th></tr></thead>
        <tbody>
          {sweep.slice(0, 12).map((r, i) => (
            <tr key={i}><td>{r.t.toFixed(2)}</td><td>{r.p.toFixed(3)}</td><td>{r.r.toFixed(3)}</td><td>{r.fp}</td><td>{r.fn}</td><td>{r.tp}</td></tr>
          ))}
        </tbody>
        </table>
        <div style={{ marginTop: 8 }}>
          <span className={prAt50.precision > 0.9 ? 'badge ok' : prAt50.recall > 0.7 ? 'badge warn' : 'badge bad'}>
            @0.50 ➜ P={prAt50.precision.toFixed(2)}, R={prAt50.recall.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="card col-6">
        <h3>Synthetic vs Real — quality check</h3>
        <div className="note">Means &amp; stds across features (first 10)</div>
        <table className="table">
          <thead><tr><th>Feature</th><th>Real μ</th><th>Syn μ</th><th>|Δμ|</th><th>Real σ</th><th>Syn σ</th><th>σ ratio</th></tr></thead>
          <tbody>
            {(data.quality || []).slice(0, 10).map((r, i) => (
              <tr key={i}><td>{r.Feature}</td><td>{(+r.Real_Mean).toFixed(3)}</td><td>{(+r.Syn_Mean).toFixed(3)}</td><td>{(+r.Mean_Diff).toFixed(3)}</td><td>{(+r.Real_Std).toFixed(3)}</td><td>{(+r.syn_Std || +r.Syn_Std || 0).toFixed(3)}</td><td>{(+r.Std_Ratio).toFixed(3)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card col-12">
        <h3>Top risky transactions</h3>
        <table className="table">
          <thead><tr><th>#</th><th>Time</th><th>Amount</th><th>Prob</th><th>Decision</th><th>True</th></tr></thead>
          <tbody>
            {risks.map((r, i) => {
              const prob = Number(r.fraud_probability || 0)
              const cls = prob > 0.9 ? 'badge bad' : prob > 0.7 ? 'badge warn' : 'badge ok'
              return (
                <tr key={i}><td>{i+1}</td><td>{r.Time}</td><td>${Number(r.Amount).toFixed(2)}</td>
                  <td><span className={cls}>{prob.toFixed(3)}</span></td><td>{r.model_decision}</td><td>{r.true_label}</td></tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
