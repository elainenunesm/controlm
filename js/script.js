// ============================================================
// Control-M Flow — script.js
// ============================================================
'use strict';

// ── DB de jobs (vazio – populado via importação) ──────────
var DB = {};

var currentJob = null;
var cy = null;

// ── Estado do fluxo TXT importado ─────────────────────────
var _fluxoData           = null;  // { groupName: { jobs:{}, edges:[] } }
var _fluxoSelectedGroups = [];   // grupos visíveis
var _fluxoShowPlan       = true; // mostrar nós PLAN/GERADOR
var _planCollapsed       = {};   // { planId: bool }
var _fluxoViewMode       = 'graph'; // 'graph' | 'list'

// ── Tipo -> classe visual ──────────────────────────────────
var TIPO_CLASS = { job: 'job', arquivo: 'fileout', transmissao: 'ftp' };
function tipoClasse(nome) {
  var d = DB[nome];
  if (!d) return 'program';
  return TIPO_CLASS[d.tipo] || 'program';
}

// ── Ícones por tipo ────────────────────────────────────────
var ND_ICONS = { job: '💼', filein: '📄', fileout: '🗄', ftp: '🌐', step: '⚙', program: '💻', program2: '📦' };

// ============================================================
// CYTOSCAPE
// ============================================================
function buildCytoElements(nome) {
  var d = DB[nome];
  if (!d) return [];
  var nodes = [], edges = [];

  function addNode(id, label, tipo, sub) {
    nodes.push({ data: { id: id, label: label, tipo: tipo, sub: sub || '' } });
  }
  function addEdge(src, tgt, dashed) {
    edges.push({ data: { source: src, target: tgt, dashed: !!dashed } });
  }

  addNode(nome, nome, tipoClasse(nome), d.tipo);

  if (d.executadoPor && d.executadoPor !== '-') {
    addNode(d.executadoPor, d.executadoPor, 'job', 'executa');
    addEdge(d.executadoPor, nome);
  }
  if (d.stepExec && d.stepExec !== '-') {
    var stepId = 'STEP_' + nome;
    addNode(stepId, d.stepExec, 'step', 'step');
    addEdge(d.executadoPor || nome, stepId);
    addEdge(stepId, nome);
  }
  if (d.leArquivo && d.leArquivo !== '-') {
    addNode(d.leArquivo, d.leArquivo, 'filein', 'le arquivo');
    addEdge(d.leArquivo, nome);
  }
  if (d.geraArquivo && d.geraArquivo !== '-') {
    addNode(d.geraArquivo, d.geraArquivo, 'fileout', 'gera arquivo');
    addEdge(nome, d.geraArquivo);
  }
  if (d.proxPrograna && d.proxPrograna !== '-') {
    addNode(d.proxPrograna, d.proxPrograna, 'program2', 'proximo');
    addEdge(d.geraArquivo || nome, d.proxPrograna);
  }
  if (d.transmissao && d.transmissao !== '-') {
    addNode(d.transmissao, d.transmissao, 'ftp', 'transmissao');
    addEdge(d.proxPrograna || nome, d.transmissao, true);
  }

  return nodes.concat(edges);
}

var CY_COLORS = {
  program : { bg: '#28c76f', border: '#1da05a' },
  job     : { bg: '#3a6fc8', border: '#2d59a8' },
  filein  : { bg: '#e8a020', border: '#c88010' },
  fileout : { bg: '#9b59b6', border: '#7d3c9b' },
  program2: { bg: '#7f8c8d', border: '#5d6d7e' },
  ftp     : { bg: '#2980b9', border: '#e84c20' },
  step    : { bg: '#5dade2', border: '#3498db' }
};

function renderCytoscape(nome) {
  var container = document.getElementById('cy');
  if (!container) return;
  if (cy) { cy.destroy(); cy = null; }

  var elements = buildCytoElements(nome);

  cy = cytoscape({
    container: container,
    elements : elements,
    style: [
      {
        selector: 'node',
        style: {
          'shape'           : 'round-rectangle',
          'label'           : 'data(label)',
          'text-valign'     : 'center',
          'text-halign'     : 'center',
          'color'           : '#fff',
          'font-size'       : '11px',
          'font-weight'     : '700',
          'font-family'     : 'Segoe UI, Arial, sans-serif',
          'background-color': function(ele) { return (CY_COLORS[ele.data('tipo')] || CY_COLORS.program).bg; },
          'border-color'    : function(ele) { return (CY_COLORS[ele.data('tipo')] || CY_COLORS.program).border; },
          'border-width'    : function(ele) { return ele.data('tipo') === 'ftp' ? 2 : 1; },
          'width'           : 'label',
          'height'          : 36,
          'padding'         : '10px',
          'text-wrap'       : 'wrap',
          'text-max-width'  : '130px'
        }
      },
      {
        selector: 'edge',
        style: {
          'width'              : 2,
          'line-color'         : '#aab',
          'target-arrow-color' : '#aab',
          'target-arrow-shape' : 'triangle',
          'curve-style'        : 'bezier',
          'line-style'         : function(ele) { return ele.data('dashed') ? 'dashed' : 'solid'; }
        }
      },
      {
        selector: 'node:selected',
        style: { 'border-width': 3, 'border-color': '#fff' }
      }
    ],
    layout: {
      name   : 'dagre',
      rankDir : 'TB',
      nodeSep : 40,
      rankSep : 50,
      padding : 24
    },
    minZoom: 0.3,
    maxZoom: 3,
    wheelSensitivity: 0.3
  });

  cy.on('tap', 'node', function(evt) { abrirModal(evt.target.data('label')); });
  cy.on('mouseover', 'node', function(evt) { evt.target.style('opacity', 0.85); });
  cy.on('mouseout',  'node', function(evt) { evt.target.style('opacity', 1); });
}

// ============================================================
// TABS
// ============================================================
function mostrarTab(nome, el) {
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  var panel = document.getElementById('panel-' + nome);
  if (panel) panel.classList.add('active');
  if (el) el.classList.add('active');

  if (nome === 'fluxo') {
    setTimeout(function() {
      if (!cy) {
        if (_fluxoData && _fluxoSelectedGroups.length) renderFluxoFromParsed();
        else renderCytoscape(currentJob);
      } else {
        cy.resize();
        cy.fit(undefined, 30);
      }
    }, 60);
  }
}

// ============================================================
// PESQUISA
// ============================================================
function pesquisar() {
  var val = document.getElementById('searchInput').value.trim().toUpperCase();
  var chaves = Object.keys(DB);
  var match = chaves.find(function(k) { return k.toUpperCase() === val; })
           || chaves.find(function(k) { return k.toUpperCase().indexOf(val) >= 0; });
  if (match) {
    currentJob = match;
    renderTudo(match);
    document.querySelectorAll('.job-item').forEach(function(li) {
      li.classList.remove('active');
      if (li.textContent.trim() === match) li.classList.add('active');
    });
    mostrarTab('investigacao', document.querySelectorAll('.tab')[0]);
  } else {
    toast('Nenhum resultado para: ' + val, 3000);
  }
}

function limpar() {
  document.getElementById('searchInput').value = '';
  if (_fluxoData) fluxoLimpar();
}

function selecionarJob(nome, el) {
  document.querySelectorAll('.job-item').forEach(function(li) { li.classList.remove('active'); });
  el.classList.add('active');
  document.getElementById('searchInput').value = nome;
  currentJob = nome;
  renderTudo(nome);
  mostrarTab('investigacao', document.querySelectorAll('.tab')[0]);
}

// ============================================================
// RENDER TUDO
// ============================================================
function renderTudo(nome) {
  ['tagInvestigacao','tagFluxo','tagImpacto'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.textContent = nome;
  });
  renderInvestigacao(nome);
  renderImpacto(nome);
  // Reinicia grafo apenas se não tiver TXT importado
  if (!_fluxoData && cy) { cy.destroy(); cy = null; }
}

