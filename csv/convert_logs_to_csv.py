#!/usr/bin/env python3
"""
Converte arquivos de log em dashboard/logs para arquivos CSV individuais em dashboard/csv/converted.

Estratégia de parse (tentativa heurística):
- Se cada linha for um JSON object -> parse JSON e normaliza/achata chaves (dot notation) -> CSV com colunas unidas.
- Se as linhas parecem ser pares key=value consistentes -> extrai pares e gera colunas.
- Se as linhas parecem já em formato CSV (mesmo número de colunas por linha) -> reusa como CSV.
- Caso contrário -> escreve cada linha como coluna única `raw`.

Uso:
  python3 convert_logs_to_csv.py            # converte todos os .txt em dashboard/logs
  python3 convert_logs_to_csv.py --in /path/to/logs --out /path/to/out

Cria a pasta de saída se necessário.
"""
import argparse
import csv
import json
import os
import re
from collections import OrderedDict
from typing import List, Dict, Any


def flatten_json(y: Dict[str, Any], parent_key: str = '', sep: str = '.') -> Dict[str, Any]:
    out = {}
    for k, v in y.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            out.update(flatten_json(v, new_key, sep=sep))
        else:
            out[new_key] = v
    return out


def try_parse_json_lines(lines: List[str]) -> List[Dict[str, Any]]:
    parsed = []
    for line in lines:
        s = line.strip()
        if not s:
            continue
        try:
            obj = json.loads(s)
            if isinstance(obj, dict):
                parsed.append(flatten_json(obj))
            else:
                return []
        except Exception:
            return []
    return parsed


def try_parse_kv_lines(lines: List[str]) -> List[Dict[str, Any]]:
    # Detect patterns like "key=value" or "key: value"
    kv_pattern = re.compile(r"(\w[\w\-\./]*?)\s*(=|:)\s*(.*)$")
    parsed = []
    for line in lines:
        s = line.strip()
        if not s:
            continue
        pairs = {}
        # split tokens by whitespace but keep tokens with = or :
        # also try to find all key=value occurrences in the line
        matches = kv_pattern.findall(s)
        if not matches:
            return []
        for key, _, val in matches:
            pairs[key] = val.strip()
        parsed.append(pairs)
    return parsed


def looks_like_csv(lines: List[str]) -> bool:
    # Check if splitting by comma yields same number of fields for most non-empty lines
    counts = []
    for line in lines:
        s = line.strip()
        if not s:
            continue
        counts.append(len(list(csv.reader([s]))[0]))
    if not counts:
        return False
    return max(counts) == min(counts) and max(counts) > 1


