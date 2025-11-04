// import { useState } from 'react';
// import { predict } from '../api';

// const FEATURE_ORDER = [
//   'Time','Amount',
//   'V1','V2','V3','V4','V5','V6','V7','V8','V9','V10','V11','V12','V13','V14','V15','V16','V17','V18','V19','V20','V21','V22','V23','V24','V25','V26','V27','V28'
// ];

// export default function UserInput({ user, onRequireAuth }) {
//   const [form, setForm] = useState({ Time:'', Amount:'' });
//   const [rows, setRows] = useState([]);
//   const [threshold, setThreshold] = useState(0.5);
//   const [advanced, setAdvanced] = useState(false);

//   function setField(k, v) {
//     setForm(prev => ({ ...prev, [k]: v }));
//   }

//   async function onSubmit() {
//     if (!user) {
//       onRequireAuth?.();
//       alert('Please sign in');
//       return;
//     }

//     try {
//       const input = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
//       const res = await predict(user._id, input, Number(threshold));
//       const prob = Number(res.probability);
//       const decision = res.decision;

//       setRows(prev => [{ ...res.filled, fraud_probability: prob, decision }, ...prev]);
//     } catch (err) {
//       alert('Prediction failed: ' + err.message);
//     }
//   }

//   return (
//     <div className="grid">
//       {/* Input Form */}
//       <div className="card col-12">
//         <div className="header">
//           <h3>Enter transaction</h3>
//           <div className="row" style={{ maxWidth: 420 }}>
//             <input
//               className="input"
//               type="number"
//               step="0.01"
//               value={threshold}
//               onChange={e => setThreshold(e.target.value)}
//               placeholder="Threshold τ (0-1)"
//             />
//             <button className="btn primary" onClick={onSubmit}>Predict</button>
//           </div>
//         </div>

//         <div className="row">
//           <input
//             className="input"
//             placeholder="Time (seconds)"
//             value={form.Time}
//             onChange={e => setField('Time', e.target.value)}
//           />
//           <input
//             className="input"
//             placeholder="Amount"
//             value={form.Amount}
//             onChange={e => setField('Amount', e.target.value)}
//           />
//         </div>

//         <div style={{ marginTop: 12 }}>
//           <label>
//             <input
//               type="checkbox"
//               checked={advanced}
//               onChange={e => setAdvanced(e.target.checked)}
//             /> Advanced: provide V1–V28
//           </label>
//           <div className="note">
//             If you leave any fields blank, the system imputes with training medians (shown below after prediction).
//           </div>
//         </div>

//         {advanced && (
//           <div className="grid" style={{ marginTop: 12 }}>
//             {FEATURE_ORDER.slice(2).map(k => (
//               <div key={k} className="col-6">
//                 <input
//                   className="input"
//                   placeholder={k}
//                   value={form[k] || ''}
//                   onChange={e => setField(k, e.target.value)}
//                 />
//               </div>
//             ))}
//           </div>
//         )}
//       </div>

//       {/* Predictions Table */}
//       <div className="card col-12">
//         <h3>Predictions</h3>
//         <table className="table">
//           <thead>
//             <tr>
//               <th>Time</th>
//               <th>Amount</th>
//               <th>Prob</th>
//               <th>Decision</th>
//             </tr>
//           </thead>
//           <tbody>
//             {rows.map((r, i) => {
//               const prob = Number(r.fraud_probability || 0);
//               const cls = prob > 0.9 ? 'badge bad' : prob > 0.7 ? 'badge warn' : 'badge ok';
//               return (
//                 <tr key={i}>
//                   <td>{Number(r.Time).toFixed(0)}</td>
//                   <td>${Number(r.Amount).toFixed(2)}</td>
//                   <td><span className={cls}>{prob.toFixed(3)}</span></td>
//                   <td>{r.decision}</td>
//                 </tr>
//               );
//             })}
//           </tbody>
//         </table>
//       </div>
//     </div>
//   );
// }
import { useState, useRef } from 'react'
import { predictCsv, getTemplateCsv } from '../api'

export default function UserInput() {
  const [threshold, setThreshold] = useState(0.5)
  const [rows, setRows] = useState([])
  const [cols, setCols] = useState([])
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const fileRef = useRef(null)

  async function handleDownloadTemplate() {
    try {
      const text = await getTemplateCsv()
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'fraudsynth_template.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Template download error:', e)
    }
  }

  function onPickFile() {
    fileRef.current?.click()
  }

  function onFileChange(e) {
    const f = e.target.files?.[0]
    setFileName(f ? f.name : '')
  }

  async function onPredict() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const res = await predictCsv(file, Number(threshold)) // guest mode
      setCols(res.columns || [])
      setRows(res.rows || [])
    } catch (err) {
      console.error('Batch prediction failed:', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid">
      {/* Upload card */}
      <div className="card col-12">
        <div className="header">
          <h3>Batch score transactions (CSV/XLSX)</h3>
          <div className="row" style={{ maxWidth: 560 }}>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={threshold}
              onChange={e => setThreshold(e.target.value)}
              placeholder="Threshold τ (0-1)"
            />
            <button className="btn template" onClick={handleDownloadTemplate}>
              Download template
            </button>
          </div>
        </div>

        <div className="row" style={{ alignItems: 'center' }}>
          {/* hidden file input */}
          <input
            ref={fileRef}
            type="file"
            accept=".csv, .xlsx, .xls, text/csv"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />

          {/* left: upload icon button */}
          <button className="icon-btn" title="Upload file" onClick={onPickFile} aria-label="Upload">
            {/* upload arrow icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 16V4m0 0l-4 4m4-4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* middle: filename */}
          <div className="file-chip">{fileName || 'No file chosen'}</div>

          {/* right: Predict button */}
          <button className="btn primary" onClick={onPredict} disabled={busy || !fileName}>
            {busy ? 'Scoring…' : 'Predict'}
          </button>
        </div>

        <div className="note" style={{ marginTop: 8 }}>
          Use the template to get the correct header order (Time, V1–V28, Amount). Missing values are safely imputed with training medians.
        </div>
      </div>

      {/* Results table */}
      <div className="card col-12">
        <h3>Predictions</h3>
        {rows.length === 0 ? (
          <div className="note">Upload, then click Predict to see results here.</div>
        ) : (
          <div className="scrollarea">
            <table className="table">
              <thead>
                <tr>{cols.map((c, i) => <th key={i}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const prob = Number(r.fraud_probability ?? 0)
                  const badge = prob > 0.9 ? 'badge bad' : prob > 0.7 ? 'badge warn' : 'badge ok'
                  return (
                    <tr key={i}>
                      {cols.map((c, j) => {
                        if (c === 'fraud_probability') return <td key={j}><span className={badge}>{prob.toFixed(3)}</span></td>
                        if (c === 'Amount') return <td key={j}>${Number(r[c]).toFixed(2)}</td>
                        return <td key={j}>{String(r[c] ?? '')}</td>
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