// ============================================================
// NÓS DOM (Investigação e Impacto)
// ============================================================
function criarNd(label, tipo, sublabel, badge, onClick) {
  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;display:inline-flex;';
  var nd = document.createElement('div');
  nd.className = 'nd nd-' + tipo;
  if (badge) {
    var bdg = document.createElement('div');
    bdg.className = 'nd-badge';
    bdg.textContent = '!';
    nd.appendChild(bdg);
  }
  if (ND_ICONS[tipo]) {
    var icon = document.createElement('div');
    icon.className = 'nd-icon';
    icon.textContent = ND_ICONS[tipo];
    nd.appendChild(icon);
  }
  var txt = document.createElement('div');
  txt.textContent = label;
  nd.appendChild(txt);
  if (sublabel) {
    var sub = document.createElement('div');
    sub.className = 'nd-sub';
    sub.textContent = sublabel;
    nd.appendChild(sub);
  }
  if (onClick) nd.addEventListener('click', onClick);
  wrap.appendChild(nd);
  return wrap;
}

function arrDOM(tipo) {
  var d = document.createElement('div');
  d.className = tipo === 'down' ? 'arr-down' : (tipo === 'dashed' ? 'arr-dashed' : 'arr-right');
  return d;
}

// ============================================================
// RENDER INVESTIGAÇÃO
// ============================================================
function renderInvestigacao(nome) {
  var d = DB[nome];
  var c = document.getElementById('cardInvestigacao');
  if (!c) return;
  c.innerHTML = '';
  if (!d) {
    c.innerHTML = '<div style="color:#aaa;font-style:italic;padding:24px;text-align:center;">Pesquise um job ou importe um fluxo TXT.</div>';
    return;
  }

  var tree = document.createElement('div');
  tree.className = 'inv-tree';
  tree.appendChild(criarNd(nome, tipoClasse(nome), d.tipo, false, function() { abrirModal(nome); }));
  tree.appendChild(arrDOM('down'));

  var children = document.createElement('div');
  children.className = 'inv-children';

  var filhos = [
    { campo: d.executadoPor, rotulo: 'Executado por:', classe: 'job' },
    { campo: d.leArquivo,    rotulo: 'Le Arquivo:',    classe: 'filein' },
    { campo: d.geraArquivo,  rotulo: 'Gera Arquivo:',  classe: 'fileout' }
  ];
  filhos.forEach(function(f) {
    if (!f.campo || f.campo === '-') return;
    var col = document.createElement('div');
    col.className = 'inv-col';
    var lbl = document.createElement('div');
    lbl.className = 'inv-col-label';
    lbl.textContent = f.rotulo;
    col.appendChild(lbl);
    var campoNome = f.campo;
    col.appendChild(criarNd(campoNome, f.classe, '', false, function() { abrirModal(campoNome); }));
    children.appendChild(col);
  });

  tree.appendChild(children);
  c.appendChild(tree);
}

// ============================================================
// RENDER IMPACTO
// ============================================================
function renderImpacto(nome) {
  var d = DB[nome];
  var c = document.getElementById('cardImpacto');
  if (!c) return;
  c.innerHTML = '';
  if (!d) {
    c.innerHTML = '<div style="color:#aaa;font-style:italic;padding:24px;text-align:center;">Pesquise um job ou importe um fluxo TXT.</div>';
    return;
  }

  var titulo = document.createElement('div');
  titulo.style.cssText = 'font-size:14px;font-weight:700;margin-bottom:6px;color:#1a2a4a;';
  titulo.textContent = 'Analise de Impacto: ' + nome;
  var sub = document.createElement('div');
  sub.style.cssText = 'font-size:12px;color:#888;margin-bottom:14px;';
  sub.innerHTML = 'Impacto de <strong>' + nome + '</strong> e tudo que depende dele.';
  c.appendChild(titulo);
  c.appendChild(sub);

  var row = document.createElement('div');
  row.className = 'flow-row';
  row.style.gap = '4px';

  function ap(el) { row.appendChild(el); }

  if (d.executadoPor && d.executadoPor !== '-') {
    var ep = d.executadoPor;
    ap(criarNd(ep, 'job', '', false, function() { abrirModal(ep); }));
    ap(arrDOM('right'));
  }
  if (d.leArquivo && d.leArquivo !== '-') {
    var la = d.leArquivo;
    ap(criarNd(la, 'filein', '', false, function() { abrirModal(la); }));
    ap(arrDOM('right'));
  }
  ap(criarNd(nome, tipoClasse(nome), '', false, function() { abrirModal(nome); }));
  if (d.geraArquivo && d.geraArquivo !== '-') {
    var ga = d.geraArquivo;
    ap(arrDOM('right'));
    ap(criarNd(ga, 'fileout', '', false, function() { abrirModal(ga); }));
  }
  if (d.proxPrograna && d.proxPrograna !== '-') {
    var pp = d.proxPrograna;
    ap(arrDOM('right'));
    ap(criarNd(pp, 'program2', '', false, function() { abrirModal(pp); }));
  }
  if (d.transmissao && d.transmissao !== '-') {
    var tr = d.transmissao;
    ap(arrDOM('dashed'));
    ap(criarNd(tr, 'ftp', '', true, function() { abrirModal(tr); }));
  }
  c.appendChild(row);

  var leg = document.createElement('div');
  leg.className = 'impact-legend';
  leg.innerHTML = [
    '<span class="legend-dot" style="background:#28c76f"></span> Programas Impactados',
    '<span class="legend-dot" style="background:#e8a020"></span> Arquivos Dependentes',
    '<span class="legend-dot" style="background:#3a6fc8"></span> Transmissoes Afetadas'
  ].map(function(s) { return '<span style="display:flex;align-items:center;gap:5px;">' + s + '</span>'; }).join('');
  c.appendChild(leg);

  var btnBar = document.createElement('div');
  btnBar.style.cssText = 'display:flex;justify-content:flex-end;margin-top:14px;';
  var expBtn = document.createElement('button');
  expBtn.className = 'btn btn-primary';
  expBtn.innerHTML = '&#8681; Exportar CSV';
  expBtn.onclick = exportar;
  btnBar.appendChild(expBtn);
  c.appendChild(btnBar);
}

// ============================================================
// ZOOM Cytoscape
// ============================================================
function cyZoom(factor) {
  if (cy) cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width()/2, y: cy.height()/2 } });
}
function cyFit() { if (cy) cy.fit(undefined, 30); }

// ============================================================
// EXPORTAR CSV
// ============================================================
function exportar() {
  var d = DB[currentJob];
  if (!d) return;
  var linhas = [
    ['Campo','Valor'],
    ['Programa/Job', currentJob],
    ['Tipo', d.tipo],
    ['Descricao', d.descricao],
    ['Executado Por', d.executadoPor],
    ['Step', d.stepExec],
    ['Le Arquivo', d.leArquivo],
    ['Gera Arquivo', d.geraArquivo],
    ['Proximo Programa', d.proxPrograna],
    ['Transmissao', d.transmissao],
    ['Status', d.status],
    ['Ambiente', d.ambiente]
  ];
  var csv = linhas.map(function(r) {
    return r.map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'analise_' + currentJob + '.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('CSV exportado!');
}

// ============================================================
// MODAL
// ============================================================
function abrirModal(nome) {
  var d = DB[nome] || { tipo: '-', descricao: nome };
  document.getElementById('modalTitle').textContent = 'Detalhes: ' + nome;
  var campos = [
    ['Tipo', d.tipo], ['Descricao', d.descricao], ['Executado Por', d.executadoPor],
    ['Step', d.stepExec], ['Le Arquivo', d.leArquivo], ['Gera Arquivo', d.geraArquivo],
    ['Proximo', d.proxPrograna], ['Transmissao', d.transmissao],
    ['Status', d.status], ['Ambiente', d.ambiente]
  ];
  document.getElementById('modalTable').innerHTML = campos.map(function(r) {
    return '<tr><td>' + r[0] + '</td><td>' + (r[1] || '-') + '</td></tr>';
  }).join('');
  document.getElementById('modalOverlay').classList.add('open');
}
function fecharModal(e) {
  if (e.target === document.getElementById('modalOverlay'))
    document.getElementById('modalOverlay').classList.remove('open');
}
function fecharModalBtn() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// ============================================================
// TOAST
// ============================================================
function toast(msg, dur) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.classList.remove('show'); }, dur || 2500);
}

