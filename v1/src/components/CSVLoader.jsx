import React from 'react'

export default function CSVLoader({ files = [], onLoadServer, onUpload }) {
  return (
    <div>
      <div>
        <strong>Servidor</strong>
        {files.length === 0 && <div style={{color:'#666'}}>Nenhum manifesto encontrado. Rode <code>npm run prepare-csvs</code> no diretório v1.</div>}
        <ul className="file-list">
          {files.map(f => (
            <li key={f} onClick={() => onLoadServer(f)}>{f}</li>
          ))}
        </ul>
      </div>

      <div style={{marginTop:12}}>
        <strong>Ou faça upload</strong>
        <input type="file" accept=".csv" onChange={e => onUpload(e.target.files[0])} />
      </div>
    </div>
  )
}
