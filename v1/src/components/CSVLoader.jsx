import React, { useState } from 'react'

export default function CSVLoader({ files = [], onLoadServer, onUpload }) {
  const [azureOpen, setAzureOpen] = useState(false)
  const [awsOpen, setAwsOpen] = useState(false)
  const [onPremOpen, setOnPremOpen] = useState(false)
  const buttonStyle = {
    background: 'none',
    border: '1px solid #ccc',
    padding: '8px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    width: 160,
    justifyContent: 'space-between'
  }

  return (
    <div>
      <div>
        <strong>Environment</strong>

        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={() => setAzureOpen(o => !o)} aria-expanded={azureOpen} style={buttonStyle}>
            <span>Azure</span>
            <span style={{ transform: azureOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>▶</span>
          </button>

          {azureOpen && (
            <div style={{ marginTop: 8 }}>
              {files.length === 0 ? (
                <div style={{ color: '#666' }}>
                  Nenhum manifesto encontrado. Rode <code>npm run prepare-csvs</code> no diretório v1.
                </div>
              ) : (
                <ul className="file-list">
                  {files.map(f => (
                    <li key={f} onClick={() => onLoadServer(f)} style={{ cursor: 'pointer' }}>
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={() => setAwsOpen(o => !o)} aria-expanded={awsOpen} style={buttonStyle}>
            <span>AWS</span>
            <span style={{ transform: awsOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>▶</span>
          </button>

          {awsOpen && (
            <div style={{ marginTop: 8 }}>
              <ul className="file-list">
                <li style={{ color: '#666' }}>No content</li>
              </ul>
            </div>
          )}
        </div>

        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={() => setOnPremOpen(o => !o)} aria-expanded={onPremOpen} style={buttonStyle}>
            <span>On Premisse</span>
            <span style={{ transform: onPremOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>▶</span>
          </button>

          {onPremOpen && (
            <div style={{ marginTop: 8 }}>
              <ul className="file-list">
                <li style={{ color: '#666' }}>No content</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
