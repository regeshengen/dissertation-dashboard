const fs = require('fs')
const path = require('path')

const srcDir = path.resolve(__dirname, '..', '..', 'csv', 'converted')
const destDir = path.resolve(__dirname, '..', 'public', 'csv')
const manifestPath = path.resolve(__dirname, '..', 'public', 'csv-files.json')

if (!fs.existsSync(srcDir)) {
  console.error('src dir not found:', srcDir)
  process.exit(1)
}

fs.mkdirSync(destDir, { recursive: true })

const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.csv'))
for (const f of files) {
  fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f))
}

fs.writeFileSync(manifestPath, JSON.stringify(files, null, 2))
console.log('Copied', files.length, 'files to', destDir)