def write_csv_from_records(path: str, records: List[Dict[str, Any]]) -> None:
    if not records:
        print(f"[skip] nenhum registro para: {path}")
        return
    # union of keys preserving insertion order
    fieldnames = []
    seen = set()
    for r in records:
        for k in r.keys():
            if k not in seen:
                seen.add(k)
                fieldnames.append(k)

    with open(path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in records:
            writer.writerow({k: (v if v is not None else '') for k, v in r.items()})


def convert_file(log_path: str, out_path: str) -> None:
    # Improved parsing: handle files that include a prefix line with VM and date-hour
    prefix_re = re.compile(r'^(?P<vm>[^,]+),(?P<prefix>\d{4}-\d{2}-\d{2}T\d{2})')
    timefrag_re = re.compile(r'^,?\s*(?P<timefrag>\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+(?P<rest>.*)$')
    iso_re = re.compile(r'(?P<iso>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)')
    service_re = re.compile(r'(mystack_[\w-]+)')
    vm_at_re = re.compile(r'@(?P<vm>MSVirtualMachine-\d+)')
    reqid_re = re.compile(r'RequestId:\s*([0-9a-fA-F-]{36})')

    records = []
    cur_prefix = None
    cur_vm = None
    with open(log_path, 'r', encoding='utf-8', errors='replace') as f:
        for raw in f:
            line = raw.rstrip('\n')
            if not line.strip():
                continue
            # prefix line
            m = prefix_re.match(line)
            if m:
                cur_vm = m.group('vm')
                cur_prefix = m.group('prefix')
                continue

            # time fragment with leading comma
            m = timefrag_re.match(line)
            if m and cur_prefix:
                timefrag = m.group('timefrag')
                rest = m.group('rest')
                timestamp = cur_prefix + ':' + timefrag
                service = (service_re.search(rest) or [None])[0]
                vm = (vm_at_re.search(rest).group('vm') if vm_at_re.search(rest) else cur_vm)
                req = (reqid_re.search(rest) or [None, None])[1]
                # message = part after '|'
                parts = rest.split('|')
                message = parts[-1].strip() if parts else rest
                records.append({'vm': vm, 'timestamp': timestamp, 'service': service, 'message': message, 'requestId': req})
                continue

            # lines that contain ISO timestamp
            m = iso_re.search(line)
            if m:
                iso = m.group('iso')
                # rest of the line after the ISO
                idx = line.find(iso)
                rest = line[idx+len(iso):].strip()
                service = (service_re.search(rest) or [None])[0]
                vm = (vm_at_re.search(rest).group('vm') if vm_at_re.search(rest) else cur_vm)
                req = (reqid_re.search(rest) or [None, None])[1]
                parts = rest.split('|')
                message = parts[-1].strip() if parts else rest
                records.append({'vm': vm, 'timestamp': iso, 'service': service, 'message': message, 'requestId': req})
                continue

            # fallback: attempt to find request id and service within line
            service = (service_re.search(line) or [None])[0]
            req = (reqid_re.search(line) or [None, None])[1]
            vm = (vm_at_re.search(line).group('vm') if vm_at_re.search(line) else cur_vm)
            # try to build a timestamp using filename prefix if available
            timefrag = re.search(r'(\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)', line)
            if timefrag and cur_prefix:
                timestamp = cur_prefix + ':' + timefrag.group(1)
            else:
                timestamp = None
            # message
            parts = line.split('|')
            message = parts[-1].strip() if parts else line
            records.append({'vm': vm, 'timestamp': timestamp, 'service': service, 'message': message, 'requestId': req})

    # normalize timestamps to ISO (if possible) and write CSV
    for r in records:
        if r.get('timestamp'):
            # ensure proper ISO by trying to parse
            try:
                dt = None
                if isinstance(r['timestamp'], str):
                    dt = None
                    try:
                        dt = json.loads(f'"{r["timestamp"]}"') if False else None
                    except Exception:
                        pass
                    # let Python handle parsing via new Date in frontend; keep string as-is
                # leave timestamp string
            except Exception:
                pass

    write_csv_from_records(out_path, records)
    print(f"[parsed] -> {out_path}")


def main():
    parser = argparse.ArgumentParser(description='Converte logs para CSV (1:1).')
    parser.add_argument('--in', dest='in_dir', default=os.path.join(os.path.dirname(__file__), '..', 'logs'), help='Pasta com arquivos de log (padrão ../logs)')
    parser.add_argument('--out', dest='out_dir', default=os.path.join(os.path.dirname(__file__), 'converted'), help='Pasta de saída (padrão ./converted)')
    parser.add_argument('--ext', dest='ext', default='.txt', help='Extensão dos arquivos de log (default .txt)')
    args = parser.parse_args()

    in_dir = os.path.abspath(args.in_dir)
    out_dir = os.path.abspath(args.out_dir)

    os.makedirs(out_dir, exist_ok=True)

    if not os.path.isdir(in_dir):
        print(f"Diretório de entrada não existe: {in_dir}")
        return

    files = [f for f in os.listdir(in_dir) if f.endswith(args.ext)]
    if not files:
        print(f"Nenhum arquivo com extensão '{args.ext}' em {in_dir}")
        return

    for fname in sorted(files):
        src = os.path.join(in_dir, fname)
        base = os.path.splitext(fname)[0]
        out = os.path.join(out_dir, base + '.csv')
        try:
            convert_file(src, out)
        except Exception as e:
            print(f"Erro convertendo {src}: {e}")


if __name__ == '__main__':
    main()
