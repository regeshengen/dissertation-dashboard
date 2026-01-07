# Dashboard v1

Aplicação React (Vite) que consome CSVs de load test e mostra timelines por RequestId.

Setup rápido

1. Entre na pasta:

```bash
cd dashboard/v1
```

2. Instale dependências e prepare CSVs:

```bash
npm install
npm run prepare-csvs
```

> Nota: este projeto usa Material UI para o visual (estilo Material Dashboard). As dependências `@mui/material`, `@emotion/react`, `@emotion/styled` e `@mui/icons-material` foram adicionadas ao `package.json`.

O comando `prepare-csvs` copia os CSVs de `../csv/converted` para `public/csv` e cria `public/csv-files.json`.

3. Rode em modo desenvolvimento:

```bash
npm run dev
```

Uso

- A UI lista os CSVs copiados; clique em um para carregar.
- Alternativamente carregue um CSV local via upload.
- Selecione um Request à esquerda para ver timeline e eventos detalhados.

Notas

- O parser faz heurísticas para extrair RequestId, serviço e timestamp a partir do texto bruto do log (procure por `RequestId:` e fragmentos de tempo). Se você precisa de parsing mais exato, posso ajustar as expressões regulares para seu formato.
