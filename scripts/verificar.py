#!/usr/bin/env python3
"""Revisão estática do Planner (sem navegador). Uso: python3 scripts/verificar.py  (na pasta do app)
Checa: sintaxe (node --check), funções duplicadas entre arquivos, IDs usados no JS e ausentes no HTML,
IDs duplicados, arquivos do service worker e coerência de versão."""
import collections, glob, os, re, subprocess, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(root)
html = open('index.html', encoding='utf-8').read()
files = sorted(glob.glob('js/*.js'))
js = {f: open(f, encoding='utf-8').read() for f in files}
allj = '\n'.join(js.values())
problemas = 0
def titulo(t): print('\n== ' + t)

titulo('Sintaxe')
for f in files + ['sw.js']:
    r = subprocess.run(['node', '--check', f], capture_output=True, text=True)
    if r.returncode: problemas += 1; print('ERRO', f, r.stderr.strip().splitlines()[:3])
print('ok' if not problemas else 'há erros')

titulo('Funções declaradas em mais de um arquivo')
decl = collections.defaultdict(set)
for f, s in js.items():
    for m in re.finditer(r'(?:^|[\s;{}])(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(', s): decl[m.group(1)].add(f)
dups = {k: sorted(v) for k, v in decl.items() if len(v) > 1}
print(dups or 'nenhuma'); problemas += len(dups)

titulo('Constantes/let de topo declaradas em mais de um arquivo')
top = collections.defaultdict(set)
for f, s in js.items():
    for m in re.finditer(r'^(?:const|let|var)\s+([A-Za-z_$][\w$]*)', s, re.M): top[m.group(1)].add(f)
d2 = {k: sorted(v) for k, v in top.items() if len(v) > 1}
print(d2 or 'nenhuma'); problemas += len(d2)

titulo('IDs')
ids = re.findall(r'\bid="([^"]+)"', html)
dupid = [k for k, v in collections.Counter(ids).items() if v > 1]
print('duplicados no HTML:', dupid or 'nenhum'); problemas += len(dupid)
usados = set(re.findall(r"\$\('#([\w\-]+)'\)", allj))
sem = sorted(u for u in usados if u not in ids)
print('usados no JS e ausentes no HTML:', sem or 'nenhum'); problemas += len(sem)

titulo('Chamadas a funções entre arquivos (nome inexistente)')
chamadas = set(re.findall(r'(?<![\w$.])([a-z][A-Za-z0-9_$]*)\(', allj))
conhecidas = set(decl) | {'if','for','while','switch','catch','function','return','async','await','typeof','require'}
com_ponto = set(re.findall(r'\.([A-Za-z_$][\w$]*)\(', allj))
suspeitas = sorted(c for c in chamadas if c not in conhecidas and c not in com_ponto and c not in dir(__builtins__))
globais = {'confirm','prompt','fetch','setTimeout','clearTimeout','parseInt','parseFloat','encodeURIComponent','alert','String','Number','Boolean','Date','Set','Array','Error','Option','Promise','Math','JSON','Object','Blob','FileReader','Date'}
print([s for s in suspeitas if s not in globais] or 'nenhuma')

titulo('Scripts, service worker e versão')
carregados = re.findall(r'<script src="((?:js)/[^"]+)"', html)
em_disco = ['js/' + os.path.basename(f) for f in files]
print('scripts do index.html sem arquivo:', [c for c in carregados if not os.path.exists(c)] or 'nenhum')
print('arquivos js fora do index.html:', [f for f in em_disco if f not in carregados] or 'nenhum')
sw = open('sw.js', encoding='utf-8').read()
cache = re.findall(r"'\./([^']+)'", sw)
print('arquivos do SW inexistentes:', [c for c in cache if c and not os.path.exists(c)] or 'nenhum')
print('arquivos do app fora do SW:', [f for f in carregados + ['css/estilos.css'] if f not in cache] or 'nenhum')
v = re.search(r"APP_VERSION='v([\d.]+)'", allj).group(1)
cv = re.search(r"planner-escolar-v([\d.]+)", sw).group(1)
print('versão no JS:', v, '| cache do SW:', cv, '| OK' if v == cv else '| DIVERGENTE'); problemas += (v != cv)
print('\nRESULTADO:', 'tudo certo' if not problemas else f'{problemas} problema(s) para revisar')
sys.exit(1 if problemas else 0)
