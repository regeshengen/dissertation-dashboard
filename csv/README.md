# Conversor de logs para CSV

Este script converte arquivos em `dashboard/logs` para arquivos CSV individuais em `dashboard/csv/converted`.

Como usar

1. Converter todos os arquivos `.txt` (padrão):

```
python3 convert_logs_to_csv.py
```

2. Especificar diretório de entrada ou saída:

```
python3 convert_logs_to_csv.py --in /caminho/para/logs --out ./converted
```

Comportamento do parser (heurística):

- Se cada linha do arquivo for um JSON válido, cada JSON vira uma linha no CSV, com chaves achatadas usando `.`.
- Se as linhas contiverem pares `key=value` ou `key: value`, estes viram colunas.
- Se as linhas forem parecidas com CSV (mesmo número de colunas), o script reusa o formato e gera um CSV.
- Caso contrário, cada linha do log vira uma linha com a coluna `raw`.

Saída

Arquivos CSV serão gravados em `dashboard/csv/converted` com o mesmo nome base do arquivo de log.

Notas

- O script tenta adivinhar o formato; se você tiver um formato específico de logs, me diga e eu adapto o parser.
- Suporta logs UTF-8 com fallback para replacement em caracteres inválidos.