// ============================================================
// CALENDÁRIO CONTROL-M
// ============================================================
var _calData = null;
var _calSelectedJob = null;
var _calSelectedMonth = null;

var MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function calImportar() {
  document.getElementById('calFileInput').click();
}

function calOnFile(evt) {
  var file = evt.target.files && evt.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var src = e.target.result;
    var badChars = (src.match(/\ufffd/g) || []).length;
    if (badChars > src.length * 0.05) {
      var r2 = new FileReader();
      r2.onload = function(e2) { _calParse(e2.target.result, file.name); };
      r2.readAsText(file, 'windows-1252');
    } else {
      _calParse(src, file.name);
    }
  };
  reader.readAsText(file, 'UTF-8');
  evt.target.value = '';
}

// ── Parser Control-M ──────────────────────────────────────
// Formato:
//   JOBS PLANNED FOR 01 2026
//   TH FR SA SU MO TU WE
//   01 02 03 ... 31
//   JOBNAME    *   * * * * *     * * ...
function _calParse(src, filename) {
  var lines = src.split(/\r?\n/);
  var result = { year: null, jobs: {} };
  var currentMonth = null;
  var dayLine = null;

  for (var i = 0; i < lines.length; i++) {
    var raw  = lines[i];
    var line = raw.trim();

    // Cabecalho do mes
    var mHead = line.match(/JOBS\s+PLANNED\s+FOR\s+(\d{1,2}|\w+)\s+(\d{4})/i);
    if (mHead) {
      var mRaw = mHead[1].toUpperCase();
      var yr   = parseInt(mHead[2], 10);
      if (!result.year) result.year = yr;
      if (/^\d+$/.test(mRaw)) {
        currentMonth = parseInt(mRaw, 10);
      } else {
        var mNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC',
                      'JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
        var idx = mNames.indexOf(mRaw.slice(0,3));
        currentMonth = idx >= 0 ? (idx % 12) + 1 : null;
      }
      dayLine = null;
      continue;
    }

    if (currentMonth === null) continue;

    // Linha de numeros de dia: "01 02 03 04 ..."
    if (!dayLine && /^\d{1,2}(\s+\d{1,2})+/.test(line)) {
      dayLine = [];
      var dRx = /(\d{1,2})/g;
      var dm;
      while ((dm = dRx.exec(raw)) !== null) {
        dayLine.push({ day: parseInt(dm[1], 10), col: dm.index });
      }
      continue;
    }

    if (!dayLine) continue;

    // Ignora linha de dias da semana
    if (/^(SU|MO|TU|WE|TH|FR|SA)(\s+(SU|MO|TU|WE|TH|FR|SA))+/.test(line)) continue;
    if (!line || line[0] === '-' || line[0] === '=') continue;

    // Linha de job: nome + marcadores
    var jobMatch = raw.match(/^([A-Za-z0-9_.$@#-]{2,30})/);
    if (!jobMatch) continue;
    var jobName = jobMatch[1].toUpperCase();

    var diasExec = [];
    for (var di = 0; di < dayLine.length; di++) {
      var col = dayLine[di].col;
      var ch  = raw.length > col ? raw[col] : ' ';
      diasExec.push(ch === '*');
    }

    if (!result.jobs[jobName]) result.jobs[jobName] = {};
    var mKey = 'M' + (currentMonth < 10 ? '0' : '') + currentMonth;
    if (result.jobs[jobName][mKey]) {
      for (var oi = 0; oi < diasExec.length; oi++) {
        result.jobs[jobName][mKey][oi] = result.jobs[jobName][mKey][oi] || diasExec[oi];
      }
    } else {
      result.jobs[jobName][mKey] = diasExec;
    }
  }

  if (!result.year || Object.keys(result.jobs).length === 0) {
    toast('Arquivo nao reconhecido como calendario Control-M.', 4000);
    return;
  }

  _calData = result;
  _calSelectedJob = null;

  var lbl = document.getElementById('calFileLabel');
  if (lbl) lbl.textContent = filename + ' — ' + Object.keys(result.jobs).length + ' jobs / ano ' + result.year;

  _calSyncJobsToSidebar();
  renderCalendario();
  toast('Calendario importado: ' + Object.keys(result.jobs).length + ' job(s).');
  mostrarTab('calendario', document.querySelectorAll('.tab')[3]);
}

function _calSyncJobsToSidebar() {
  if (!_calData) return;
  var list = document.getElementById('job-list');
  var existentes = {};
  list.querySelectorAll('.job-item').forEach(function(li) {
    existentes[li.textContent.trim()] = true;
  });
  Object.keys(_calData.jobs).forEach(function(jn) {
    if (existentes[jn]) return;
    if (!DB[jn]) {
      DB[jn] = {
        tipo: 'job', descricao: 'Job importado do calendario Control-M',
        executadoPor: '-', stepExec: '-', leArquivo: '-', geraArquivo: '-',
        proxPrograna: '-', transmissao: '-', status: 'IMPORTADO', ambiente: 'PRODUCAO'
      };
    }
    var li = document.createElement('li');
    li.className = 'job-item';
    li.onclick = (function(nome) { return function() { selecionarJob(nome, this); }; })(jn);
    var dot = document.createElement('span');
    dot.className = 'job-dot dot-blue';
    li.appendChild(dot);
    li.appendChild(document.createTextNode(' ' + jn));
    list.appendChild(li);
  });
}

// ── Render calendário ──────────────────────────────────────
function renderCalendario() {
  var c = document.getElementById('cal-content');
  if (!c) return;
  if (!_calData) {
    c.innerHTML = '<div class="cal-empty"><div class="cal-empty-icon">📅</div><div>Importe um arquivo de calendario Control-M (.txt)</div></div>';
    return;
  }
  var mode = document.getElementById('calViewSelect') ? document.getElementById('calViewSelect').value : 'heatmap';
  if      (mode === 'heatmap') renderCalHeatmap(c);
  else if (mode === 'table')   renderCalTable(c);
  else                         renderCalDetail(c);
}

function calMudarVisu() { renderCalendario(); }

// ── Heatmap ────────────────────────────────────────────────
function renderCalHeatmap(container) {
  container.innerHTML = '';
  var jobs   = Object.keys(_calData.jobs);
  var selJob = _calSelectedJob || jobs[0];

  // Picker de job
  var pickerDiv = document.createElement('div');
  pickerDiv.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;';
  var pLabel = document.createElement('label');
  pLabel.style.cssText = 'font-size:12px;font-weight:700;color:#555;';
  pLabel.textContent = 'Job:';
  var pSel = document.createElement('select');
  pSel.style.cssText = 'padding:5px 10px;border:1.5px solid #c5cfe0;border-radius:6px;font-size:12px;';
  jobs.forEach(function(j) {
    var opt = document.createElement('option');
    opt.value = j; opt.textContent = j;
    if (j === selJob) opt.selected = true;
    pSel.appendChild(opt);
  });
  pSel.onchange = function() { _calSelectedJob = this.value; renderCalendario(); };
  pickerDiv.appendChild(pLabel);
  pickerDiv.appendChild(pSel);

  // Estatisticas
  var stats    = _calJobStats(selJob);
  var statsDiv = document.createElement('div');
  statsDiv.className = 'cal-job-summary';
  [
    { val: stats.totalExec,   lbl: 'Execucoes' },
    { val: stats.diasUteis,   lbl: 'Dias Uteis' },
    { val: stats.fds,         lbl: 'Fins de Semana' },
    { val: stats.mesesAtivos, lbl: 'Meses Ativos' }
  ].forEach(function(s) {
    var card = document.createElement('div');
    card.className = 'cal-stat';
    card.innerHTML = '<div class="val">' + s.val + '</div><div class="lbl">' + s.lbl + '</div>';
    statsDiv.appendChild(card);
  });

  var padrao  = _calDetectarPadrao(selJob);
  var pBadge  = document.createElement('div');
  pBadge.style.cssText = 'margin-bottom:12px;display:flex;align-items:center;gap:8px;font-size:13px;';
  pBadge.innerHTML = 'Padrao detectado: <span class="cal-pattern-badge" style="background:' + padrao.color + '">' + padrao.label + '</span>';

  // Grade anual
  var grid = document.createElement('div');
  grid.className = 'cal-year-grid';
  var yr = _calData.year;

  for (var m = 1; m <= 12; m++) {
    var mKey      = 'M' + (m < 10 ? '0' : '') + m;
    var diasM     = (_calData.jobs[selJob] && _calData.jobs[selJob][mKey]) || [];
    var daysInM   = new Date(yr, m, 0).getDate();
    var firstDow  = new Date(yr, m - 1, 1).getDay();

    var card = document.createElement('div');
    card.className = 'cal-month-card';

    var hdr = document.createElement('div');
    hdr.className = 'cal-month-header';
    hdr.textContent = MESES_PT[m-1] + ' ' + yr;
    card.appendChild(hdr);

    var dGrid = document.createElement('div');
    dGrid.className = 'cal-month-days';

    // Cabecalhos dias semana
    ['D','S','T','Q','Q','S','S'].forEach(function(ch) {
      var hd = document.createElement('div');
      hd.className = 'cal-day-hdr';
      hd.textContent = ch;
      dGrid.appendChild(hd);
    });
    // Celulas vazias iniciais
    for (var em = 0; em < firstDow; em++) {
      var empty = document.createElement('div');
      empty.className = 'cal-day empty';
      dGrid.appendChild(empty);
    }
    for (var dd = 1; dd <= daysInM; dd++) {
      var dow     = (firstDow + dd - 1) % 7;
      var isWE    = dow === 0 || dow === 6;
      var executa = diasM.length >= dd ? diasM[dd-1] : false;

      var cell = document.createElement('div');
      cell.className = 'cal-day' + (executa ? ' run' : ' norun') + (isWE ? ' weekend' : '');
      cell.title = dd + '/' + (m < 10 ? '0' : '') + m + '/' + yr + (executa ? ' — EXECUTA' : ' — nao executa');
      cell.textContent = dd;
      (function(dayNum, jobN, mes, runs) {
        cell.onclick = function() {
          toast(jobN + ' — ' + dayNum + '/' + (mes < 10 ? '0' : '') + mes + ': ' + (runs ? 'EXECUTA' : 'Nao executa'));
        };
      })(dd, selJob, m, executa);

      dGrid.appendChild(cell);
    }
    card.appendChild(dGrid);
    grid.appendChild(card);
  }

  container.appendChild(pickerDiv);
  container.appendChild(statsDiv);
  container.appendChild(pBadge);
  container.appendChild(grid);
}

// ── Tabela mensal ──────────────────────────────────────────
function renderCalTable(container) {
  container.innerHTML = '';
  var jobs = Object.keys(_calData.jobs);
  var yr   = _calData.year;

  var pickerDiv = document.createElement('div');
  pickerDiv.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;';
  var pLabel = document.createElement('label');
  pLabel.style.cssText = 'font-size:12px;font-weight:700;color:#555;';
  pLabel.textContent = 'Mes:';
  var pSel = document.createElement('select');
  pSel.style.cssText = 'padding:5px 10px;border:1.5px solid #c5cfe0;border-radius:6px;font-size:12px;';
  for (var mi = 1; mi <= 12; mi++) {
    var opt = document.createElement('option');
    opt.value = mi;
    opt.textContent = MESES_PT[mi-1] + ' ' + yr;
    if (mi === (_calSelectedMonth || 1)) opt.selected = true;
    pSel.appendChild(opt);
  }
  pSel.onchange = function() { _calSelectedMonth = parseInt(this.value, 10); renderCalendario(); };
  pickerDiv.appendChild(pLabel);
  pickerDiv.appendChild(pSel);
  container.appendChild(pickerDiv);

  var selM    = _calSelectedMonth || 1;
  var daysInM = new Date(yr, selM, 0).getDate();
  var mKey    = 'M' + (selM < 10 ? '0' : '') + selM;

  var wrap  = document.createElement('div');
  wrap.className = 'cal-table-wrap';
  var table = document.createElement('table');
  table.className = 'cal-table';

  var thead = document.createElement('thead');
  var hr    = document.createElement('tr');
  var th0   = document.createElement('th');
  th0.className = 'job-col'; th0.textContent = 'Job';
  hr.appendChild(th0);
  for (var dd2 = 1; dd2 <= daysInM; dd2++) {
    var th = document.createElement('th');
    th.textContent = dd2;
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);

  var tbody = document.createElement('tbody');
  jobs.forEach(function(jn) {
    var dias = (_calData.jobs[jn][mKey]) || [];
    var tr   = document.createElement('tr');
    var td0  = document.createElement('td');
    td0.className = 'job-name'; td0.textContent = jn; td0.title = jn;
    tr.appendChild(td0);
    for (var d3 = 1; d3 <= daysInM; d3++) {
      var td   = document.createElement('td');
      var exec = dias[d3-1];
      td.innerHTML = exec
        ? '<span class="run-cell" title="' + jn + ' executa ' + d3 + '/' + (selM<10?'0':'') + selM + '"></span>'
        : '<span class="norun-cell"></span>';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  container.appendChild(wrap);
}

// ── Detalhe por job ────────────────────────────────────────
function renderCalDetail(container) {
  container.innerHTML = '';
  var jobs = Object.keys(_calData.jobs);
  var selJ = _calSelectedJob || jobs[0];

  var pDiv = document.createElement('div');
  pDiv.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;';
  var pL = document.createElement('label');
  pL.style.cssText = 'font-size:12px;font-weight:700;color:#555;';
  pL.textContent = 'Job:';
  var pS = document.createElement('select');
  pS.style.cssText = 'padding:5px 10px;border:1.5px solid #c5cfe0;border-radius:6px;font-size:12px;';
  jobs.forEach(function(j) {
    var opt = document.createElement('option');
    opt.value = j; opt.textContent = j;
    if (j === selJ) opt.selected = true;
    pS.appendChild(opt);
  });
  pS.onchange = function() { _calSelectedJob = this.value; renderCalendario(); };
  pDiv.appendChild(pL);
  pDiv.appendChild(pS);
  container.appendChild(pDiv);

  var stats  = _calJobStats(selJ);
  var padrao = _calDetectarPadrao(selJ);

  var statDiv = document.createElement('div');
  statDiv.className = 'cal-job-summary';
  [
    { val: stats.totalExec,   lbl: 'Total Execucoes' },
    { val: stats.diasUteis,   lbl: 'Dias Uteis' },
    { val: stats.fds,         lbl: 'Fins de Semana' },
    { val: stats.mesesAtivos, lbl: 'Meses Ativos' },
    { val: stats.excecoes,    lbl: 'Possiveis Excecoes' }
  ].forEach(function(s) {
    var c2 = document.createElement('div');
    c2.className = 'cal-stat';
    c2.innerHTML = '<div class="val">' + s.val + '</div><div class="lbl">' + s.lbl + '</div>';
    statDiv.appendChild(c2);
  });
  container.appendChild(statDiv);

  var pRow = document.createElement('div');
  pRow.style.cssText = 'margin:10px 0 14px;display:flex;align-items:center;gap:8px;font-size:13px;';
  pRow.innerHTML = 'Padrao: <span class="cal-pattern-badge" style="background:' + padrao.color + '">' + padrao.label + '</span> &nbsp;&mdash;&nbsp; ' + padrao.desc;
  container.appendChild(pRow);

  var tWrap = document.createElement('div');
  tWrap.className = 'cal-table-wrap';
  var tbl   = document.createElement('table');
  tbl.className = 'cal-table';
  var thead2 = document.createElement('thead');
  var hr2    = document.createElement('tr');
  ['Mes','Execucoes','Dias Uteis c/ *','FDS c/ *','Excecoes'].forEach(function(h) {
    var th2 = document.createElement('th');
    th2.textContent = h;
    hr2.appendChild(th2);
  });
  thead2.appendChild(hr2);
  tbl.appendChild(thead2);

  var tbody2 = document.createElement('tbody');
  var yr2    = _calData.year;
  for (var m3 = 1; m3 <= 12; m3++) {
    var mKey2  = 'M' + (m3 < 10 ? '0' : '') + m3;
    var dias3  = (_calData.jobs[selJ] && _calData.jobs[selJ][mKey2]) || [];
    if (!dias3.length) continue;
    var dInM2    = new Date(yr2, m3, 0).getDate();
    var fDow2    = new Date(yr2, m3-1, 1).getDay();
    var exec3=0, util3=0, fds3=0, exc3=0;
    for (var di3 = 0; di3 < dias3.length && di3 < dInM2; di3++) {
      var dow3  = (fDow2 + di3) % 7;
      var isWe3 = dow3 === 0 || dow3 === 6;
      if (dias3[di3]) {
        exec3++;
        if (isWe3) fds3++; else util3++;
      } else {
        if (!isWe3) exc3++;
      }
    }
    var tr2 = document.createElement('tr');
    [MESES_PT[m3-1]+' '+yr2, exec3, util3, fds3, exc3].forEach(function(v, vi) {
      var td2 = document.createElement('td');
      if (vi === 0) td2.className = 'job-name';
      td2.textContent = v;
      if (vi === 4 && v > 0) td2.style.cssText = 'color:#e84c20;font-weight:700;';
      tr2.appendChild(td2);
    });
    tbody2.appendChild(tr2);
  }
  tbl.appendChild(tbody2);
  tWrap.appendChild(tbl);
  container.appendChild(tWrap);
}

// ── Estatisticas de um job ─────────────────────────────────
function _calJobStats(jobName) {
  var jd = _calData.jobs[jobName] || {};
  var yr = _calData.year;
  var totalExec=0, diasUteis=0, fds=0, mesesAtivos=0, excecoes=0;
  for (var m = 1; m <= 12; m++) {
    var mKey = 'M' + (m < 10 ? '0' : '') + m;
    var dias = jd[mKey];
    if (!dias || !dias.length) continue;
    var dInM     = new Date(yr, m, 0).getDate();
    var firstDow = new Date(yr, m-1, 1).getDay();
    var mesExec  = 0;
    for (var d = 0; d < dias.length && d < dInM; d++) {
      var dow  = (firstDow + d) % 7;
      var isWE = dow === 0 || dow === 6;
      if (dias[d]) {
        totalExec++; mesExec++;
        if (isWE) fds++; else diasUteis++;
      } else {
        if (!isWE) excecoes++;
      }
    }
    if (mesExec > 0) mesesAtivos++;
  }
  return { totalExec: totalExec, diasUteis: diasUteis, fds: fds, mesesAtivos: mesesAtivos, excecoes: excecoes };
}

// ── Deteccao de padrao ─────────────────────────────────────
function _calDetectarPadrao(jobName) {
  var stats = _calJobStats(jobName);
  var yr    = _calData.year;
  var diasUteisAno=0, fdsAno=0;
  for (var m = 1; m <= 12; m++) {
    var dInM  = new Date(yr, m, 0).getDate();
    var fDow  = new Date(yr, m-1, 1).getDay();
    for (var d = 0; d < dInM; d++) {
      var dow = (fDow + d) % 7;
      if (dow === 0 || dow === 6) fdsAno++; else diasUteisAno++;
    }
  }
  var t = stats.totalExec, u = stats.diasUteis, f = stats.fds;
  if (t === 0)                                    return { label: 'Sem execucoes', color: '#999', desc: 'Nenhuma execucao.' };
  if (t >= 360)                                   return { label: 'Diario',        color: '#0d9e5c', desc: 'Todos os dias, incluindo FDS.' };
  if (u >= diasUteisAno * 0.9 && f < 5)           return { label: 'Dias Uteis',   color: '#3a6fc8', desc: 'Somente dias uteis (Seg-Sex).' };
  if (f >= fdsAno * 0.8 && u < 20)               return { label: 'Final de Semana', color: '#9b59b6', desc: 'Preferencialmente fins de semana.' };
  if (t <= 24)                                    return { label: 'Mensal',        color: '#e8a020', desc: 'Dias especificos do mes (fechamento).' };
  if (t <= 70)                                    return { label: 'Semanal',       color: '#5dade2', desc: 'Aproximadamente uma vez por semana.' };
  return                                                 { label: 'Irregular',     color: '#e84c20', desc: 'Padrao irregular ou sob demanda.' };
}

// ============================================================
// FLUXO TXT — Parser + Renderer (Control-M Job Flow Report)
// ============================================================

// ── Trigger de importação ────────────────────────────────
function fluxoImportar() {
  document.getElementById('fluxoFileInput').click();
}

function fluxoOnFile(evt) {
  var file = evt.target.files && evt.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var src = e.target.result;
    var bad = (src.match(/\ufffd/g) || []).length;
    if (bad > src.length * 0.05) {
      var r2 = new FileReader();
      r2.onload = function(e2) { _fluxoParse(e2.target.result, file.name); };
      r2.readAsText(file, 'windows-1252');
    } else {
      _fluxoParse(src, file.name);
    }
  };
  reader.readAsText(file, 'UTF-8');
  evt.target.value = '';
}

// ── Parser principal ─────────────────────────────────────
// Formato esperado:
//   PRODUCED BY CONTROL-M ... BY GROUP DIARIO GROUP
//   LVL JOBNAME DESCRICAO ... M CALENDAR [DAYS] [\]
//   ORIGEM-DESTINO-STATUS  (linha de continuação)
function _fluxoParse(src, filename) {
  var lines  = src.split(/\r?\n/);
  var result = {};           // { groupName: { jobs:{}, edges:[] } }
  var curGroup    = null;
  var curJob      = null;
  var waitCont    = false;   // aguarda continuação após '\'

  for (var i = 0; i < lines.length; i++) {
    var raw  = lines[i];
    var line = raw.trim();

    // ── Início de GROUP ────────────────────────────────
    // "PRODUCED BY CONTROL-M ... BY GROUP DIARIO GROUP"
    if (line.indexOf('BY GROUP') >= 0) {
      var gm = line.match(/BY\s+GROUP\s+([A-Z0-9_-]+)\s+GROUP/i);
      if (gm) {
        curGroup = gm[1].toUpperCase();
        if (!result[curGroup]) result[curGroup] = { jobs: {}, edges: [] };
        curJob   = null;
        waitCont = false;
      }
      continue;
    }
    if (!curGroup) continue;

    // ── Linha de continuação (após '\') ───────────────
    if (waitCont) {
      _fluxoExtractDeps(raw, curJob, result[curGroup]);
      waitCont = raw.trimEnd().slice(-1) === '\\';
      continue;
    }

    // ── Linha de JOB ──────────────────────────────────
    // Formato: LVL JOBNAME DESCRICAO [M CALENDAR [DAYS]] [\]
    // Nomes: SSSS9405, PLAN0016, SESA9725, etc.
    var jobRx = /^(\d+)\s+([A-Z][A-Z0-9]{1,9})\s+(.*?)\s+M\s+([A-Z][A-Z0-9]*)/i;
    var jm    = line.match(jobRx);

    // Fallback: sem 'M CALENDAR' — pelo menos tem LVL e JOBNAME
    if (!jm) {
      var jobRx2 = /^(\d+)\s+([A-Z]{3,6}[0-9]{2,6})\s+(.*)/i;
      var jm2    = line.match(jobRx2);
      if (jm2) jm = [jm2[0], jm2[1], jm2[2], jm2[3].trim(), '-'];
    }

    if (jm) {
      var lvl      = parseInt(jm[1], 10);
      var jobname  = jm[2].toUpperCase();
      var desc     = jm[3].trim();
      var calendar = (jm[4] || '-').toUpperCase();

      // Classifica tipo
      var nodeType    = 'NORMAL';
      var generatedBy = null;
      var descUp      = desc.toUpperCase();

      if (/^PLAN\d*/i.test(jobname)) {
        nodeType = 'GERADOR';
      } else if (
        descUp.indexOf('PLAN0016') >= 0 ||
        descUp.indexOf('P/PLAN')   >= 0 ||
        descUp.indexOf('PELO PLAN') >= 0 ||
        descUp.indexOf('GERADO PELO') >= 0 ||
        descUp.indexOf('CRIADO P') >= 0 ||
        descUp.indexOf('GERADO P') >= 0
      ) {
        nodeType = 'GERADO';
        var planRx = desc.match(/PLAN(\w+)/i);
        generatedBy = planRx ? planRx[0].toUpperCase() : 'PLAN0016';
      }

      curJob = {
        id         : jobname,
        label      : desc,
        group      : curGroup,
        level      : lvl,
        calendar   : calendar,
        type       : nodeType,
        generatedBy: generatedBy
      };
      result[curGroup].jobs[jobname] = curJob;

      // Aresta de geração automática
      if (generatedBy && nodeType === 'GERADO') {
        _fluxoAddEdge(result[curGroup], generatedBy, jobname, 'gera', true, 'generation');
      }

      // Dependências na mesma linha ou aguarda continuação
      if (raw.trimEnd().slice(-1) === '\\') {
        waitCont = true;
      } else {
        _fluxoExtractDeps(raw, curJob, result[curGroup]);
      }
      continue;
    }
  }

  if (Object.keys(result).length === 0) {
    toast('Arquivo não reconhecido como Control-M Job Flow Report.', 4000);
    return;
  }

  _fluxoData           = result;
  _fluxoSelectedGroups = Object.keys(result);
  _fluxoShowPlan       = true;
  _planCollapsed       = {};

  // Atualiza UI
  _fluxoRenderGroupFilter();
  _fluxoSyncJobsToSidebar();
  _fluxoMostrarControles(true);

  var totalJobs = Object.keys(result).reduce(function(acc, g) {
    return acc + Object.keys(result[g].jobs).length;
  }, 0);
  var lbl = document.getElementById('fluxoFileLabel');
  if (lbl) lbl.textContent = filename + ' — ' + Object.keys(result).length + ' grupos / ' + totalJobs + ' jobs';

  // Vai para aba Fluxo e renderiza
  mostrarTab('fluxo', document.querySelectorAll('.tab')[1]);
  toast('Fluxo importado: ' + totalJobs + ' jobs em ' + Object.keys(result).length + ' grupo(s).', 4000);
}

// Adiciona aresta sem duplicar
function _fluxoAddEdge(groupData, from, to, status, dashed, edgeType) {
  var key = from + '->' + to;
  var dup = groupData.edges.some(function(e) { return e.from + '->' + e.to === key; });
  if (!dup) {
    groupData.edges.push({ from: from, to: to, status: status, dashed: !!dashed, edgeType: edgeType || 'dependency' });
  }
}

// Extrai dependências de uma linha: ORIGEM-DESTINO-(OK|CODES|STAT|digits)
function _fluxoExtractDeps(line, job, groupData) {
  if (!job) return;
  var depRx = /([A-Z][A-Z0-9]{2,9})-([A-Z][A-Z0-9]{2,9})-(OK|CODES|STAT|\d{2})/gi;
  var m;
  while ((m = depRx.exec(line)) !== null) {
    var from   = m[1].toUpperCase();
    var to     = m[2].toUpperCase();
    var status = m[3].toUpperCase();
    if (to !== job.id) continue;
    _fluxoAddEdge(groupData, from, to, status, false, 'dependency');
  }
}

// ── Render do filtro de grupos ───────────────────────────
// ── Sincroniza jobs importados com a sidebar ──────────────
function _fluxoSyncJobsToSidebar() {
  var list = document.getElementById('job-list');
  if (!list) return;

  // Remove itens anteriores do fluxo
  list.querySelectorAll('.fluxo-imported-item, .fluxo-sidebar-divider').forEach(function(el) { el.remove(); });

  // Controla mensagem vazia
  var emptyMsg = document.getElementById('sidebar-empty-msg');

  if (!_fluxoData) {
    if (emptyMsg) emptyMsg.style.display = '';
    return;
  }

  if (emptyMsg) emptyMsg.style.display = 'none';

  // Cabeçalho separador
  var div = document.createElement('li');
  div.className = 'fluxo-sidebar-divider';
  div.textContent = '\uD83D\uDCC2 Fluxo importado';
  list.appendChild(div);

  var addedJobs = {};
  Object.keys(_fluxoData).forEach(function(gn) {
    var gd = _fluxoData[gn];
    Object.keys(gd.jobs).sort().forEach(function(jid) {
      if (addedJobs[jid]) return;
      addedJobs[jid] = true;
      var job = gd.jobs[jid];
      var li = document.createElement('li');
      li.className = 'job-item fluxo-imported-item';
      li.title = (job.label || jid) + ' [' + gn + ']';
      li.onclick = (function(id, elem) {
        return function() { _fluxoSelecionarJobSidebar(id, elem); };
      })(jid, li);
      var dot = document.createElement('span');
      dot.className = 'job-dot ' + (job.type === 'GERADOR' ? 'dot-orange' : job.type === 'GERADO' ? 'dot-purple' : 'dot-blue');
      li.appendChild(dot);
      li.appendChild(document.createTextNode(' ' + jid));
      var grpTag = document.createElement('span');
      grpTag.className = 'fluxo-sidebar-group-tag';
      grpTag.textContent = gn;
      li.appendChild(grpTag);
      list.appendChild(li);
    });
  });
}

function _fluxoSelecionarJobSidebar(jid, el) {
  document.querySelectorAll('.job-item').forEach(function(li) { li.classList.remove('active'); });
  if (el) el.classList.add('active');

  // Garante que estamos na aba Fluxo
  mostrarTab('fluxo', document.querySelectorAll('.tab')[1]);

  // Muda para vista lista se ainda estiver no grafo
  if (_fluxoViewMode !== 'list') {
    fluxoToggleView();
  }

  // Rola até a linha do job e destaca ela
  setTimeout(function() {
    var lv = document.getElementById('fluxoListaView');
    if (!lv) return;
    var rows = lv.querySelectorAll('.fluxo-lista-row');
    for (var i = 0; i < rows.length; i++) {
      var spans = rows[i].querySelectorAll('.fljob-name span');
      // span[1] é o nome (após o seq #N)
      if (spans[1] && spans[1].textContent === jid) {
        rows[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
        rows[i].style.transition = 'box-shadow 0.2s';
        rows[i].style.boxShadow  = '0 0 0 3px #3a6fc880';
        setTimeout(function(r) { r.style.boxShadow = ''; }, 1800, rows[i]);
        break;
      }
    }
  }, 200);
}

function _fluxoRenderGroupFilter() {
  var c = document.getElementById('fluxoGroupFilter');
  if (!c || !_fluxoData) return;
  c.innerHTML = '<span style="font-size:11px;font-weight:700;color:#888;">Grupos:</span>';
  Object.keys(_fluxoData).forEach(function(gn) {
    var chip = document.createElement('label');
    chip.className = 'group-chip';
    var chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = _fluxoSelectedGroups.indexOf(gn) >= 0;
    chk.onchange = (function(grupo) {
      return function() {
        if (this.checked) {
          if (_fluxoSelectedGroups.indexOf(grupo) < 0) _fluxoSelectedGroups.push(grupo);
        } else {
          _fluxoSelectedGroups = _fluxoSelectedGroups.filter(function(x) { return x !== grupo; });
        }
        if (cy) { cy.destroy(); cy = null; }
        renderFluxoFromParsed();
      };
    })(gn);
    chip.appendChild(chk);
    chip.appendChild(document.createTextNode(' ' + gn));
    c.appendChild(chip);
  });
}

function _fluxoMostrarControles(show) {
  ['fluxoPlanBtn','fluxoListaBtn','fluxoLimparBtn'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  });
}

function fluxoTogglePlan() {
  _fluxoShowPlan = !_fluxoShowPlan;
  var btn = document.getElementById('fluxoPlanBtn');
  if (btn) btn.textContent = _fluxoShowPlan ? '⊘ Ocultar PLAN' : '⊕ Mostrar PLAN';
  if (cy) { cy.destroy(); cy = null; }
  renderFluxoFromParsed();
}

function fluxoToggleView() {
  if (!_fluxoData) return;
  _fluxoViewMode = (_fluxoViewMode === 'graph') ? 'list' : 'graph';
  var btn = document.getElementById('fluxoListaBtn');
  var cyC = document.getElementById('cy-container');
  var lv  = document.getElementById('fluxoListaView');
  if (_fluxoViewMode === 'list') {
    if (btn) btn.textContent = '\u25A6 Ver Grafo';
    if (cyC) cyC.style.display = 'none';
    if (lv)  lv.style.display  = '';
    _fluxoRenderLista();
  } else {
    if (btn) btn.textContent = '\uD83D\uDCCB Ver Lista';
    if (cyC) cyC.style.display = '';
    if (lv)  lv.style.display  = 'none';
    if (!cy) renderFluxoFromParsed();
    else     { cy.resize(); cy.fit(undefined, 30); }
  }
}

// ── Render lista de execução (ordem topológica) ─────────
function _fluxoRenderLista() {
  var lv = document.getElementById('fluxoListaView');
  if (!lv || !_fluxoData) return;
  lv.innerHTML = '';

  var grupos = _fluxoSelectedGroups;

  grupos.forEach(function(gn) {
    var gd = _fluxoData[gn];
    if (!gd) return;

    var allJobs  = Object.keys(gd.jobs);
    var edges    = gd.edges;

    // Monta maps de predecessores e sucessores para cada job
    var preds  = {};  // jobId -> [{ from, status }]
    var succs  = {};  // jobId -> [{ to, status }]
    allJobs.forEach(function(j) { preds[j] = []; succs[j] = []; });
    edges.forEach(function(e) {
      if (!preds[e.to])   preds[e.to]   = [];
      if (!succs[e.from]) succs[e.from] = [];
      preds[e.to].push({ id: e.from, status: e.status, dashed: e.dashed });
      succs[e.from].push({ id: e.to, status: e.status, dashed: e.dashed });
    });

    // Ordenação topológica (Kahn's algorithm)
    var inDeg = {};
    allJobs.forEach(function(j) { inDeg[j] = (preds[j] || []).length; });
    var queue  = allJobs.filter(function(j) { return inDeg[j] === 0; });
    var sorted = [];
    while (queue.length) {
      queue.sort();
      var cur = queue.shift();
      sorted.push(cur);
      (succs[cur] || []).forEach(function(s) {
        inDeg[s.id]--;
        if (inDeg[s.id] === 0) queue.push(s.id);
      });
    }
    // Append restantes (ciclos ou isolados)
    allJobs.forEach(function(j) {
      if (sorted.indexOf(j) < 0) sorted.push(j);
    });

    // Cabeçalho do grupo
    var hdr = document.createElement('div');
    hdr.className = 'fluxo-lista-group-header';
    hdr.textContent = '\u25B6 Grupo: ' + gn + ' (' + sorted.length + ' jobs)';
    lv.appendChild(hdr);

    var lista = document.createElement('div');
    lista.className = 'fluxo-lista';

    sorted.forEach(function(jid, idx) {
      var job  = gd.jobs[jid];
      if (!job) return;
      var type = job.type || 'NORMAL';

      var row  = document.createElement('div');
      row.className = 'fluxo-lista-row type-' + type;

      // Coluna esquerda: sequencia + nome
      var nameCol = document.createElement('div');
      nameCol.className = 'fljob-name';
      var seq = document.createElement('span');
      seq.className = 'fljob-seq';
      seq.textContent = '#' + (idx + 1);
      var jname = document.createElement('span');
      jname.textContent = jid;
      var badge = document.createElement('span');
      badge.className = 'fljob-badge badge-' + type;
      badge.textContent = type;
      nameCol.appendChild(seq);
      nameCol.appendChild(jname);
      nameCol.appendChild(badge);
      if (job.calendar && job.calendar !== '-') {
        var calSpan = document.createElement('span');
        calSpan.style.cssText = 'font-size:10px;color:#888;';
        calSpan.textContent = '\uD83D\uDCC5 ' + job.calendar;
        nameCol.appendChild(calSpan);
      }
      row.appendChild(nameCol);

      // Coluna direita
      var rightCol = document.createElement('div');

      // Descrição
      var desc = document.createElement('div');
      desc.className = 'fljob-desc';
      desc.textContent = job.label || '—';
      rightCol.appendChild(desc);

      var rel = document.createElement('div');
      rel.className = 'fljob-relations';

      // Depende de (predecessores)
      var depRow = document.createElement('div');
      depRow.className = 'fljob-dep';
      var depLbl = document.createElement('span');
      depLbl.className = 'fljob-dep-label';
      depLbl.textContent = '\u2190 Depende de:';
      depRow.appendChild(depLbl);
      var myPreds = preds[jid] || [];
      if (myPreds.length === 0) {
        var none = document.createElement('span');
        none.className = 'fljob-none';
        none.textContent = 'início do fluxo';
        depRow.appendChild(none);
      } else {
        myPreds.forEach(function(p) {
          var chip = document.createElement('span');
          chip.className = 'fljob-chip';
          chip.textContent = p.id + (p.status ? ' (' + p.status + ')' : '');
          chip.title = 'Condição: ' + (p.status || '—');
          if (p.dashed) chip.style.opacity = '0.65';
          depRow.appendChild(chip);
        });
      }
      rel.appendChild(depRow);

      // Dispara (sucessores)
      var nxtRow = document.createElement('div');
      nxtRow.className = 'fljob-next';
      var nxtLbl = document.createElement('span');
      nxtLbl.className = 'fljob-next-label';
      nxtLbl.textContent = '\u2192 Dispara:';
      nxtRow.appendChild(nxtLbl);
      var mySuccs = succs[jid] || [];
      if (mySuccs.length === 0) {
        var none2 = document.createElement('span');
        none2.className = 'fljob-none';
        none2.textContent = 'fim do fluxo';
        nxtRow.appendChild(none2);
      } else {
        mySuccs.forEach(function(s) {
          var chip = document.createElement('span');
          chip.className = 'fljob-chip';
          chip.textContent = s.id + (s.status ? ' (' + s.status + ')' : '');
          chip.title = 'Condição: ' + (s.status || '—');
          if (s.dashed) chip.style.opacity = '0.65';
          nxtRow.appendChild(chip);
        });
      }
      rel.appendChild(nxtRow);

      rightCol.appendChild(rel);
      row.appendChild(rightCol);
      lista.appendChild(row);
    });

    lv.appendChild(lista);
  });
}

function fluxoLimpar() {
  _fluxoData           = null;
  _fluxoSelectedGroups = [];
  _planCollapsed       = {};
  _fluxoViewMode       = 'graph';
  var lbl = document.getElementById('fluxoFileLabel');
  if (lbl) lbl.textContent = '';
  var gf = document.getElementById('fluxoGroupFilter');
  if (gf) gf.innerHTML = '';
  var lv = document.getElementById('fluxoListaView');
  if (lv) { lv.style.display = 'none'; lv.innerHTML = ''; }
  var cyC = document.getElementById('cy-container');
  if (cyC) cyC.style.display = '';
  var btn = document.getElementById('fluxoListaBtn');
  if (btn) btn.textContent = '\uD83D\uDCCB Ver Lista';
  _fluxoMostrarControles(false);
  // Remove jobs importados da sidebar
  _fluxoSyncJobsToSidebar();
  if (cy) { cy.destroy(); cy = null; }
  renderCytoscape(currentJob);
  toast('Fluxo TXT removido. Dados internos restaurados.');
}

// ── Renderer Cytoscape a partir do TXT ───────────────────
function renderFluxoFromParsed() {
  if (!_fluxoData) return;
  var container = document.getElementById('cy');
  if (!container) return;
  if (cy) { cy.destroy(); cy = null; }

  var elements   = [];
  var addedNodes = {};

  // Compound por grupo
  _fluxoSelectedGroups.forEach(function(gn) {
    elements.push({
      data: { id: 'GRP_' + gn, label: gn, isGroup: true },
      classes: 'grp-node'
    });
  });

  // Nós e arestas
  _fluxoSelectedGroups.forEach(function(gn) {
    var grp = _fluxoData[gn];
    if (!grp) return;

    Object.keys(grp.jobs).forEach(function(jid) {
      var job = grp.jobs[jid];
      if (!_fluxoShowPlan && job.type === 'GERADOR') return;
      if (addedNodes[jid]) return;
      addedNodes[jid] = true;

      // Tooltip via title (renderizado como label multilinha)
      var lbl = jid;

      elements.push({
        data: {
          id         : jid,
          label      : lbl,
          tipo       : job.type.toLowerCase() + '_job',
          nodeType   : job.type,
          jobLabel   : job.label,
          grp        : gn,
          level      : job.level,
          calendar   : job.calendar,
          generatedBy: job.generatedBy || '',
          parent     : 'GRP_' + gn
        },
        classes: 'job-node job-' + job.type.toLowerCase()
      });
    });

    grp.edges.forEach(function(edge) {
      if (!_fluxoShowPlan && edge.edgeType === 'generation') return;
      if (!addedNodes[edge.from] || !addedNodes[edge.to]) return;
      elements.push({
        data: { source: edge.from, target: edge.to, status: edge.status, dashed: edge.dashed, edgeType: edge.edgeType },
        classes: edge.edgeType === 'generation' ? 'gen-edge' : 'dep-edge'
      });
    });
  });

  cy = cytoscape({
    container: container,
    elements : elements,
    style: [
      // Compound group
      {
        selector: '.grp-node',
        style: {
          'label'            : 'data(label)',
          'text-valign'      : 'top',
          'text-halign'      : 'center',
          'font-size'        : '12px',
          'font-weight'      : '700',
          'color'            : '#1a2a4a',
          'background-color' : 'rgba(230,238,255,0.7)',
          'border-color'     : '#3a6fc8',
          'border-width'     : 1.5,
          'border-style'     : 'dashed',
          'padding'          : '18px',
          'shape'            : 'round-rectangle'
        }
      },
      // Nó normal
      {
        selector: '.job-normal',
        style: {
          'shape'            : 'round-rectangle',
          'background-color' : '#3a6fc8',
          'border-color'     : '#2d59a8',
          'border-width'     : 1,
          'color'            : '#fff',
          'label'            : 'data(label)',
          'font-family'      : 'Consolas, monospace',
          'font-size'        : '10px',
          'font-weight'      : '700',
          'text-valign'      : 'center',
          'text-halign'      : 'center',
          'width'            : 100,
          'height'           : 38
        }
      },
      // Nó GERADOR (PLAN*)
      {
        selector: '.job-gerador',
        style: {
          'shape'            : 'star',
          'background-color' : '#d4910a',
          'border-color'     : '#a06800',
          'border-width'     : 2,
          'color'            : '#fff',
          'label'            : 'data(label)',
          'font-family'      : 'Consolas, monospace',
          'font-size'        : '11px',
          'font-weight'      : '900',
          'text-valign'      : 'center',
          'text-halign'      : 'center',
          'width'            : 90,
          'height'           : 90
        }
      },
      // Nó GERADO (criado pelo PLAN)
      {
        selector: '.job-gerado',
        style: {
          'shape'            : 'ellipse',
          'background-color' : '#7e3fb0',
          'border-color'     : '#9b59b6',
          'border-width'     : 2,
          'border-style'     : 'dashed',
          'color'            : '#fff',
          'label'            : 'data(label)',
          'font-family'      : 'Consolas, monospace',
          'font-size'        : '10px',
          'font-weight'      : '700',
          'text-valign'      : 'center',
          'text-halign'      : 'center',
          'width'            : 110,
          'height'           : 42
        }
      },
      // Aresta de dependência (sólida)
      {
        selector: '.dep-edge',
        style: {
          'width'              : 1.5,
          'line-color'         : '#7a9dcc',
          'target-arrow-color' : '#7a9dcc',
          'target-arrow-shape' : 'triangle',
          'curve-style'        : 'bezier',
          'line-style'         : 'solid',
          'label'              : 'data(status)',
          'font-size'          : '8px',
          'color'              : '#999',
          'text-rotation'      : 'autorotate',
          'text-margin-y'      : -6
        }
      },
      // Aresta de geração (tracejada, laranja)
      {
        selector: '.gen-edge',
        style: {
          'width'              : 2,
          'line-color'         : '#d4910a',
          'target-arrow-color' : '#d4910a',
          'target-arrow-shape' : 'vee',
          'curve-style'        : 'bezier',
          'line-style'         : 'dashed',
          'label'              : 'gera',
          'font-size'          : '9px',
          'font-weight'        : '700',
          'color'              : '#d4910a',
          'text-rotation'      : 'autorotate'
        }
      },
      // Seleção
      {
        selector: 'node:selected',
        style: { 'border-width': 3, 'border-color': '#fff', 'overlay-opacity': 0.1 }
      }
    ],
    layout: {
      name    : 'dagre',
      rankDir  : 'TB',
      nodeSep  : 25,
      rankSep  : 45,
      padding  : 20,
      ranker   : 'tight-tree'
    },
    minZoom         : 0.05,
    maxZoom         : 4,
    wheelSensitivity: 0.3
  });

  // Clique no nó comum → modal de detalhes
  cy.on('tap', '.job-node', function(evt) {
    var d = evt.target.data();
    _fluxoAbrirModal(d);
  });

  // Clique duplo (ou clique) no GERADOR → expandir/recolher filhos
  cy.on('tap', '.job-gerador', function(evt) {
    _fluxoTogglePlanChildren(evt.target.data('id'));
  });

  cy.on('mouseover', '.job-node', function(evt) { evt.target.style('opacity', 0.8); });
  cy.on('mouseout',  '.job-node', function(evt) { evt.target.style('opacity', 1);   });
}

// Modal de detalhes do job (modo TXT)
function _fluxoAbrirModal(data) {
  document.getElementById('modalTitle').textContent = 'Job: ' + data.id;
  var campos = [
    ['ID / Nome'  , data.id],
    ['Descrição'  , data.jobLabel || '-'],
    ['Tipo'       , data.nodeType  || 'NORMAL'],
    ['Grupo'      , data.grp       || '-'],
    ['Nível'      , data.level     || '-'],
    ['Calendário' , data.calendar  || '-'],
    ['Gerado por' , data.generatedBy || '-']
  ];
  document.getElementById('modalTable').innerHTML = campos.map(function(r) {
    return '<tr><td>' + r[0] + '</td><td>' + (r[1] || '-') + '</td></tr>';
  }).join('');
  document.getElementById('modalOverlay').classList.add('open');
}

// Toggle mostrar/ocultar filhos de um nó GERADOR
function _fluxoTogglePlanChildren(planId) {
  if (!cy) return;
  var filhos = cy.nodes('.job-gerado').filter(function(n) {
    return n.data('generatedBy') === planId;
  });
  if (!filhos.length) {
    toast('Clique no nó para detalhes. Nenhum filho encontrado no grafo atual.');
    _fluxoAbrirModal(cy.$('#' + planId).data());
    return;
  }
  if (_planCollapsed[planId]) {
    filhos.style('display', 'element');
    cy.edges('[source = "' + planId + '"]').style('display', 'element');
    _planCollapsed[planId] = false;
    toast(planId + ': ' + filhos.length + ' jobs gerados expandidos.');
  } else {
    filhos.style('display', 'none');
    cy.edges('[source = "' + planId + '"]').style('display', 'none');
    _planCollapsed[planId] = true;
    toast(planId + ': jobs gerados recolhidos. Clique novamente para expandir.');
  }
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('searchInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') pesquisar();
  });
  renderCalendario();
  renderInvestigacao(null);
  renderImpacto(null);
});
