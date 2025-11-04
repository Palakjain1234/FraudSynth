export default function Sidebar({ tab, setTab }) {
  const Item = ({ id, label, icon }) => (
    <button
      className={`nav-btn ${tab === id ? 'active' : ''}`}
      onClick={() => setTab(id)}
      title={label}                 // native tooltip fallback
      data-tip={label}              // custom tooltip when compact
      aria-label={label}
    >
      <span className="nav-ico" aria-hidden>{icon}</span>
      <span className="nav-label">{label}</span>
    </button>
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-ico">Ⓕ</span>
        <span className="brand-text">FraudSynth</span>
      </div>

      <div className="menu">
        <Item
          id="input"
          label="User Input"
          icon={<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M12 3l4 4h-3v6h-2V7H8l4-4zM5 20h14v-2H5v2z"/>
          </svg>}
        />
        <Item
          id="analysis"
          label="Model Analysis"
          icon={<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M3 13h3v8H3v-8zm7-6h3v14h-3V7zm7 3h3v11h-3V10z"/>
          </svg>}
        />
      </div>
    </aside>
  );
}
