// ============================================================
// Control-M Flow — script.js
// ============================================================
'use strict';

// ── DB de jobs (vazio – populado via importação) ──────────
var DB = {};

var currentJob = null;
var cy = null;
var cyImpacto = null;

// ── Estado do fluxo TXT importado ─────────────────────────
var _fluxoData           = null;  // { groupName: { jobs:{}, edges:[] } }
var _fluxoSelectedGroups = [];    // grupos visíveis
var _fluxoSources        = [];    // [{ filename, groups:[] }]  — fontes importadas
var _fluxoShowPlan       = true;  // mostrar nós PLAN/GERADOR
var _planCollapsed       = {};    // { planId: bool }
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

  if (nome === 'calendario') {
    // Sincroniza job selecionado ao entrar na aba
    if (!_calSelectedJob && currentJob) _calSelectedJob = currentJob.toUpperCase();
    renderCalendario();
  }

  if (nome === 'dependencias') {
    renderDependencias(currentJob);
    var tag = document.getElementById('tagDependencias');
    if (tag && currentJob) tag.textContent = currentJob;
  }
}

// ============================================================
// PESQUISA
// ============================================================
function pesquisar() {
  var val = document.getElementById('searchInput').value.trim().toUpperCase();
  if (!val) return;

  // 1) Busca no DB (Investigação)
  var chaves = Object.keys(DB);
  var matchDB = chaves.find(function(k) { return k.toUpperCase() === val; })
             || chaves.find(function(k) { return k.toUpperCase().indexOf(val) >= 0; });
  if (matchDB) {
    currentJob = matchDB;
    renderTudo(matchDB);
    document.querySelectorAll('.job-item').forEach(function(li) {
      li.classList.remove('active');
      if (li.textContent.trim() === matchDB) li.classList.add('active');
    });
    mostrarTab('investigacao', document.querySelectorAll('.tab')[0]);
    return;
  }

  // 2) Busca nos jobs do fluxo importado (_fluxoData)
  if (_fluxoData) {
    var matchFluxo = null;
    var matchFluxoExact = null;
    Object.keys(_fluxoData).forEach(function(g) {
      Object.keys(_fluxoData[g].jobs).forEach(function(jid) {
        var job = _fluxoData[g].jobs[jid];
        if (jid === val || (job.label && job.label.toUpperCase() === val)) {
          matchFluxoExact = jid;
        } else if (!matchFluxo && (jid.indexOf(val) >= 0 || (job.label && job.label.toUpperCase().indexOf(val) >= 0))) {
          matchFluxo = jid;
        }
      });
    });
    var found = matchFluxoExact || matchFluxo;
    if (found) {
      // Destaca na sidebar e abre o grafo do job
      var sidebarItem = document.querySelector('.fluxo-imported-item[data-jid="' + found + '"]');
      _fluxoSelecionarJobSidebar(found, sidebarItem);
      return;
    }
  }

  toast('Nenhum resultado para: ' + val, 3000);
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
  calSelecionarJob(nome);
  mostrarTab('investigacao', document.querySelectorAll('.tab')[0]);
}

// ============================================================
// RENDER TUDO
// ============================================================
function renderTudo(nome) {
  ['tagInvestigacao','tagFluxo','tagImpacto','tagDependencias'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.textContent = nome;
  });
  renderInvestigacao(nome);
  renderImpacto(nome);
  renderDependencias(nome);
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
// IMPACTO — cadeia de dependentes e heatmap de risco
// ============================================================

// Retorna todos os jobs downstream transitivos com nível de distância { id, nivel }
function _impactoCadeiaComNivel(jobId) {
  if (!_fluxoData) return [];
  var jobUp = jobId.toUpperCase();
  var allEdges = [];
  Object.keys(_fluxoData).forEach(function(gn) {
    (_fluxoData[gn].edges || []).forEach(function(e) {
      allEdges.push({ from: e.from.toUpperCase(), to: e.to.toUpperCase() });
    });
  });
  var visited = {}, queue = [{ id: jobUp, nivel: 0 }];
  visited[jobUp] = true;
  var result = [];
  while (queue.length) {
    var cur = queue.shift();
    allEdges.forEach(function(e) {
      if (e.from === cur.id && !visited[e.to]) {
        visited[e.to] = true;
        var item = { id: e.to, nivel: cur.nivel + 1 };
        result.push(item);
        queue.push(item);
      }
    });
  }
  return result;
}

// Retorna upstream transitivo com nível (predecessores) { id, nivel }
function _impactoUpstreamComNivel(jobId) {
  if (!_fluxoData) return [];
  var jobUp = jobId.toUpperCase();
  var allEdges = [];
  Object.keys(_fluxoData).forEach(function(gn) {
    (_fluxoData[gn].edges || []).forEach(function(e) {
      allEdges.push({ from: e.from.toUpperCase(), to: e.to.toUpperCase() });
    });
  });
  var visited = {}, queue = [{ id: jobUp, nivel: 0 }];
  visited[jobUp] = true;
  var result = [];
  while (queue.length) {
    var cur = queue.shift();
    allEdges.forEach(function(e) {
      if (e.to === cur.id && !visited[e.from]) {
        visited[e.from] = true;
        var item = { id: e.from, nivel: cur.nivel + 1 };
        result.push(item);
        queue.push(item);
      }
    });
  }
  return result;
}

// Calcula score de criticidade (0-100)
// Componentes: % de jobs do fluxo que dependem + frequência de execução
function _calcCriticidade(jobId, downstreamCount) {
  var score = 0;
  // Componente 1: peso de dependentes (até 60 pontos)
  var totalJobs = 0;
  if (_fluxoData) {
    Object.keys(_fluxoData).forEach(function(gn) {
      totalJobs += Object.keys(_fluxoData[gn].jobs).length;
    });
  }
  if (totalJobs > 0) score += Math.min(60, Math.round((downstreamCount / totalJobs) * 100));

  // Componente 2: frequência de execução no calendário (até 40 pontos)
  if (_calData) {
    var jid = jobId.toUpperCase();
    var jdCal = _calData.jobs[jid] || _calData.jobs[jid.toLowerCase()];
    if (jdCal) {
      var stats = _calJobStats(jid);
      // 250+ exec/ano = máximo 40pts; linear
      score += Math.min(40, Math.round((stats.totalExec / 250) * 40));
    }
  }
  return Math.min(100, score);
}

// ============================================================
// RENDER DEPENDÊNCIAS
// ============================================================
function renderDependencias(nome) {
  var c = document.getElementById('cardDependencias');
  if (!c) return;
  c.innerHTML = '';

  if (!nome || !_fluxoData) {
    c.innerHTML = '<div style="color:#aaa;font-style:italic;padding:24px;text-align:center;">Importe um Fluxo TXT e selecione um job para ver as dependências.</div>';
    return;
  }

  var nomeUp = nome.toUpperCase();
  var downList = _impactoCadeiaComNivel(nomeUp);
  var upList   = _impactoUpstreamComNivel(nomeUp);

  var dirDown = downList.filter(function(j) { return j.nivel === 1; }).length;
  var indDown = downList.filter(function(j) { return j.nivel > 1; }).length;
  var dirUp   = upList.filter(function(j)   { return j.nivel === 1; }).length;
  var indUp   = upList.filter(function(j)   { return j.nivel > 1; }).length;

  var score = _calcCriticidade(nomeUp, downList.length);
  var critLabel, critClass;
  if      (score >= 75) { critLabel = '🔴 Crítico';   critClass = 'dep-crit-critico'; }
  else if (score >= 50) { critLabel = '🟠 Alto';       critClass = 'dep-crit-alto'; }
  else if (score >= 25) { critLabel = '🟡 Médio';      critClass = 'dep-crit-medio'; }
  else                  { critLabel = '🟢 Baixo';      critClass = 'dep-crit-baixo'; }

  // ── Seção: Score de Criticidade ────────────────────────
  var secScore = _depSection('⚡ Score de Criticidade — ' + nomeUp);
  var body = secScore.querySelector('.dep-section-body');

  var scoreRow = document.createElement('div');
  scoreRow.className = 'dep-score-row';
  [
    { val: downList.length,        lbl: 'Dependentes Totais' },
    { val: dirDown,                lbl: 'Diretos ↓' },
    { val: upList.length,          lbl: 'Predecessores Totais' },
    { val: dirUp,                  lbl: 'Diretos ↑' }
  ].forEach(function(s) {
    var card = document.createElement('div');
    card.className = 'dep-score-card';
    card.innerHTML = '<div class="val">' + s.val + '</div><div class="lbl">' + s.lbl + '</div>';
    scoreRow.appendChild(card);
  });
  body.appendChild(scoreRow);

  var barDiv = document.createElement('div');
  barDiv.className = 'dep-criticidade-bar';
  barDiv.innerHTML =
    '<div class="dep-criticidade-label">Nível de Criticidade: ' + critLabel +
    ' <span style="font-size:10px;font-weight:400;color:#888;">(score ' + score + '/100)</span></div>' +
    '<div class="dep-criticidade-track">' +
      '<div class="dep-criticidade-fill ' + critClass + '" style="width:' + score + '%"></div>' +
    '</div>' +
    '<div style="font-size:10px;color:#888;margin-top:4px;">' +
      'Baseado em: ' + downList.length + ' job(s) dependente(s)' +
      (_calData ? ' + frequência de execução no calendário' : ' (importe o calendário para incluir frequência)') +
    '</div>';
  body.appendChild(barDiv);
  c.appendChild(secScore);

  // ── Seção: Downstream ───────────────────────────────────
  var secDown = _depSection('↓ Jobs que param se ' + nomeUp + ' falhar (' + downList.length + ')');
  secDown.querySelector('.dep-section-header').querySelector('.dep-badge').textContent = downList.length + ' afetados';
  var bodyDown = secDown.querySelector('.dep-section-body');

  if (downList.length === 0) {
    bodyDown.innerHTML = '<span style="color:#aaa;font-style:italic;font-size:12px;">Nenhum job depende deste no fluxo.</span>';
  } else {
    var treeDown = _buildDepTree(downList, false);
    bodyDown.appendChild(treeDown);
  }
  c.appendChild(secDown);

  // ── Seção: Upstream ──────────────────────────────────────
  var secUp = _depSection('↑ Jobs que podem causar falha neste (' + upList.length + ')');
  secUp.querySelector('.dep-section-header').querySelector('.dep-badge').textContent = upList.length + ' predecessores';
  secUp.querySelector('.dep-section-header').querySelector('.dep-badge').style.background = '#6f42c1';
  var bodyUp = secUp.querySelector('.dep-section-body');

  if (upList.length === 0) {
    bodyUp.innerHTML = '<span style="color:#aaa;font-style:italic;font-size:12px;">Nenhum predecessor encontrado — este é o início do fluxo.</span>';
  } else {
    var treeUp = _buildDepTree(upList, true);
    bodyUp.appendChild(treeUp);
  }
  c.appendChild(secUp);
}

// Cria estrutura de seção reutilizável
function _depSection(titulo) {
  var sec = document.createElement('div');
  sec.className = 'dep-section';
  var hdr = document.createElement('div');
  hdr.className = 'dep-section-header';
  hdr.innerHTML = titulo + '<span class="dep-badge"></span>';
  sec.appendChild(hdr);
  var body = document.createElement('div');
  body.className = 'dep-section-body';
  sec.appendChild(body);
  return sec;
}

// Monta lista visual de jobs com indentação por nível
function _buildDepTree(lista, isUpstream) {
  var directClass   = isUpstream ? 'upstream-direct'   : 'direct';
  var indirectClass = isUpstream ? 'upstream-indirect' : 'indirect';

  var container = document.createElement('div');
  container.className = 'dep-tree';

  // Separa diretos e indiretos
  var diretos   = lista.filter(function(j) { return j.nivel === 1; });
  var indiretos = lista.filter(function(j) { return j.nivel > 1; });

  // Label diretos
  var lblDir = document.createElement('div');
  lblDir.className = 'dep-indent-label';
  lblDir.textContent = 'Diretos (' + diretos.length + ')';
  container.appendChild(lblDir);

  diretos.forEach(function(job) {
    container.appendChild(_depJobRow(job.id, directClass, 1));
  });

  if (indiretos.length) {
    var lblInd = document.createElement('div');
    lblInd.className = 'dep-indent-label';
    lblInd.style.cursor = 'pointer';

    var indWrap = document.createElement('div');
    var visible = false;

    lblInd.innerHTML = 'Indiretos (' + indiretos.length + ') <button class="dep-toggle-btn">↓ Expandir</button>';
    lblInd.querySelector('button').onclick = function(e) {
      e.stopPropagation();
      visible = !visible;
      indWrap.style.display = visible ? '' : 'none';
      lblInd.querySelector('button').textContent = visible ? '↑ Recolher' : '↓ Expandir';
    };
    indWrap.style.display = 'none';
    indiretos.forEach(function(job) {
      indWrap.appendChild(_depJobRow(job.id, indirectClass, job.nivel));
    });
    container.appendChild(lblInd);
    container.appendChild(indWrap);
  }

  return container;
}

// Cria linha de job na árvore
function _depJobRow(jobId, cls, nivel) {
  var row = document.createElement('div');
  row.className = 'dep-tree-job ' + cls;

  var icon = document.createElement('span');
  icon.className = 'dep-job-icon';
  icon.textContent = nivel === 1 ? '🔗' : '↳';
  row.appendChild(icon);

  var name = document.createElement('span');
  name.className = 'dep-job-name';
  name.textContent = jobId;
  row.appendChild(name);

  // Frequência do calendário se disponível
  if (_calData) {
    var jdCal = _calData.jobs[jobId] || _calData.jobs[jobId.toUpperCase()];
    if (jdCal) {
      var freq = document.createElement('span');
      freq.className = 'dep-job-freq';
      var pat = _calDetectarPadrao(jobId.toUpperCase());
      freq.textContent = pat.label;
      freq.style.background = pat.color + '22';
      freq.style.color = pat.color;
      freq.style.border = '1px solid ' + pat.color + '55';
      row.appendChild(freq);
    }
  }

  // Clique leva ao job
  row.onclick = function() {
    currentJob = jobId;
    renderTudo(jobId);
    mostrarTab('dependencias', document.querySelectorAll('.tab')[3]);
    renderDependencias(jobId);
    var tag = document.getElementById('tagDependencias');
    if (tag) tag.textContent = jobId;
  };
  row.style.cursor = 'pointer';
  return row;
}

// Retorna todos os jobs downstream transitivos (string[], versão simples)
function _impactoCadeia(jobId) {
  return _impactoCadeiaComNivel(jobId).map(function(r) { return r.id; });
}

// Retorna predecessores diretos (upstream) do job
function _impactoUpstream(jobId) {
  if (!_fluxoData) return [];
  var jobUp = jobId.toUpperCase();
  var preds = [];
  Object.keys(_fluxoData).forEach(function(gn) {
    (_fluxoData[gn].edges || []).forEach(function(e) {
      if (e.to.toUpperCase() === jobUp && preds.indexOf(e.from.toUpperCase()) < 0) {
        preds.push(e.from.toUpperCase());
      }
    });
  });
  return preds;
}

// Retorna mapa { 'YYYY-MM-DD': count } de jobs da cadeia que executam em cada dia
function _impactoBuildRiskMap(jobList) {
  if (!_calData || !jobList.length) return {};
  var yr = _calData.year;
  var dayCount = {};
  jobList.forEach(function(jid) {
    var jd = _calData.jobs[jid] || _calData.jobs[jid.toUpperCase()];
    if (!jd) return;
    for (var m = 1; m <= 12; m++) {
      var mKey = 'M' + (m < 10 ? '0' : '') + m;
      var dias = jd[mKey];
      if (!dias) continue;
      var dInM = new Date(yr, m, 0).getDate();
      for (var d = 0; d < dias.length && d < dInM; d++) {
        if (dias[d]) {
          var key = yr + '-' + (m < 10 ? '0' : '') + m + '-' + ((d + 1) < 10 ? '0' : '') + (d + 1);
          dayCount[key] = (dayCount[key] || 0) + 1;
        }
      }
    }
  });
  return dayCount;
}

// Retorna até N próximas datas de execução do job a partir de hoje
function _calProximasExecucoes(jobId, n) {
  if (!_calData) return [];
  var jd = _calData.jobs[jobId] || _calData.jobs[jobId.toUpperCase()];
  if (!jd) return [];
  var yr = _calData.year;
  var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  var datas = [];
  for (var m = 1; m <= 12 && datas.length < n; m++) {
    var mKey = 'M' + (m < 10 ? '0' : '') + m;
    var dias = jd[mKey];
    if (!dias) continue;
    var dInM = new Date(yr, m, 0).getDate();
    for (var d = 0; d < dias.length && d < dInM && datas.length < n; d++) {
      if (dias[d]) {
        var dt = new Date(yr, m - 1, d + 1);
        if (dt >= hoje) datas.push((d + 1) + '/' + (m < 10 ? '0' : '') + m + '/' + yr);
      }
    }
  }
  return datas;
}

// ============================================================
// FLUXO COMPLETO — monta visão topológica de todo o subgrafo
// do job selecionado (raízes → job → folhas), com nível e role
// Retorna: [{ nivel: N, jobs: [{id, role}] }, ...]
// role: 'upstream' | 'selected' | 'downstream'
// ============================================================
function _fluxoCaminhoCompleto(jobId) {
  if (!_fluxoData) return [];
  var jobUp = jobId.toUpperCase();

  // Coletar todas as arestas do fluxo
  var allEdges = [];
  Object.keys(_fluxoData).forEach(function(gn) {
    (_fluxoData[gn].edges || []).forEach(function(e) {
      allEdges.push({ from: e.from.toUpperCase(), to: e.to.toUpperCase() });
    });
  });

  // BFS upstream — encontra todos os ancestrais
  var upVisited = {};
  upVisited[jobUp] = true;
  var upQueue = [jobUp];
  var ancestors = {};
  while (upQueue.length) {
    var cur = upQueue.shift();
    allEdges.forEach(function(e) {
      if (e.to === cur && !upVisited[e.from]) {
        upVisited[e.from] = true;
        ancestors[e.from] = true;
        upQueue.push(e.from);
      }
    });
  }

  // BFS downstream — encontra todos os descendentes
  var dnVisited = {};
  dnVisited[jobUp] = true;
  var dnQueue = [jobUp];
  var descendants = {};
  while (dnQueue.length) {
    var cur2 = dnQueue.shift();
    allEdges.forEach(function(e) {
      if (e.from === cur2 && !dnVisited[e.to]) {
        dnVisited[e.to] = true;
        descendants[e.to] = true;
        dnQueue.push(e.to);
      }
    });
  }

  // Subgrafo relevante
  var subNodes = {};
  Object.keys(ancestors).forEach(function(id) { subNodes[id] = true; });
  subNodes[jobUp] = true;
  Object.keys(descendants).forEach(function(id) { subNodes[id] = true; });

  // Arestas internas ao subgrafo
  var subEdges = allEdges.filter(function(e) {
    return subNodes[e.from] && subNodes[e.to];
  });

  // Calcular in-degree para ordenação topológica por nível (longest path = nível máximo)
  var levelMap = {};
  Object.keys(subNodes).forEach(function(id) { levelMap[id] = 0; });

  // Ordenação topológica via Kahn — atribuir ao nó filho max(nível pai + 1)
  var inDeg = {};
  Object.keys(subNodes).forEach(function(id) { inDeg[id] = 0; });
  subEdges.forEach(function(e) { inDeg[e.to] = (inDeg[e.to] || 0) + 1; });

  var topoQueue = Object.keys(subNodes).filter(function(id) { return inDeg[id] === 0; });
  topoQueue.forEach(function(id) { levelMap[id] = 0; });

  var processados = 0;
  while (topoQueue.length) {
    var cur3 = topoQueue.shift();
    processados++;
    subEdges.forEach(function(e) {
      if (e.from === cur3) {
        var novo = (levelMap[cur3] || 0) + 1;
        if (novo > (levelMap[e.to] || 0)) levelMap[e.to] = novo;
        inDeg[e.to]--;
        if (inDeg[e.to] === 0) topoQueue.push(e.to);
      }
    });
  }

  // Agrupar por nível
  var byLevel = {};
  Object.keys(subNodes).forEach(function(id) {
    var lv = levelMap[id] || 0;
    if (!byLevel[lv]) byLevel[lv] = [];
    var role = id === jobUp ? 'selected' : (ancestors[id] ? 'upstream' : 'downstream');
    byLevel[lv].push({ id: id, role: role });
  });

  return Object.keys(byLevel).map(Number).sort(function(a, b) { return a - b; }).map(function(lv) {
    // Dentro do nível: selected primeiro, upstream depois, downstream por último
    byLevel[lv].sort(function(a, b) {
      var ord = { selected: 0, upstream: 1, downstream: 2 };
      return ord[a.role] - ord[b.role];
    });
    return { nivel: lv, jobs: byLevel[lv] };
  });
}

// ============================================================
// IMPACTO — renderiza a página N do grafo paginado
// ============================================================
// ============================================================
// FLUXO IMPACTO — Cytoscape + dagre (minimiza cruzamentos)
// ============================================================
function _renderImpactoFluxoSVG(outerWrapper, fluxoPath) {
  // ── 1. Coletar nodes ──
  var nodeInfo = {};
  var cyEls    = [];
  fluxoPath.forEach(function(lv) {
    lv.jobs.forEach(function(j) {
      nodeInfo[j.id] = { role: j.role, nivel: lv.nivel };
      var role   = j.role;
      var temCal = _calData && (_calData.jobs[j.id] || _calData.jobs[j.id.toUpperCase()]);
      var bg, brd, txt, brdW;
      if (role === 'selected')      { bg = '#1a2a4a'; brd = '#3a6fc8'; txt = '#ffffff'; brdW = 3;   }
      else if (role === 'upstream') { bg = '#d8eaff'; brd = '#7ab3e8'; txt = '#1a4d8a'; brdW = 1.5; }
      else                          { bg = '#fff3cd'; brd = '#f0b429'; txt = '#7a5404'; brdW = 1.5; }
      if (temCal && role !== 'selected') brd = '#ffc107';
      cyEls.push({
        group: 'nodes',
        data: { id: j.id, label: j.id, role: role, nivel: lv.nivel,
                bg: bg, brd: brd, txt: txt, brdW: brdW, temCal: temCal ? 1 : 0 }
      });
    });
  });

  // ── 2. Coletar arestas reais ──
  var edgeSeen = {};
  if (_fluxoData) {
    Object.keys(_fluxoData).forEach(function(gn) {
      (_fluxoData[gn].edges || []).forEach(function(e) {
        var f = e.from.toUpperCase(), t = e.to.toUpperCase();
        var k = f + '\u2192' + t;
        if (nodeInfo[f] && nodeInfo[t] && !edgeSeen[k]) {
          edgeSeen[k] = true;
          cyEls.push({
            group: 'edges',
            data: { id: k, source: f, target: t, status: e.status || '' },
            classes: e.edgeType === 'generation' ? 'gen-edge' : 'dep-edge'
          });
        }
      });
    });
  }
  if (!cyEls.length) return;

  // ── 3. Barra de botões ──
  var zBar = document.createElement('div');
  zBar.style.cssText = 'display:flex;gap:4px;justify-content:flex-end;padding:4px 4px 3px;';
  zBar.innerHTML =
    '<button class="cy-btn" id="cyIZ">+</button>' +
    '<button class="cy-btn" id="cyIOZ">−</button>' +
    '<button class="cy-btn" id="cyIF">⊡</button>';
  outerWrapper.appendChild(zBar);

  // ── 4. Container scrollável ──
  var wrap = document.createElement('div');
  wrap.className = 'impacto-swimlane-scroll';
  wrap.style.height = '460px';
  var cyDiv = document.createElement('div');
  cyDiv.style.cssText = 'width:100%;height:100%;';
  wrap.appendChild(cyDiv);
  outerWrapper.appendChild(wrap);

  // ── 5. Cytoscape + dagre ──
  if (cyImpacto) { try { cyImpacto.destroy(); } catch(x) {} cyImpacto = null; }
  cyImpacto = cytoscape({
    container: cyDiv,
    elements: cyEls,
    style: [
      {
        selector: 'node',
        style: {
          'shape': 'round-rectangle',
          'label': 'data(label)',
          'text-valign': 'center', 'text-halign': 'center',
          'color': 'data(txt)',
          'font-size': '11px', 'font-weight': '700',
          'font-family': 'Segoe UI, Arial, sans-serif',
          'background-color': 'data(bg)',
          'border-color': 'data(brd)',
          'border-width': 'data(brdW)',
          'width': 'label', 'height': 36, 'padding': '10px',
          'text-wrap': 'wrap', 'text-max-width': '130px'
        }
      },
      { selector: 'node[role = "selected"]', style: { 'height': 42, 'font-size': '12px' } },
      { selector: 'node[temCal = 1][role != "selected"]', style: { 'border-color': '#ffc107', 'border-width': 2.5 } },
      { selector: 'node:selected', style: { 'border-width': 4 } },
      {
        selector: '.dep-edge',
        style: {
          'width': 1.8, 'line-color': '#3a6fc8',
          'target-arrow-color': '#3a6fc8', 'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'label': 'data(status)', 'font-size': '9px', 'color': '#3a6fc8',
          'text-background-color': '#fff', 'text-background-opacity': 0.9, 'text-background-padding': '2px'
        }
      },
      {
        selector: '.gen-edge',
        style: {
          'width': 1.5, 'line-color': '#d4910a',
          'target-arrow-color': '#d4910a', 'target-arrow-shape': 'triangle',
          'curve-style': 'bezier', 'line-style': 'dashed'
        }
      }
    ],
    layout: { name: 'dagre', rankDir: 'LR', nodeSep: 50, rankSep: 90, edgeSep: 15, padding: 28 },
    minZoom: 0.08, maxZoom: 3, wheelSensitivity: 0.3,
    boxSelectionEnabled: false
  });

  cyImpacto.on('tap', 'node', function(evt) { currentJob = evt.target.id(); renderTudo(currentJob); });
  cyImpacto.on('mouseover', 'node', function(e) { e.target.style('opacity', 0.72); });
  cyImpacto.on('mouseout',  'node', function(e) { e.target.style('opacity', 1); });

  setTimeout(function() {
    cyImpacto.fit(undefined, 28);
    var zi = document.getElementById('cyIZ');
    var zo = document.getElementById('cyIOZ');
    var zf = document.getElementById('cyIF');
    if (zi) zi.onclick = function() { cyImpacto.zoom({ level: cyImpacto.zoom() * 1.25, renderedPosition: { x: cyImpacto.width()/2, y: cyImpacto.height()/2 } }); };
    if (zo) zo.onclick = function() { cyImpacto.zoom({ level: cyImpacto.zoom() * 0.80, renderedPosition: { x: cyImpacto.width()/2, y: cyImpacto.height()/2 } }); };
    if (zf) zf.onclick = function() { cyImpacto.fit(undefined, 28); };
  }, 80);
}


// ============================================================
// RENDER IMPACTO
// ============================================================
function renderImpacto(nome) {
  var c = document.getElementById('cardImpacto');
  if (!c) return;
  c.innerHTML = '';
  if (cyImpacto) { cyImpacto.destroy(); cyImpacto = null; }

  var semDados = !nome || (!DB[nome] && !_fluxoData);
  var colNodes = [];   // colNodes[li] = [jid, ...]
  for (var ci = 0; ci < numLevels; ci++) colNodes.push([]);
  fluxoPath.forEach(function(lv, li) {
    lv.jobs.forEach(function(j) {
      nodeInfo[j.id] = { role: j.role, li: li, nivel: lv.nivel };
      colNodes[li].push(j.id);
    });
  });

  // ── 2. Dimensões totais ──
  var maxPerCol = 0;
  colNodes.forEach(function(col) { maxPerCol = Math.max(maxPerCol, col.length); });
  var totalH = COL_PAD * 2 + maxPerCol * NODE_H + Math.max(0, maxPerCol - 1) * V_GAP;
  var totalW = LEFT_M + numLevels * COL_STEP - H_GAP + 56;

  // ── 3. Posições: cada node centrado verticalmente na sua coluna ──
  var posMap = {};
  colNodes.forEach(function(col, li) {
    var colH   = col.length * NODE_H + Math.max(0, col.length - 1) * V_GAP;
    var startY = COL_PAD + (totalH - COL_PAD * 2 - colH) / 2;
    col.forEach(function(jid, ni) {
      var x = LEFT_M + li * COL_STEP;
      var y = startY + ni * (NODE_H + V_GAP);
      posMap[jid] = { x: x, y: y, cx: x + NODE_W / 2, cy: y + NODE_H / 2 };
    });
  });

  // ── 4. Coletar arestas reais ──
  var subEdges = [], edgeSeen = {};
  if (_fluxoData) {
    Object.keys(_fluxoData).forEach(function(gn) {
      (_fluxoData[gn].edges || []).forEach(function(e) {
        var f = e.from.toUpperCase(), t = e.to.toUpperCase();
        var k = f + '\u2192' + t;
        if (posMap[f] && posMap[t] && !edgeSeen[k]) {
          edgeSeen[k] = true;
          subEdges.push({ from: f, to: t, status: e.status, edgeType: e.edgeType });
        }
      });
    });
  }

  // ── 5. DOM container ──
  var scrollWrap = document.createElement('div');
  scrollWrap.className = 'impacto-swimlane-scroll';

  var inner = document.createElement('div');
  inner.style.cssText = 'position:relative;width:' + totalW + 'px;height:' + totalH + 'px;' +
    'font-family:Segoe UI,Arial,sans-serif;background:#f7f9fc;border-radius:8px;';

  // ── 6. Faixas de coluna com fundo sutil e rótulo de nível ──
  colNodes.forEach(function(col, li) {
    if (!col.length) return;
    var roles = col.map(function(jid) { return nodeInfo[jid].role; });
    var hasSel = roles.indexOf('selected') >= 0;
    var hasUp  = roles.indexOf('upstream') >= 0;
    var bg  = hasSel ? 'rgba(26,42,74,0.06)' : hasUp ? 'rgba(58,111,200,0.05)' : 'rgba(240,180,41,0.07)';
    var brd = hasSel ? '#c5d4ec' : hasUp ? '#c5d9f5' : '#f0dea0';

    var colBand = document.createElement('div');
    colBand.style.cssText =
      'position:absolute;left:' + (LEFT_M + li * COL_STEP - 8) + 'px;top:6px;' +
      'width:' + (NODE_W + 16) + 'px;height:' + (totalH - 12) + 'px;' +
      'background:' + bg + ';border:1px solid ' + brd + ';border-radius:8px;box-sizing:border-box;';
    inner.appendChild(colBand);

    var hdr = document.createElement('div');
    hdr.style.cssText =
      'position:absolute;left:' + (LEFT_M + li * COL_STEP + NODE_W / 2 - 14) + 'px;top:8px;' +
      'font-size:9px;font-weight:700;color:#b0bad0;letter-spacing:0.5px;pointer-events:none;';
    hdr.textContent = 'N' + fluxoPath[li].nivel;
    inner.appendChild(hdr);
  });

  // ── 7. SVG overlay — setas ──
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('style', 'position:absolute;left:0;top:0;pointer-events:none;overflow:visible;');
  svg.setAttribute('width', totalW);
  svg.setAttribute('height', totalH);

  var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  function mkMark(id, color) {
    var mk = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    mk.setAttribute('id', id);
    mk.setAttribute('markerWidth', '7'); mk.setAttribute('markerHeight', '7');
    mk.setAttribute('refX', '6');       mk.setAttribute('refY', '3');
    mk.setAttribute('orient', 'auto');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    p.setAttribute('points', '0 0,7 3,0 6'); p.setAttribute('fill', color);
    mk.appendChild(p); defs.appendChild(mk);
  }
  mkMark('mDep', '#3a6fc8');
  mkMark('mGen', '#d4910a');
  svg.appendChild(defs);

  // ── 8. Desenhar setas ──
  subEdges.forEach(function(e) {
    var s = posMap[e.from], t = posMap[e.to];
    if (!s || !t) return;
    var isGen  = e.edgeType === 'generation';
    var color  = isGen ? '#d4910a' : '#3a6fc8';
    var markId = isGen ? 'mGen' : 'mDep';
    var x1 = s.x + NODE_W + 2, y1 = s.cy;
    var x2 = t.x - 3,          y2 = t.cy;
    var cpX = (x1 + x2) / 2;

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M ' + x1 + ' ' + y1 +
      ' C ' + cpX + ' ' + y1 + ',' + cpX + ' ' + y2 + ',' + x2 + ' ' + y2);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', isGen ? '1.5' : '1.8');
    path.setAttribute('marker-end', 'url(#' + markId + ')');
    if (isGen) path.setAttribute('stroke-dasharray', '5 3');
    svg.appendChild(path);

    if (e.status) {
      var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      var rw = e.status.length * 5.5 + 8;
      var bgR = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgR.setAttribute('x', mx - rw / 2); bgR.setAttribute('y', my - 9);
      bgR.setAttribute('width', rw);      bgR.setAttribute('height', 12);
      bgR.setAttribute('rx', '3');
      bgR.setAttribute('fill', '#f7f9fc'); bgR.setAttribute('opacity', '0.95');
      svg.appendChild(bgR);
      var lt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lt.setAttribute('x', mx); lt.setAttribute('y', my + 1);
      lt.setAttribute('font-size', '9'); lt.setAttribute('fill', color);
      lt.setAttribute('text-anchor', 'middle'); lt.setAttribute('font-weight', '600');
      lt.setAttribute('font-family', 'Segoe UI,Arial,sans-serif');
      lt.textContent = e.status;
      svg.appendChild(lt);
    }
  });
  inner.appendChild(svg);

  // ── 9. Boxes dos nodes ──
  Object.keys(posMap).forEach(function(jid) {
    var pos  = posMap[jid];
    var info = nodeInfo[jid];
    var temCal = _calData && (_calData.jobs[jid] || _calData.jobs[jid.toUpperCase()]);
    var bgC, brdC, txtC, brdW = 1.5, shadow = '';
    if (info.role === 'selected') {
      bgC = '#1a2a4a'; brdC = '#3a6fc8'; txtC = '#fff'; brdW = 2.5;
      shadow = '0 2px 10px rgba(58,111,200,.35)';
    } else if (info.role === 'upstream') {
      bgC = '#d8eaff'; brdC = '#7ab3e8'; txtC = '#1a4d8a';
    } else {
      bgC = '#fff3cd'; brdC = '#f0b429'; txtC = '#7a5404';
    }
    if (temCal && info.role !== 'selected') brdC = '#ffc107';

    var box = document.createElement('div');
    box.style.cssText =
      'position:absolute;left:' + pos.x + 'px;top:' + pos.y + 'px;' +
      'width:' + NODE_W + 'px;height:' + NODE_H + 'px;border-radius:7px;' +
      'display:flex;align-items:center;justify-content:center;text-align:center;' +
      'font-size:11px;font-weight:700;font-family:Segoe UI,Arial,sans-serif;' +
      'background:' + bgC + ';border:' + brdW + 'px solid ' + brdC + ';' +
      (shadow ? 'box-shadow:' + shadow + ';' : '') +
      'cursor:pointer;user-select:none;overflow:hidden;padding:0 7px;box-sizing:border-box;' +
      'color:' + txtC + ';transition:opacity .13s,transform .1s;';
    box.textContent = jid;
    box.title = jid + (temCal ? ' — tem calendário' : '') + ' | Nível ' + info.nivel;
    box.onmouseenter = function() { box.style.opacity = '0.75'; box.style.transform = 'translateY(-1px)'; };
    box.onmouseleave = function() { box.style.opacity = '';     box.style.transform = ''; };
    box.onclick = (function(id) { return function() { currentJob = id; renderTudo(id); }; })(jid);
    inner.appendChild(box);
  });

}
if (false) { // dead code — orphaned swim-lane block, to be removed
  var lH  = [0, 1, 2].map(function(l) { return laneHeight(laneSeqs[l].length); });
  var lOff = [0, lH[0], lH[0] + lH[1]];
  var totalH = lH[0] + lH[1] + lH[2];

  var maxColsUsed = 0;
  laneSeqs.forEach(function(s) { maxColsUsed = Math.max(maxColsUsed, Math.min(s.length, PER_ROW)); });
  var innerW = LANE_LBL + maxColsUsed * NODE_STEP - H_GAP + 56;

  // ── 3. Posições ──
  var posMap = {};
  laneSeqs.forEach(function(seq, ln) {
    seq.forEach(function(jid, idx) {
      var row = Math.floor(idx / PER_ROW);
      var col = idx % PER_ROW;
      var x   = LANE_LBL + col * NODE_STEP;
      var y   = lOff[ln] + LANE_PAD + row * (NODE_H + V_GAP);
      posMap[jid] = {
        x: x, y: y, cx: x + NODE_W / 2, cy: y + NODE_H / 2,
        row: row, col: col, lane: ln, idx: idx
      };
    });
  });

  // ── 4. Arestas reais de _fluxoData ──
  var subEdges = [], edgeSeen = {};
  if (_fluxoData) {
    Object.keys(_fluxoData).forEach(function(gn) {
      (_fluxoData[gn].edges || []).forEach(function(e) {
        var f = e.from.toUpperCase(), t = e.to.toUpperCase();
        var k = f + '\u2192' + t;
        if (posMap[f] && posMap[t] && !edgeSeen[k]) {
          edgeSeen[k] = true;
          subEdges.push({ from: f, to: t, status: e.status, edgeType: e.edgeType });
        }
      });
    });
  }

  // ── 5. DOM container ──
  var scrollWrap = document.createElement('div');
  scrollWrap.className = 'impacto-swimlane-scroll';

  var inner = document.createElement('div');
  inner.style.cssText = 'position:relative;width:' + innerW + 'px;height:' + totalH + 'px;' +
    'font-family:Segoe UI,Arial,sans-serif;';

  // ── 6. Fundos de lane + rótulos ──
  var LANE_CFG = [
    { bg: '#eef4ff', border: '#c5d9f5', lbl: 'Antecessores', tc: '#1a4d8a' },
    { bg: '#f0f9f0', border: '#b8dbb8', lbl: 'Analisado',    tc: '#1b5e20' },
    { bg: '#fffbec', border: '#f0dea0', lbl: 'Dependentes',  tc: '#7a5404' }
  ];
  for (var l = 0; l < 3; l++) {
    if (!lH[l]) continue;
    var band = document.createElement('div');
    band.style.cssText = 'position:absolute;left:0;top:' + lOff[l] + 'px;' +
      'width:' + innerW + 'px;height:' + lH[l] + 'px;' +
      'background:' + LANE_CFG[l].bg + ';' +
      'border-top:1.5px solid ' + LANE_CFG[l].border + ';box-sizing:border-box;';
    inner.appendChild(band);

    var lbl = document.createElement('div');
    lbl.style.cssText = 'position:absolute;left:0;top:' + lOff[l] + 'px;' +
      'width:' + (LANE_LBL - 8) + 'px;height:' + lH[l] + 'px;' +
      'display:flex;align-items:center;justify-content:center;' +
      'font-size:11px;font-weight:700;color:' + LANE_CFG[l].tc + ';' +
      'text-align:center;padding:2px 5px;box-sizing:border-box;line-height:1.3;' +
      'border-right:2px solid ' + LANE_CFG[l].border + ';';
    lbl.textContent = LANE_CFG[l].lbl;
    inner.appendChild(lbl);
  }

  // ── 7. SVG overlay ──
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('style', 'position:absolute;left:0;top:0;pointer-events:none;overflow:visible;');
  svg.setAttribute('width', innerW);
  svg.setAttribute('height', totalH);

  var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  function mkMark(id, color, opacity) {
    var mk = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    mk.setAttribute('id', id);
    mk.setAttribute('markerWidth', '7'); mk.setAttribute('markerHeight', '7');
    mk.setAttribute('refX', '6');       mk.setAttribute('refY', '3');
    mk.setAttribute('orient', 'auto');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    p.setAttribute('points', '0 0,7 3,0 6');
    p.setAttribute('fill', color);
    if (opacity) p.setAttribute('opacity', opacity);
    mk.appendChild(p); defs.appendChild(mk);
  }
  mkMark('svA',   '#3a6fc8');
  mkMark('svAg',  '#d4910a');
  mkMark('svSeq', '#a0b0cc', '0.8');
  svg.appendChild(defs);

  // ── 8. Setas de sequência (fluxo dentro da lane) ──
  // Conecta node[i] → node[i+1] em cada lane
  // Mesmo row: seta horizontal →
  // Quebra de row: curva pela direita descendo para a próxima linha
  laneSeqs.forEach(function(seq, ln) {
    for (var i = 0; i < seq.length - 1; i++) {
      var cPos = posMap[seq[i]];
      var nPos = posMap[seq[i + 1]];
      if (!cPos || !nPos) continue;

      var sp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      var sd;

      if (cPos.row === nPos.row) {
        // Mesma linha: seta reta →
        var ax1 = cPos.x + NODE_W + 2, ay1 = cPos.cy;
        var ax2 = nPos.x - 4,          ay2 = nPos.cy;
        sd = 'M ' + ax1 + ' ' + ay1 + ' L ' + ax2 + ' ' + ay2;
        sp.setAttribute('stroke-width', '1.8');
      } else {
        // Quebra de linha: curva pela margem direita até o início da próxima linha
        var ex = LANE_LBL + maxColsUsed * NODE_STEP - H_GAP + 36; // margem direita
        var bx1 = cPos.x + NODE_W + 3, by1 = cPos.cy;
        var tx2 = nPos.cx,              ty2 = nPos.y - 4;
        var midY = nPos.y + NODE_H / 2;
        sd = 'M ' + bx1 + ' ' + by1 +
             ' C ' + (ex + 18) + ' ' + by1 + ',' +
                     (ex + 18) + ' ' + midY + ',' +
                     tx2 + ' ' + midY +
             ' L ' + tx2 + ' ' + ty2;
        sp.setAttribute('stroke-width', '1.5');
      }

      sp.setAttribute('d', sd);
      sp.setAttribute('fill', 'none');
      sp.setAttribute('stroke', '#a0b0cc');
      sp.setAttribute('stroke-dasharray', '5 3');
      sp.setAttribute('marker-end', 'url(#svSeq)');
      svg.appendChild(sp);
    }
  });

  // ── 9. Setas de dependência reais ──
  subEdges.forEach(function(e) {
    var s = posMap[e.from], t = posMap[e.to];
    if (!s || !t) return;
    var isGen = e.edgeType === 'generation';
    var color  = isGen ? '#d4910a' : '#3a6fc8';
    var markId = isGen ? 'svAg'   : 'svA';

    var x1 = s.x + NODE_W, y1 = s.cy;
    var x2 = t.x - 2,      y2 = t.cy;
    var cpX = (x1 + x2) / 2;

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    var d = 'M ' + x1 + ' ' + y1 +
            ' C ' + cpX + ' ' + y1 + ',' + cpX + ' ' + y2 + ',' + x2 + ' ' + y2;
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('marker-end', 'url(#' + markId + ')');
    if (isGen) path.setAttribute('stroke-dasharray', '5 3');
    svg.appendChild(path);

    if (e.status) {
      var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      var rw = e.status.length * 5.5 + 8;
      var bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('x', mx - rw / 2); bg.setAttribute('y', my - 9);
      bg.setAttribute('width', rw);      bg.setAttribute('height', 12);
      bg.setAttribute('rx', '3');
      bg.setAttribute('fill', '#fff'); bg.setAttribute('opacity', '0.9');
      svg.appendChild(bg);
      var lt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lt.setAttribute('x', mx); lt.setAttribute('y', my + 1);
      lt.setAttribute('font-size', '9'); lt.setAttribute('fill', color);
      lt.setAttribute('text-anchor', 'middle'); lt.setAttribute('font-weight', '600');
      lt.setAttribute('font-family', 'Segoe UI,Arial,sans-serif');
      lt.textContent = e.status;
      svg.appendChild(lt);
    }
  });

  inner.appendChild(svg);

  // ── 10. Boxes dos nodes ──
  Object.keys(posMap).forEach(function(jid) {
    var pos  = posMap[jid];
    var info = nodeInfo[jid];
    var role = info.role;
    var temCal = _calData && (_calData.jobs[jid] || _calData.jobs[jid.toUpperCase()]);
    var bgC, brdC, txtC, shadow = '';
    if (role === 'selected')       { bgC = '#1a2a4a'; brdC = '#3a6fc8'; txtC = '#fff'; shadow = '0 2px 10px rgba(58,111,200,.35)'; }
    else if (role === 'upstream')  { bgC = '#d8eaff'; brdC = '#7ab3e8'; txtC = '#1a4d8a'; }
    else                           { bgC = '#fff3cd'; brdC = '#f0b429'; txtC = '#7a5404'; }
    if (temCal && role !== 'selected') brdC = '#ffc107';

    var box = document.createElement('div');
    box.style.cssText =
      'position:absolute;left:' + pos.x + 'px;top:' + pos.y + 'px;' +
      'width:' + NODE_W + 'px;height:' + NODE_H + 'px;border-radius:7px;' +
      'display:flex;align-items:center;justify-content:center;text-align:center;' +
      'font-size:11px;font-weight:700;font-family:Segoe UI,Arial,sans-serif;' +
      'background:' + bgC + ';' +
      'border:' + (role === 'selected' ? '2.5' : '1.5') + 'px solid ' + brdC + ';' +
      (shadow ? 'box-shadow:' + shadow + ';' : '') +
      'cursor:pointer;user-select:none;overflow:hidden;padding:0 7px;box-sizing:border-box;' +
      'color:' + txtC + ';transition:opacity .13s,transform .1s;';
    box.textContent = jid;
    box.title = jid + (temCal ? ' — tem calendário' : '');
    box.onmouseenter = function() { box.style.opacity = '0.72'; box.style.transform = 'translateY(-1px)'; };
    box.onmouseleave = function() { box.style.opacity = '';     box.style.transform = ''; };
    box.onclick = (function(id) { return function() { currentJob = id; renderTudo(id); }; })(jid);
    inner.appendChild(box);
  });

  scrollWrap.appendChild(inner);
  outerWrapper.appendChild(scrollWrap);
}


// ============================================================
// RENDER IMPACTO
// ============================================================
function renderImpacto(nome) {
  var c = document.getElementById('cardImpacto');
  if (!c) return;
  c.innerHTML = '';
  if (cyImpacto) { cyImpacto.destroy(); cyImpacto = null; }

  var semDados = !nome || (!DB[nome] && !_fluxoData);
  if (semDados) {
    c.innerHTML = '<div style="color:#aaa;font-style:italic;padding:24px;text-align:center;">Pesquise um job ou importe um fluxo TXT.</div>';
    return;
  }

  var nomeUp = nome.toUpperCase();

  // ── Cabeçalho ───────────────────────────────────────────
  var titulo = document.createElement('div');
  titulo.style.cssText = 'font-size:14px;font-weight:700;margin-bottom:4px;color:#1a2a4a;';
  titulo.textContent = 'Análise de Impacto: ' + nome;
  c.appendChild(titulo);
  var sub = document.createElement('div');
  sub.style.cssText = 'font-size:12px;color:#888;margin-bottom:12px;';
  sub.innerHTML = 'Cadeia de execução a partir de <strong>' + nome + '</strong> e heatmap de risco.';
  c.appendChild(sub);

  // ── Cadeia de impacto ────────────────────────────────────
  var cadeia = _impactoCadeia(nomeUp);   // downstream jobs
  var upstream = _impactoUpstream(nomeUp); // predecessores diretos
  var todosJobs = [nomeUp].concat(cadeia); // raiz + downstream para o heatmap

  // Seção: Cadeia
  var secCadeia = document.createElement('div');
  secCadeia.className = 'impact-section';
  var secCadeiaHdr = document.createElement('div');
  secCadeiaHdr.className = 'impact-section-header';
  secCadeiaHdr.innerHTML = '&#9881; Cadeia de Dependências';
  secCadeia.appendChild(secCadeiaHdr);
  var secCadeiaBody = document.createElement('div');
  secCadeiaBody.className = 'impact-section-body';

  // Predecessores
  if (upstream.length) {
    var upLbl = document.createElement('div');
    upLbl.style.cssText = 'font-size:11px;font-weight:700;color:#888;margin-bottom:4px;';
    upLbl.textContent = '↑ Predecessores (' + upstream.length + ')';
    secCadeiaBody.appendChild(upLbl);
    var upList = document.createElement('div');
    upList.className = 'impact-chain-list';
    upstream.forEach(function(jid) {
      var chip = document.createElement('span');
      chip.className = 'impact-chain-chip ' + (_calData && (_calData.jobs[jid] || _calData.jobs[jid.toUpperCase()]) ? 'has-cal' : 'no-cal');
      chip.title = _calData && (_calData.jobs[jid] || _calData.jobs[jid.toUpperCase()]) ? 'Tem dados de calendário' : 'Sem dados de calendário';
      chip.textContent = jid;
      chip.style.background = '#6c757d';
      upList.appendChild(chip);
    });
    secCadeiaBody.appendChild(upList);
    secCadeiaBody.appendChild(Object.assign(document.createElement('div'), { style: 'margin-top:8px;' }));
  }

  // Job raiz
  var rootLbl = document.createElement('div');
  rootLbl.style.cssText = 'font-size:11px;font-weight:700;color:#1a2a4a;margin-bottom:4px;';
  rootLbl.textContent = '▶ Job Analisado';
  secCadeiaBody.appendChild(rootLbl);
  var rootChipWrap = document.createElement('div');
  rootChipWrap.className = 'impact-chain-list';
  var rootChip = document.createElement('span');
  rootChip.className = 'impact-chain-chip is-root';
  rootChip.textContent = nomeUp;
  rootChipWrap.appendChild(rootChip);
  secCadeiaBody.appendChild(rootChipWrap);

  // Downstream
  secCadeiaBody.appendChild(Object.assign(document.createElement('div'), { style: 'margin-top:8px;' }));
  var dnLbl = document.createElement('div');
  dnLbl.style.cssText = 'font-size:11px;font-weight:700;color:#888;margin-bottom:4px;';
  dnLbl.textContent = '↓ Dependentes (' + cadeia.length + ')' + (!cadeia.length ? ' — nenhum no fluxo importado' : '');
  secCadeiaBody.appendChild(dnLbl);
  if (cadeia.length) {
    var dnList = document.createElement('div');
    dnList.className = 'impact-chain-list';
    cadeia.forEach(function(jid) {
      var chip = document.createElement('span');
      var temCal = _calData && (_calData.jobs[jid] || _calData.jobs[jid.toUpperCase()]);
      chip.className = 'impact-chain-chip ' + (temCal ? 'has-cal' : 'no-cal');
      chip.title = jid + (temCal ? ' — tem calendário' : ' — sem calendário');
      chip.textContent = jid;
      dnList.appendChild(chip);
    });
    secCadeiaBody.appendChild(dnList);
  }

  secCadeia.appendChild(secCadeiaBody);
  c.appendChild(secCadeia);

  // ── Fluxo do Sistema — swim-lane SVG ─────────────────────
  if (_fluxoData) {
    var fluxoPath = _fluxoCaminhoCompleto(nomeUp);
    if (fluxoPath.length > 0) {
      var totalUpMap = {};
      fluxoPath.forEach(function(lv) {
        lv.jobs.forEach(function(j) { if (j.role === 'upstream') totalUpMap[j.id] = true; });
      });
      var nUp = Object.keys(totalUpMap).length;
      var nDn = cadeia.length;

      var secFluxo = document.createElement('div');
      secFluxo.className = 'impact-section';

      var secFluxoHdr = document.createElement('div');
      secFluxoHdr.className = 'impact-section-header';
      secFluxoHdr.innerHTML = '&#128260; Fluxo do Sistema' +
        '<span style="margin-left:auto;font-size:10px;font-weight:400;color:#888;">' +
        nUp + ' antecessor(es) &nbsp;|&nbsp; ' + fluxoPath.length + ' nível(is) &nbsp;|&nbsp; ' + nDn + ' dependente(s)</span>';
      secFluxo.appendChild(secFluxoHdr);

      var secFluxoBody = document.createElement('div');
      secFluxoBody.className = 'impact-section-body impact-section-body-graph';

      // Legenda
      var fluxoLeg = document.createElement('div');
      fluxoLeg.className = 'fluxo-caminho-legenda';
      fluxoLeg.innerHTML =
        '<span class="fluxo-caminho-leg-item"><span class="fluxo-leg-sq" style="background:#d8eaff;border:1.5px solid #7ab3e8;"></span> Antecessor</span>' +
        '<span class="fluxo-caminho-leg-item"><span class="fluxo-leg-sq" style="background:#1a2a4a;border:2px solid #3a6fc8;"></span> Analisado</span>' +
        '<span class="fluxo-caminho-leg-item"><span class="fluxo-leg-sq" style="background:#fff3cd;border:1.5px solid #f0b429;"></span> Dependente</span>' +
        '<span class="fluxo-caminho-leg-item"><span class="fluxo-leg-sq" style="background:#ffe;border:2px solid #ffc107;"></span> Com calendário</span>' +
        '<span style="margin-left:auto;font-size:10px;color:#aaa;">Clique no job para analisá-lo &nbsp;•&nbsp; scroll para navegar</span>';
      secFluxoBody.appendChild(fluxoLeg);

      _renderImpactoFluxoSVG(secFluxoBody, fluxoPath);

      secFluxo.appendChild(secFluxoBody);
      c.appendChild(secFluxo);
    }
  }

  // ── Heatmap de risco ─────────────────────────────────────
  if (_calData) {
    var riskMap  = _impactoBuildRiskMap(todosJobs);
    var maxRisco = Math.max.apply(null, [0].concat(Object.keys(riskMap).map(function(k) { return riskMap[k]; })));
    var totalDiasRisco = Object.keys(riskMap).filter(function(k) { return riskMap[k] > 0; }).length;
    var diasAlto = Object.keys(riskMap).filter(function(k) { return riskMap[k] >= 4; }).length;

    var secRisco = document.createElement('div');
    secRisco.className = 'impact-section';
    var secRiscoHdr = document.createElement('div');
    secRiscoHdr.className = 'impact-section-header';
    secRiscoHdr.innerHTML = '&#128293; Heatmap de Risco Anual <span style="margin-left:auto;font-size:10px;font-weight:400;color:#888;">ano ' + _calData.year + ' — ' + todosJobs.length + ' job(s) na cadeia</span>';
    secRisco.appendChild(secRiscoHdr);
    var secRiscoBody = document.createElement('div');
    secRiscoBody.className = 'impact-section-body';

    // Stats rápidas
    var statsRow = document.createElement('div');
    statsRow.className = 'impact-stats-row';
    [
      { val: todosJobs.length,   lbl: 'Jobs na Cadeia' },
      { val: totalDiasRisco,     lbl: 'Dias c/ Exposição' },
      { val: diasAlto,           lbl: 'Dias Alto Risco' },
      { val: maxRisco,           lbl: 'Pico (jobs/dia)' }
    ].forEach(function(s) {
      var card = document.createElement('div');
      card.className = 'impact-stat-card';
      card.innerHTML = '<div class="val">' + s.val + '</div><div class="lbl">' + s.lbl + '</div>';
      statsRow.appendChild(card);
    });
    secRiscoBody.appendChild(statsRow);

    // Legenda
    var legDiv = document.createElement('div');
    legDiv.className = 'risk-legend';
    legDiv.innerHTML = 'Nº de jobs executando: ' +
      '<span class="risk-legend-sq" style="background:#eef0f4;border:1px solid #ccc;"></span> 0 ' +
      '<span class="risk-legend-sq" style="background:#fff3cd;"></span> 1 ' +
      '<span class="risk-legend-sq" style="background:#ffc107;"></span> 2 ' +
      '<span class="risk-legend-sq" style="background:#fd7e14;"></span> 3 ' +
      '<span class="risk-legend-sq" style="background:#dc3545;"></span> 4+';
    secRiscoBody.appendChild(legDiv);

    // Grade anual
    var grid = document.createElement('div');
    grid.className = 'risk-year-grid';
    var yr = _calData.year;
    var hoje = new Date(); hoje.setHours(0, 0, 0, 0);

    for (var m = 1; m <= 12; m++) {
      var dInM     = new Date(yr, m, 0).getDate();
      var firstDow = new Date(yr, m - 1, 1).getDay();
      var mStr     = (m < 10 ? '0' : '') + m;

      var mCard = document.createElement('div');
      mCard.className = 'risk-month-card';

      var mHdr = document.createElement('div');
      mHdr.className = 'risk-month-header';
      mHdr.textContent = MESES_PT[m - 1] + ' ' + yr;
      mCard.appendChild(mHdr);

      var dGrid = document.createElement('div');
      dGrid.className = 'risk-month-days';
      ['D','S','T','Q','Q','S','S'].forEach(function(ch) {
        var h = document.createElement('div');
        h.className = 'risk-day-hdr';
        h.textContent = ch;
        dGrid.appendChild(h);
      });
      for (var ei = 0; ei < firstDow; ei++) {
        var emp = document.createElement('div');
        emp.className = 'risk-day empty';
        dGrid.appendChild(emp);
      }
      for (var dd = 1; dd <= dInM; dd++) {
        var dStr  = (dd < 10 ? '0' : '') + dd;
        var key   = yr + '-' + mStr + '-' + dStr;
        var cnt   = riskMap[key] || 0;
        var dtObj = new Date(yr, m - 1, dd);
        var isHoje = dtObj.getTime() === hoje.getTime();

        var cls = 'risk-day ';
        if      (cnt === 0) cls += 'risk-0';
        else if (cnt === 1) cls += 'risk-1';
        else if (cnt === 2) cls += 'risk-2';
        else if (cnt === 3) cls += 'risk-3';
        else                cls += 'risk-hi';
        if (isHoje) cls += ' today';

        var cell = document.createElement('div');
        cell.className = cls;
        cell.textContent = cnt > 0 ? cnt : '';
        cell.title = dd + '/' + mStr + '/' + yr + ' — ' + cnt + ' job(s) executando';
        dGrid.appendChild(cell);
      }
      mCard.appendChild(dGrid);
      grid.appendChild(mCard);
    }
    secRiscoBody.appendChild(grid);
    secRisco.appendChild(secRiscoBody);
    c.appendChild(secRisco);
  }

  // ── Tabela de relatório ──────────────────────────────────
  var jobsComCal = todosJobs.filter(function(jid) {
    return _calData && (_calData.jobs[jid] || _calData.jobs[jid.toUpperCase()]);
  });

  if (_calData && jobsComCal.length) {
    var secRel = document.createElement('div');
    secRel.className = 'impact-section';
    var secRelHdr = document.createElement('div');
    secRelHdr.className = 'impact-section-header';
    secRelHdr.innerHTML = '&#128203; Relatório de Execução por Job';
    secRel.appendChild(secRelHdr);
    var secRelBody = document.createElement('div');
    secRelBody.className = 'impact-section-body';
    secRelBody.style.overflowX = 'auto';

    var tbl = document.createElement('table');
    tbl.className = 'impact-report-table';
    tbl.innerHTML = '<thead><tr>' +
      '<th>Job</th>' +
      '<th>Papel</th>' +
      '<th>Descrição</th>' +
      '<th>Exec/Ano</th>' +
      '<th>Freq.</th>' +
      '<th>Próximas Execuções</th>' +
      '<th>Risco</th>' +
      '</tr></thead>';

    var tbody = document.createElement('tbody');
    todosJobs.forEach(function(jid) {
      var jdCal = _calData && (_calData.jobs[jid] || _calData.jobs[jid.toUpperCase()]);
      var papel = jid === nomeUp ? '⭐ Raiz' : (upstream.indexOf(jid) >= 0 ? '⬆ Predecessor' : '⬇ Dependente');
      var execAno = '-', freq = '-', proximas = '-', riscoCls = '', riscoTxt = '-';

      if (jdCal) {
        var stats = _calJobStats(jid);
        execAno = stats.totalExec;
        var pat = _calDetectarPadrao(jid);
        freq = pat.label;
        var prox = _calProximasExecucoes(jid, 3);
        proximas = prox.length ? prox.join(', ') : 'Nenhuma';
        // Risco = execuções/ano ponderado pela posição na cadeia
        if (stats.totalExec >= 250)      { riscoCls = 'badge-risco-alto';  riscoTxt = '🔴 Alto'; }
        else if (stats.totalExec >= 80)  { riscoCls = 'badge-risco-medio'; riscoTxt = '🟡 Médio'; }
        else                              { riscoCls = 'badge-risco-baixo'; riscoTxt = '🟢 Baixo'; }
      }

      var jobDesc = '';
      if (_fluxoData) {
        Object.keys(_fluxoData).some(function(gn) {
          var j = _fluxoData[gn].jobs[jid] || _fluxoData[gn].jobs[jid.toUpperCase()];
          if (j && j.label && j.label !== jid) { jobDesc = j.label; return true; }
        });
      }

      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td style="font-weight:700;white-space:nowrap;">' + jid + '</td>' +
        '<td style="white-space:nowrap;">' + papel + '</td>' +
        '<td style="font-size:11px;color:#555;">' + jobDesc + '</td>' +
        '<td style="text-align:center;">' + execAno + '</td>' +
        '<td style="white-space:nowrap;">' + freq + '</td>' +
        '<td style="font-size:10px;">' + proximas + '</td>' +
        '<td class="' + riscoCls + '" style="white-space:nowrap;">' + riscoTxt + '</td>';
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    secRelBody.appendChild(tbl);
    secRel.appendChild(secRelBody);
    c.appendChild(secRel);
  }

  // ── Barra de exportação ──────────────────────────────────
  var expBar = document.createElement('div');
  expBar.className = 'impact-export-bar';

  var btnCSV = document.createElement('button');
  btnCSV.className = 'btn btn-primary';
  btnCSV.innerHTML = '&#8681; Exportar Excel';
  btnCSV.onclick = function() { exportarImpactoCSV(nomeUp, todosJobs); };
  expBar.appendChild(btnCSV);

  if (DB[nome]) {
    var btnBasic = document.createElement('button');
    btnBasic.className = 'btn btn-secondary';
    btnBasic.innerHTML = '&#128203; Exportar Dados Básicos';
    btnBasic.onclick = exportar;
    expBar.appendChild(btnBasic);
  }

  c.appendChild(expBar);
}

// ============================================================
// EXPORTAR IMPACTO EXCEL
// ============================================================
function exportarImpactoCSV(jobId, todosJobs) {
  var yr = _calData ? _calData.year : '';
  var nomeUp = jobId.toUpperCase();
  var upstream = _impactoUpstream(nomeUp);

  // ── Aba 1: Relatório por Job ─────────────────────────────
  var dadosJobs = [
    ['Job', 'Papel', 'Descrição', 'Exec/Ano', 'Frequência', 'Dias Úteis', 'Fins de Semana', 'Meses Ativos', 'Próximas 5 Execuções', 'Risco']
  ];

  todosJobs.forEach(function(jid) {
    var papel = jid === nomeUp ? 'Raiz' : (upstream.indexOf(jid) >= 0 ? 'Predecessor' : 'Dependente');
    var execAno = '', freq = '', diasUteis = '', fds = '', mesesAt = '', proximas = '', risco = '';
    var jobDesc = '';
    if (_fluxoData) {
      Object.keys(_fluxoData).some(function(gn) {
        var j = _fluxoData[gn].jobs[jid] || _fluxoData[gn].jobs[jid.toUpperCase()];
        if (j && j.label && j.label !== jid) { jobDesc = j.label; return true; }
      });
    }
    if (_calData) {
      var jdCal = _calData.jobs[jid] || _calData.jobs[jid.toUpperCase()];
      if (jdCal) {
        var stats = _calJobStats(jid);
        execAno   = stats.totalExec;
        diasUteis = stats.diasUteis;
        fds       = stats.fds;
        mesesAt   = stats.mesesAtivos;
        freq      = _calDetectarPadrao(jid).label;
        var prox  = _calProximasExecucoes(jid, 5);
        proximas  = prox.join(' | ');
        risco = stats.totalExec >= 250 ? 'Alto' : stats.totalExec >= 80 ? 'Médio' : 'Baixo';
      }
    }
    dadosJobs.push([jid, papel, jobDesc, execAno, freq, diasUteis, fds, mesesAt, proximas, risco]);
  });

  // ── Aba 2: Top 10 dias de maior risco ───────────────────
  var dadosRisco = [['Data', 'Jobs Executando']];
  var riskMap = _impactoBuildRiskMap(todosJobs);
  var topDias = Object.keys(riskMap).sort(function(a, b) { return riskMap[b] - riskMap[a]; }).slice(0, 10);
  topDias.forEach(function(k) { dadosRisco.push([k, riskMap[k]]); });

  // ── Gera workbook ────────────────────────────────────────
  var wb = XLSX.utils.book_new();

  var ws1 = XLSX.utils.aoa_to_sheet(dadosJobs);
  // Larguras de coluna aproximadas
  ws1['!cols'] = [
    {wch:20}, {wch:14}, {wch:32}, {wch:10}, {wch:20},
    {wch:12}, {wch:14}, {wch:14}, {wch:36}, {wch:10}
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Relatório por Job');

  var ws2 = XLSX.utils.aoa_to_sheet(dadosRisco);
  ws2['!cols'] = [{wch:14}, {wch:18}];
  XLSX.utils.book_append_sheet(wb, ws2, 'Top 10 Risco');

  var fileName = 'impacto_' + jobId + (yr ? '_' + yr : '') + '.xlsx';
  XLSX.writeFile(wb, fileName);
  toast('Excel exportado: ' + todosJobs.length + ' job(s).');
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
var _calFileNames = [];

var MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function calImportar() {
  document.getElementById('calFileInput').click();
}

function calOnFile(evt) {
  var files = evt.target.files;
  if (!files || files.length === 0) return;

  var fileArray = Array.prototype.slice.call(files);
  var total = fileArray.length;
  var parsed = [];    // resultados parciais de cada arquivo
  var names  = [];    // nomes dos arquivos
  var done   = 0;

  function onAllDone() {
    // Merge de todos os resultados parciais em _calData (preserva dados já carregados)
    var merged = { year: (_calData && _calData.year) || null, jobs: {} };
    // Copia jobs já existentes para o merged
    if (_calData) {
      Object.keys(_calData.jobs).forEach(function(jobName) {
        merged.jobs[jobName] = {};
        Object.keys(_calData.jobs[jobName]).forEach(function(mKey) {
          merged.jobs[jobName][mKey] = _calData.jobs[jobName][mKey].slice();
        });
      });
    }
    parsed.forEach(function(r) {
      if (!r) return;
      if (!merged.year) merged.year = r.year;
      Object.keys(r.jobs).forEach(function(jobName) {
        if (!merged.jobs[jobName]) {
          merged.jobs[jobName] = {};
        }
        Object.keys(r.jobs[jobName]).forEach(function(mKey) {
          var incoming = r.jobs[jobName][mKey];
          if (!merged.jobs[jobName][mKey]) {
            merged.jobs[jobName][mKey] = incoming.slice();
          } else {
            for (var i = 0; i < incoming.length; i++) {
              if (incoming[i]) merged.jobs[jobName][mKey][i] = true;
            }
          }
        });
      });
    });

    if (!merged.year || Object.keys(merged.jobs).length === 0) {
      toast('Nenhum arquivo reconhecido como calendário Control-M.', 4000);
      return;
    }

    _calData = merged;

    var preferred = (_calSelectedJob && merged.jobs[_calSelectedJob]) ? _calSelectedJob
      : (currentJob && merged.jobs[currentJob.toUpperCase()]) ? currentJob.toUpperCase()
      : null;
    _calSelectedJob = preferred;

    names.forEach(function(n) { if (_calFileNames.indexOf(n) < 0) _calFileNames.push(n); });

    var lbl = document.getElementById('calFileLabel');
    if (lbl) {
      lbl.textContent = _calFileNames.join(', ') + ' — ' +
        Object.keys(merged.jobs).length + ' jobs / ano ' + merged.year;
    }

    _calSyncJobsToSidebar();
    renderCalendario();
    toast('Calendário importado: ' + Object.keys(merged.jobs).length + ' job(s) em ' + _calFileNames.length + ' arquivo(s).');
    mostrarTab('calendario', document.querySelectorAll('.tab')[2]);
  }

  function readFile(file, idx) {
    names[idx] = file.name;
    var reader = new FileReader();
    reader.onload = function(e) {
      var src = e.target.result;
      var badChars = (src.match(/\ufffd/g) || []).length;
      if (badChars > src.length * 0.05) {
        var r2 = new FileReader();
        r2.onload = function(e2) {
          parsed[idx] = _calParseRaw(e2.target.result);
          done++;
          if (done === total) onAllDone();
        };
        r2.readAsText(file, 'windows-1252');
      } else {
        parsed[idx] = _calParseRaw(src);
        done++;
        if (done === total) onAllDone();
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  fileArray.forEach(function(f, i) { readFile(f, i); });
  evt.target.value = '';
}

// ── Parser Control-M – lógica vertical ───────────────────────────
// Formato esperado (linha a linha):
// Formato HORIZONTAL — uma linha por job, colunas fixas por dia:
//
//  JOBS PLANNED FOR 01 2026
//
//            01  02  03  04  05  ...  31
//            TH  FR  SA  SU  MO  ...  SA
//            ---+---+---+---+---+...+---
//   JOBNAME     | * |   |   | * | ...| * |
//
//  Regras:
//  • "JOBS PLANNED FOR MM YYYY"  → define mês/ano vigente
//  • Linha "01  02  03  ..."     → grava posições de coluna de cada dia
//  • Linha "---+---+---+..."     → marca início da zona de jobs
//  • Linha de job: nome à esq.  → para cada dia, verifica raw.slice(col, col+4).includes('*')
//  • Separador ou novo PLANNED   → reseta zona de jobs
function _calParseRaw(src) {
  var lines = src.split(/\r?\n/);
  var result = { year: null, jobs: {} };

  var MONTH_MAP = {
    'JAN':1,'FEB':2,'MAR':3,'APR':4,'MAY':5,'JUN':6,
    'JUL':7,'AUG':8,'SEP':9,'OCT':10,'NOV':11,'DEC':12,
    'FEV':2,'ABR':4,'MAI':5,'AGO':8,'SET':9,'OUT':10,'DEZ':12
  };

  var currentMonth = null;
  var dayLine      = null;   // [{day, col}, ...] — posições detectadas no cabeçalho
  var inData       = false;  // true após linha separadora ---+---

  for (var i = 0; i < lines.length; i++) {
    var raw     = lines[i];
    var trimmed = raw.trim();

    // ── JOBS PLANNED FOR MM YYYY ──────────────────────────────
    var mPlan = trimmed.match(/JOBS\s+PLANNED\s+FOR\s+(\w+)\s+(\d{4})/i);
    if (mPlan) {
      var mToken = mPlan[1].toUpperCase();
      var yr     = parseInt(mPlan[2], 10);
      if (!result.year) result.year = yr;
      currentMonth = /^\d+$/.test(mToken)
        ? parseInt(mToken, 10)
        : (MONTH_MAP[mToken.slice(0, 3)] || null);
      dayLine = null;
      inData  = false;
      continue;
    }

    if (currentMonth === null) continue;

    // ── Linha de números de dias: "  01  02  03  ..." ─────────
    // Pelo menos 6 números de 1-2 dígitos separados por espaços
    if (!dayLine && /^\s*\d{1,2}(\s+\d{1,2}){5,}/.test(raw)) {
      dayLine = [];
      var dRx = /(\d{1,2})/g;
      var dm;
      while ((dm = dRx.exec(raw)) !== null) {
        dayLine.push({ day: parseInt(dm[1], 10), col: dm.index });
      }
      inData = false;
      continue;
    }

    if (!dayLine) continue;

    // ── Linha de dias da semana → ignorar ─────────────────────
    if (/^\s*(SU|MO|TU|WE|TH|FR|SA)(\s+(SU|MO|TU|WE|TH|FR|SA))+/i.test(trimmed)) continue;

    // ── Linha separadora ---+---+--- → início da zona de jobs ─
    if (/^\s*---/.test(raw)) {
      inData = true;
      continue;
    }

    if (!inData) continue;

    // ── Linha vazia ou só espaços → sem job ───────────────────
    if (!trimmed) continue;

    // ── Linha de job: nome alfanumérico à esquerda ─────────────
    var jm = trimmed.match(/^([A-Z][A-Z0-9_.$@#-]{1,29})/i);
    if (!jm) continue;
    var jobName = jm[1].toUpperCase();

    // Para cada dia, verifica se há '*' na janela de 4 chars
    // a partir da posição de coluna registrada no cabeçalho
    var diasExec = [];
    for (var di = 0; di < dayLine.length; di++) {
      var col  = dayLine[di].col;
      var cell = raw.length > col ? raw.slice(col, col + 4) : '    ';
      diasExec.push(cell.indexOf('*') >= 0);
    }

    if (!result.jobs[jobName]) result.jobs[jobName] = {};
    var mKey = 'M' + (currentMonth < 10 ? '0' : '') + currentMonth;
    if (result.jobs[jobName][mKey]) {
      // Merge: OR entre múltiplas ocorrências do mesmo job no mesmo mês
      for (var oi = 0; oi < diasExec.length; oi++) {
        if (diasExec[oi]) result.jobs[jobName][mKey][oi] = true;
      }
    } else {
      result.jobs[jobName][mKey] = diasExec;
    }
  }

  if (!result.year || Object.keys(result.jobs).length === 0) return null;
  return result;
}

function _calSyncJobsToSidebar() {
  if (!_calData) return;
  var list = document.getElementById('job-list');
  // Remove ícones de calendário anteriores
  list.querySelectorAll('.cal-sidebar-icon').forEach(function(el) { el.remove(); });
  // Adiciona ícone de calendário nos itens que têm dados
  list.querySelectorAll('.job-item[data-jid]').forEach(function(li) {
    var jid = li.getAttribute('data-jid');
    if (jid && _calData.jobs[jid.toUpperCase()]) {
      var ico = document.createElement('span');
      ico.className = 'cal-sidebar-icon';
      ico.title = 'Tem dados de calendário';
      ico.textContent = '\uD83D\uDCC5';
      li.appendChild(ico);
    }
  });
}

// ── Seleciona job no calendário (chamado ao clicar na sidebar) ──
function calSelecionarJob(jid) {
  if (!jid) return;
  var jup = jid.toUpperCase();
  _calSelectedJob = jup;
  var tag = document.getElementById('tagCalendario');
  if (tag) tag.textContent = jup;
  if (_calData) renderCalendario();
}

// ── Render calendário ──────────────────────────────────────
function renderCalendario() {
  var c = document.getElementById('cal-content');
  if (!c) return;

  var tag = document.getElementById('tagCalendario');
  if (tag && _calSelectedJob) tag.textContent = _calSelectedJob;

  if (!_calData) {
    c.innerHTML = '<div class="cal-empty"><div class="cal-empty-icon">\uD83D\uDCC5</div><div>Importe um arquivo de calend\u00E1rio Control-M (.txt)</div></div>';
    return;
  }
  // Job selecionado não tem dados de calendário
  if (_calSelectedJob && !_calData.jobs[_calSelectedJob]) {
    c.innerHTML = '<div class="cal-empty"><div class="cal-empty-icon">\uD83D\uDD0D</div>' +
      '<div>Nenhum dado de calend\u00E1rio para <strong>' + _calSelectedJob + '</strong></div>' +
      '<div style="font-size:11px;color:#aaa;margin-top:6px;">Verifique se o arquivo TXT cont\u00E9m este job.</div></div>';
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
    var todayD = new Date();
    var todayDay   = todayD.getDate();
    var todayMonth = todayD.getMonth() + 1;
    var todayYear  = todayD.getFullYear();

    for (var dd = 1; dd <= daysInM; dd++) {
      var dow     = (firstDow + dd - 1) % 7;
      var isWE    = dow === 0 || dow === 6;
      var executa = diasM.length >= dd ? diasM[dd-1] : false;
      var isToday = (dd === todayDay && m === todayMonth && yr === todayYear);

      var cell = document.createElement('div');
      cell.className = 'cal-day' + (executa ? ' run' : ' norun') + (isWE ? ' weekend' : '') + (isToday ? ' today' : '');
      cell.title = dd + '/' + (m < 10 ? '0' : '') + m + '/' + yr + (executa ? ' — EXECUTA' : ' — nao executa') + (isToday ? ' ◀ HOJE' : '');
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

  var todayT = new Date();
  var todayTDay  = todayT.getDate();
  var todayTMon  = todayT.getMonth() + 1;
  var todayTYear = todayT.getFullYear();

  var thead = document.createElement('thead');
  var hr    = document.createElement('tr');
  var th0   = document.createElement('th');
  th0.className = 'job-col'; th0.textContent = 'Job';
  hr.appendChild(th0);
  for (var dd2 = 1; dd2 <= daysInM; dd2++) {
    var th = document.createElement('th');
    var isHoje = (dd2 === todayTDay && selM === todayTMon && yr === todayTYear);
    th.className = isHoje ? 'today-col' : '';
    th.title = isHoje ? 'Hoje' : '';
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
      var isHojeCell = (d3 === todayTDay && selM === todayTMon && yr === todayTYear);
      if (isHojeCell) td.className = 'today-col';
      td.innerHTML = exec
        ? '<span class="run-cell" title="' + jn + ' executa ' + d3 + '/' + (selM<10?'0':'') + selM + (isHojeCell?' — HOJE':'') + '"></span>'
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
// Suporta dois blocos do relatório Control-M:
//
//   1) JOB FLOW:
//      Cabeçalho fixo:  LVL  MEMBER  DEPEND ON  DESCRIPTION
//      Linhas de job:   NNN  JOBNM   JOBA-JOBB-OK     Descrição do job  [\]
//      Continuação:          (vazio)  JOBC-JOBD-OK                       [\]
//
//   2) CROSS REFERENCE:
//      Cabeçalho:  CONDITION  ODATE  TYPE  OPT  GROUP  MEMBER
//      Linhas:     JOBA-JOBB-OK  ODAT  IN/OUT  [+/-]  GRUPO  MEMBER
//
// Regra IN x OUT no CROSS REFERENCE:
//   ODAT IN  → MEMBER espera a condição  (aresta: produtor → MEMBER)
//   ODAT OUT → MEMBER produz a condição  (aresta: MEMBER → consumidor)
function _fluxoParse(src, filename) {
  var lines  = src.split(/\r?\n/);
  var result = {};           // { groupName: { jobs:{}, edges:[] } }
  var curGroup    = null;
  var curJob      = null;
  var waitCont    = false;   // aguarda linha de continuação (após '\')
  var inCrossRef  = false;   // estamos na seção CROSS REFERENCE

  // Posições de coluna fixas (1-indexed: member=col7/size8, depend=col16/size8, jobname=col25/size28)
  // Convertidas para 0-indexed (JavaScript slice)
  var colMember = 6;   // col 7  (size 8) → slice(6, 14)
  var colDepend = 15;  // col 16 (size 8) → slice(15, 23)
  var colDesc   = 24;  // col 25 (size 28) → slice(24, 52)

  // Mapa de condições para resolver IN/OUT depois
  // condMap[condKey] = { out: [{group,member}], inp: [{group,member}] }
  var condMap = {};

  // Rastreia quais jobs têm DEPEND ON explícito no JOB FLOW
  // (condMap/CROSS REFERENCE só é usado como fallback quando DEPEND ON está ausente)
  // Chave: 'GROUP|MEMBER'
  var hasDepOn = {};

  for (var i = 0; i < lines.length; i++) {
    var raw  = lines[i];
    var line = raw.trim();
    if (!line) continue;

    // ── Detecta seção CROSS REFERENCE ─────────────────
    if (/CROSS\s+REFERENCE/i.test(line)) {
      inCrossRef = true;
      curJob = null; waitCont = false;
      continue;
    }

    // ── Início de GROUP ────────────────────────────────
    if (line.indexOf('BY GROUP') >= 0) {
      var gm = line.match(/BY\s+GROUP\s+([A-Z0-9_\-]+)\s+GROUP/i);
      if (gm) {
        curGroup   = gm[1].toUpperCase();
        inCrossRef = false;
        colMember = 6; colDepend = 15; colDesc = 24;  // reset para posições fixas
        if (!result[curGroup]) result[curGroup] = { jobs: {}, edges: [] };
        curJob = null; waitCont = false;
      }
      continue;
    }

    // ── CROSS REFERENCE: processa linhas de condição ──
    if (inCrossRef) {
      if (/^\s*CONDITION\s+ODATE/i.test(raw)) continue;
      // ex: "SSSS9405-SSSS9512-OK   ODAT   IN      DIARIO   SSSS9512"
      var crRx = /([A-Z][A-Z0-9]{2,14})-([A-Z][A-Z0-9]{2,14})-(OK|CODES|STAT|\d{2})\s+\S+\s+(IN|OUT)\s+/i;
      var crm  = line.match(crRx);
      if (crm) {
        var condKey  = (crm[1] + '-' + crm[2] + '-' + crm[3]).toUpperCase();
        var inout    = crm[4].toUpperCase();
        var cols     = line.split(/\s+/);
        var crMember = cols[cols.length - 1].toUpperCase();
        var crGroup  = cols[cols.length - 2].toUpperCase();
        if (!/^[A-Z][A-Z0-9]{2,14}$/.test(crMember)) continue;
        if (!condMap[condKey]) condMap[condKey] = { out: [], inp: [] };
        if (inout === 'OUT') condMap[condKey].out.push({ group: crGroup, member: crMember });
        else                 condMap[condKey].inp.push({ group: crGroup, member: crMember });
      }
      continue;
    }

    if (!curGroup) continue;

    // ── Linha de cabeçalho "LVL MEMBER DEPEND ON..." → ignorar (colunas são fixas) ──
    if (/^\s*LVL\s+MEMBER/i.test(raw)) {
      curJob = null; waitCont = false;
      continue;
    }

    // ── Linha de continuação (após '\') ───────────────
    // Contém apenas mais condições na coluna DEPEND ON
    if (waitCont) {
      var depArea = raw.slice(colDepend, colDesc > colDepend ? colDesc : raw.length);
      _fluxoExtractDeps(depArea, curJob, result[curGroup]);
      waitCont = raw.trimEnd().slice(-1) === '\\';
      continue;
    }

    // A partir daqui: tenta identificar linha de job no JOB FLOW
    // ─────────────────────────────────────────────────────────────
    // Estratégia A: usa posições de coluna do cabeçalho (preferida)
    if (colMember >= 0) {
      // LVL: texto antes da coluna MEMBER
      var lvlStr = raw.slice(0, colMember).trim();
      var lvlNum = parseInt(lvlStr, 10);
      if (isNaN(lvlNum)) continue;

      // MEMBER: coluna MEMBER até DEPEND ON (ou DESCRIPTION se não há DEPEND ON)
      var memberEnd = colDepend > colMember ? colDepend
                    : colDesc  > colMember ? colDesc
                    : raw.length;
      var member = raw.slice(colMember, memberEnd).trim().toUpperCase();
      if (!member || !/^[A-Z][A-Z0-9]{1,29}$/.test(member)) continue;

      // DEPEND ON: de colDepend até colDesc (remove '\' do final)
      var dependStr = '';
      if (colDepend >= 0 && colDepend < raw.length) {
        var depEnd = colDesc > colDepend ? colDesc : raw.length;
        dependStr = raw.slice(colDepend, depEnd).replace(/\\\s*$/, '').trim();
      }

      // DESCRIPTION: col 25, tamanho 28 → slice(24, 52)
      var desc = (colDesc < raw.length) ? raw.slice(colDesc, colDesc + 28).trim() : '';

    } else {
      // Estratégia B: regex simples  LVL MEMBER  (restante é DEPEND ON + DESCRIPTION)
      var jrx = /^(\d{1,3})\s+([A-Z][A-Z0-9]{2,29})\s+(.*)/i;
      var jm  = line.match(jrx);
      if (!jm) continue;
      var lvlNum   = parseInt(jm[1], 10);
      var member   = jm[2].toUpperCase();
      // Separa condições (FROM-TO-OK) da descrição textual
      var rest     = jm[3];
      var depEnd2  = rest.search(/[^A-Z0-9\-\s\\]/i);
      var dependStr = depEnd2 >= 0 ? rest.slice(0, depEnd2).trim() : rest.trim();
      var desc      = depEnd2 >= 0 ? rest.slice(depEnd2).trim() : '';
    }

    // ── Classifica tipo do nó ──────────────────────────
    var nodeType    = 'NORMAL';
    var generatedBy = null;
    var descUp      = desc.toUpperCase();

    if (/^PLAN/i.test(member)) {
      nodeType = 'GERADOR';
    } else if (
      descUp.indexOf('PLAN') >= 0 &&
      (descUp.indexOf('GERADO') >= 0 || descUp.indexOf('CRIADO') >= 0 ||
       descUp.indexOf('P/PLAN') >= 0 || descUp.indexOf('PELO PLAN') >= 0)
    ) {
      nodeType = 'GERADO';
      var planM = desc.match(/PLAN\w*/i);
      generatedBy = planM ? planM[0].toUpperCase() : null;
    }

    curJob = {
      id         : member,
      label      : desc || member,
      group      : curGroup,
      level      : lvlNum,
      calendar   : '-',
      type       : nodeType,
      generatedBy: generatedBy
    };

    if (!result[curGroup].jobs[member]) {
      result[curGroup].jobs[member] = curJob;
    }

    if (generatedBy && nodeType === 'GERADO') {
      _fluxoAddEdge(result[curGroup], generatedBy, member, 'gera', true, 'generation');
    }

    // Extrai dependências da string DEPEND ON e verifica continuação
    if (dependStr) {
      _fluxoExtractDeps(dependStr, curJob, result[curGroup]);
      hasDepOn[curGroup + '|' + member] = true;  // tem DEPEND ON explícito
    }
    waitCont = raw.trimEnd().slice(-1) === '\\';
  }

  // ── Resolve arestas IN/OUT do CROSS REFERENCE ────────
  // Para cada condição: quem faz OUT libera quem faz IN
  Object.keys(condMap).forEach(function(condKey) {
    var cond = condMap[condKey];
    cond.out.forEach(function(producer) {
      cond.inp.forEach(function(consumer) {
        // Encontra o grupo certo para cada membro
        var prodGroup  = producer.group;
        var consGroup  = consumer.group;
        // CONDITION (CROSS REFERENCE) só como fallback:
        // se o consumidor já tem DEPEND ON explícito no JOB FLOW, ignora
        if (hasDepOn[consGroup + '|' + consumer.member]) return;
        // Se o grupo existe no resultado, adiciona a aresta lá
        var targetGroup = result[consGroup] || result[prodGroup] || result[Object.keys(result)[0]];
        if (!targetGroup) return;
        // Garante que os jobs existam (pode ser referência a job de outro grupo)
        _fluxoAddEdge(targetGroup, producer.member, consumer.member,
          condKey.split('-')[2] || 'OK', false, 'dependency');
      });
    });
    // Se tem só IN sem OUT correspondente: dependência externa (cria nó-fantôma)
    // Também só como fallback: ignora se consumidor tem DEPEND ON explícito
    if (cond.out.length === 0 && cond.inp.length > 0) {
      var parts    = condKey.split('-');
      var extFrom  = parts[0];
      var extTo    = parts[1] || '';
      cond.inp.forEach(function(consumer) {
        if (hasDepOn[consumer.group + '|' + consumer.member]) return;
        var tg = result[consumer.group] || result[Object.keys(result)[0]];
        if (!tg) return;
        if (!tg.jobs[extFrom]) {
          tg.jobs[extFrom] = { id: extFrom, label: 'Externo', group: consumer.group, level: 0, calendar: '-', type: 'NORMAL', generatedBy: null };
        }
        _fluxoAddEdge(tg, extFrom, consumer.member, parts[2] || 'OK', false, 'dependency');
      });
    }
  });

  if (Object.keys(result).length === 0) {
    toast('Arquivo não reconhecido como Control-M Job Flow Report.', 4000);
    return;
  }

  // ── Acumula (merge) no _fluxoData existente ──────────────
  if (!_fluxoData) _fluxoData = {};
  Object.keys(result).forEach(function(g) {
    if (_fluxoData[g]) {
      // Merge jobs (job existente não é sobrescrito)
      Object.keys(result[g].jobs).forEach(function(jid) {
        if (!_fluxoData[g].jobs[jid]) _fluxoData[g].jobs[jid] = result[g].jobs[jid];
      });
      // Merge edges sem duplicar
      result[g].edges.forEach(function(e) {
        _fluxoAddEdge(_fluxoData[g], e.from, e.to, e.status, e.dashed, e.edgeType);
      });
    } else {
      _fluxoData[g] = result[g];
    }
    // Adiciona ao filtro de grupos selecionados se ainda não estiver
    if (_fluxoSelectedGroups.indexOf(g) < 0) _fluxoSelectedGroups.push(g);
  });

  // Registra a fonte (arquivo importado)
  _fluxoSources.push({ filename: filename, groups: Object.keys(result) });

  // Atualiza UI
  _fluxoRenderGroupFilter();
  _fluxoSyncJobsToSidebar();
  _fluxoMostrarControles(true);

  var totalJobs = Object.keys(_fluxoData).reduce(function(acc, g) {
    return acc + Object.keys(_fluxoData[g].jobs).length;
  }, 0);
  _fluxoAtualizarLabel();

  mostrarTab('fluxo', document.querySelectorAll('.tab')[1]);
  var novosJobs = Object.keys(result).reduce(function(acc, g) { return acc + Object.keys(result[g].jobs).length; }, 0);
  toast('Importado: ' + novosJobs + ' jobs de ' + Object.keys(result).length + ' grupo(s) — Total: ' + totalJobs + ' jobs.', 4000);
}

// Adiciona aresta sem duplicar
function _fluxoAddEdge(groupData, from, to, status, dashed, edgeType) {
  var key = from + '->' + to;
  var dup = groupData.edges.some(function(e) { return e.from + '->' + e.to === key; });
  if (!dup) {
    groupData.edges.push({ from: from, to: to, status: status, dashed: !!dashed, edgeType: edgeType || 'dependency' });
  }
}

// ── Atualiza o label de arquivos importados ──────────────
function _fluxoAtualizarLabel() {
  var lbl = document.getElementById('fluxoFileLabel');
  if (!lbl) return;
  lbl.innerHTML = '';
  _fluxoSources.forEach(function(src) {
    var span = document.createElement('span');
    span.className = 'fluxo-source-chip';
    span.title = src.groups.join(', ');
    span.textContent = src.filename;
    var btn = document.createElement('button');
    btn.className = 'fluxo-source-remove';
    btn.title = 'Remover ' + src.filename;
    btn.textContent = '\u00D7';
    btn.onclick = (function(fname) {
      return function(e) { e.stopPropagation(); _fluxoRemoveSource(fname); };
    })(src.filename);
    span.appendChild(btn);
    lbl.appendChild(span);
  });
}

// ── Remove um arquivo importado do fluxo ─────────────────
function _fluxoRemoveSource(filename) {
  var src = _fluxoSources.find(function(s) { return s.filename === filename; });
  if (!src) return;

  // Remove grupos que pertencem SOMENTE a este arquivo
  src.groups.forEach(function(g) {
    var usedByOther = _fluxoSources.some(function(s) {
      return s.filename !== filename && s.groups.indexOf(g) >= 0;
    });
    if (!usedByOther) {
      delete _fluxoData[g];
      _fluxoSelectedGroups = _fluxoSelectedGroups.filter(function(x) { return x !== g; });
    }
  });

  _fluxoSources = _fluxoSources.filter(function(s) { return s.filename !== filename; });

  if (Object.keys(_fluxoData).length === 0) {
    _fluxoData = null;
    _fluxoMostrarControles(false);
  }

  if (cy) { cy.destroy(); cy = null; }
  _fluxoRenderGroupFilter();
  _fluxoSyncJobsToSidebar();
  _fluxoAtualizarLabel();

  if (_fluxoData) {
    renderFluxoFromParsed();
    toast('Arquivo "' + filename + '" removido.', 3000);
  } else {
    toast('Todos os arquivos removidos.', 3000);
  }
}


// Aceita também padrão inverso (FROM = job atual) para robustez.
function _fluxoExtractDeps(line, job, groupData) {
  if (!job) return;
  // Nomes Control-M: até 14 chars alfanuméricos, começa com letra
  var depRx = /([A-Z][A-Z0-9]{2,14})-([A-Z][A-Z0-9]{2,14})-(OK|CODES|STAT|\d{2})/gi;
  var m;
  while ((m = depRx.exec(line)) !== null) {
    var from   = m[1].toUpperCase();
    var to     = m[2].toUpperCase();
    var status = m[3].toUpperCase();
    // Em linhas de continuação do JOB FLOW, TO deve ser o job atual
    // Aceita também se FROM é o job atual (menos comum, mas seguro)
    if (to !== job.id && from !== job.id) continue;
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

  // Agrupa por arquivo importado
  var addedJobs = {};
  _fluxoSources.forEach(function(src) {
    // Cabeçalho do arquivo
    var divHdr = document.createElement('li');
    divHdr.className = 'fluxo-sidebar-divider';
    divHdr.textContent = '\uD83D\uDCC2 ' + src.filename;
    divHdr.setAttribute('data-source', src.filename);
    list.appendChild(divHdr);

    // Jobs de cada grupo deste arquivo (ordenados)
    src.groups.forEach(function(gn) {
      var gd = _fluxoData[gn];
      if (!gd) return;
      Object.keys(gd.jobs).sort().forEach(function(jid) {
        var job = gd.jobs[jid];
        var li = document.createElement('li');
        li.className = 'job-item fluxo-imported-item';
        li.setAttribute('data-jid', jid);
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
        addedJobs[jid] = true;
      });
    });
  });

  // Jobs de grupos não rastreados em _fluxoSources (segurança)
  Object.keys(_fluxoData).forEach(function(gn) {
    var orphanSrc = _fluxoSources.some(function(s) { return s.groups.indexOf(gn) >= 0; });
    if (orphanSrc) return;
    var gd = _fluxoData[gn];
    Object.keys(gd.jobs).sort().forEach(function(jid) {
      if (addedJobs[jid]) return;
      addedJobs[jid] = true;
      var job = gd.jobs[jid];
      var li = document.createElement('li');
      li.className = 'job-item fluxo-imported-item';
      li.setAttribute('data-jid', jid);
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

  // Atualiza calendário com o job selecionado
  calSelecionarJob(jid);
  currentJob = jid;

  // Garante que estamos na aba Fluxo em modo grafo
  _fluxoViewMode = 'graph';
  var cyC = document.getElementById('cy-container');
  var lv  = document.getElementById('fluxoListaView');
  var btn = document.getElementById('fluxoListaBtn');
  if (cyC) cyC.style.display = '';
  if (lv)  { lv.style.display = 'none'; lv.innerHTML = ''; }
  if (btn) btn.textContent = '\uD83D\uDCCB Ver Lista';

  mostrarTab('fluxo', document.querySelectorAll('.tab')[1]);

  setTimeout(function() { _fluxoRenderJobFlow(jid); }, 80);
}

// ── Grafo de fluxo de um job específico ─────────────────
// Mostra: predecessores → job central → sucessores
function _fluxoRenderJobFlow(jid) {
  if (!_fluxoData) return;
  var container = document.getElementById('cy');
  if (!container) return;
  if (cy) { cy.destroy(); cy = null; }
  _fluxoFecharPainel();

  // Coleta job e suas arestas de todos os grupos
  var centralJob = null;
  var allEdges   = [];
  var allJobs    = {};

  Object.keys(_fluxoData).forEach(function(gn) {
    var gd = _fluxoData[gn];
    Object.keys(gd.jobs).forEach(function(id) { allJobs[id] = gd.jobs[id]; });
    gd.edges.forEach(function(e) { allEdges.push(e); });
  });
  centralJob = allJobs[jid];
  if (!centralJob) return;

  // Jobs relevantes: o próprio + predecessores diretos + sucessores diretos
  var relevantIds = {};
  relevantIds[jid] = true;
  allEdges.forEach(function(e) {
    if (e.to   === jid) relevantIds[e.from] = true;
    if (e.from === jid) relevantIds[e.to]   = true;
  });

  var TYPE_COLOR = {
    NORMAL  : { bg: '#3a6fc8', border: '#2d59a8', shape: 'round-rectangle' },
    GERADOR : { bg: '#d4910a', border: '#b07000', shape: 'star' },
    GERADO  : { bg: '#7e3fb0', border: '#5c2d8a', shape: 'ellipse' }
  };

  var elements = [];

  // Nós
  Object.keys(relevantIds).forEach(function(id) {
    var job  = allJobs[id];
    var type = (job && job.type) || 'NORMAL';
    var col  = TYPE_COLOR[type] || TYPE_COLOR.NORMAL;
    var isCentral = (id === jid);
    var lbl  = id + (job && job.label ? '\n' + job.label.substring(0, 30) + (job.label.length > 30 ? '…' : '') : '');
    elements.push({
      data: {
        id        : id,
        label     : lbl,
        tipo      : type,
        bg        : isCentral ? '#fff' : col.bg,
        border    : isCentral ? col.bg : col.border,
        textColor : isCentral ? col.bg : '#fff',
        borderW   : isCentral ? 4 : 1.5,
        shape     : col.shape,
        jobLabel  : job ? (job.label || '') : '',
        calendar  : job ? (job.calendar || '') : ''
      }
    });
  });

  // Arestas relevantes
  allEdges.forEach(function(e) {
    if (!relevantIds[e.from] || !relevantIds[e.to]) return;
    elements.push({
      data: {
        source  : e.from,
        target  : e.to,
        status  : e.status,
        dashed  : e.dashed,
        edgeType: e.edgeType
      },
      classes: e.edgeType === 'generation' ? 'gen-edge' : 'dep-edge'
    });
  });

  cy = cytoscape({
    container: container,
    elements : elements,
    style: [
      {
        selector: 'node',
        style: {
          'shape'           : 'data(shape)',
          'label'           : 'data(label)',
          'text-valign'     : 'center',
          'text-halign'     : 'center',
          'color'           : 'data(textColor)',
          'font-size'       : '11px',
          'font-weight'     : '700',
          'font-family'     : 'Segoe UI, Arial, sans-serif',
          'background-color': 'data(bg)',
          'border-color'    : 'data(border)',
          'border-width'    : 'data(borderW)',
          'width'           : 'label',
          'height'          : 40,
          'padding'         : '12px',
          'text-wrap'       : 'wrap',
          'text-max-width'  : '140px'
        }
      },
      {
        selector: 'node[tipo = "NORMAL"]',
        style: { 'shape': 'round-rectangle' }
      },
      {
        selector: 'node[tipo = "GERADOR"]',
        style: { 'shape': 'star', 'height': 50, 'width': 50 }
      },
      {
        selector: 'node[tipo = "GERADO"]',
        style: { 'shape': 'ellipse', 'border-style': 'dashed' }
      },
      {
        selector: '.dep-edge',
        style: {
          'width': 2, 'line-color': '#3a6fc8', 'target-arrow-color': '#3a6fc8',
          'target-arrow-shape': 'triangle', 'curve-style': 'bezier',
          'label': 'data(status)', 'font-size': '9px', 'color': '#3a6fc8',
          'text-background-color': '#fff', 'text-background-opacity': 1, 'text-background-padding': '2px'
        }
      },
      {
        selector: '.gen-edge',
        style: {
          'width': 2, 'line-color': '#d4910a', 'target-arrow-color': '#d4910a',
          'target-arrow-shape': 'triangle', 'curve-style': 'bezier',
          'line-style': 'dashed', 'label': 'gera',
          'font-size': '9px', 'color': '#d4910a',
          'text-background-color': '#fff', 'text-background-opacity': 1, 'text-background-padding': '2px'
        }
      }
    ],
    layout: { name: 'dagre', rankDir: 'LR', nodeSep: 50, rankSep: 80, padding: 30 },
    minZoom: 0.2, maxZoom: 3, wheelSensitivity: 0.3
  });

  cy.on('tap', 'node', function(evt) {
    var id   = evt.target.id();
    var data = evt.target.data();
    // Se clicar em nó vizinho, navega; se clicar no central, abre painel
    _fluxoAbrirPainelJob(Object.assign({ id: id }, data));
    if (id !== jid) _fluxoSelecionarJobSidebar(id, null);
  });
  cy.fit(undefined, 30);

  // Atualiza título
  var tag = document.getElementById('tagFluxo');
  if (tag) tag.textContent = jid;
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
  _fluxoSources        = [];
  _planCollapsed       = {};
  _fluxoViewMode       = 'graph';
  var lbl = document.getElementById('fluxoFileLabel');
  if (lbl) lbl.innerHTML = '';
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
  _fluxoAbrirPainelJob(data);
}

// ── Painel lateral de detalhes do job ────────────────────
function _fluxoAbrirPainelJob(data) {
  var panel = document.getElementById('job-detail-panel');
  var title = document.getElementById('job-detail-title');
  var body  = document.getElementById('job-detail-body');
  if (!panel || !body) return;

  title.textContent = data.id || 'Job';
  body.innerHTML = '';

  function row(label, val) {
    var d   = document.createElement('div');
    d.className = 'jdp-row';
    var lbl = document.createElement('div');
    lbl.className = 'jdp-label';
    lbl.textContent = label;
    var v   = document.createElement('div');
    v.className = 'jdp-value';
    v.innerHTML = val || '\u2014';
    d.appendChild(lbl);
    d.appendChild(v);
    return d;
  }
  function sep() {
    var hr = document.createElement('hr');
    hr.className = 'jdp-sep';
    return hr;
  }

  // Tipo (badge colorido)
  var badgeDiv = document.createElement('div');
  badgeDiv.className = 'jdp-row';
  var badgeLbl = document.createElement('div'); badgeLbl.className = 'jdp-label'; badgeLbl.textContent = 'Tipo';
  var badge = document.createElement('span');
  badge.className = 'jdp-badge ' + (data.nodeType || 'NORMAL');
  badge.textContent = data.nodeType || 'NORMAL';
  badgeDiv.appendChild(badgeLbl); badgeDiv.appendChild(badge);
  body.appendChild(badgeDiv);

  body.appendChild(row('Descrição', data.jobLabel));
  body.appendChild(row('Grupo', data.grp));
  body.appendChild(row('Nível', data.level !== undefined ? data.level : '\u2014'));
  body.appendChild(row('Calendário', data.calendar && data.calendar !== '-' ? data.calendar : '\u2014'));
  if (data.generatedBy) body.appendChild(row('Gerado por', data.generatedBy));

  // ── Predecessores e Sucessores ──
  if (_fluxoData) {
    var allPreds = [], allSuccs = [];
    Object.keys(_fluxoData).forEach(function(gn) {
      (_fluxoData[gn].edges || []).forEach(function(e) {
        if (e.to   === data.id) allPreds.push({ id: e.from, status: e.status });
        if (e.from === data.id) allSuccs.push({ id: e.to,   status: e.status });
      });
    });

    body.appendChild(sep());

    // Predecessores
    var predDiv = document.createElement('div'); predDiv.className = 'jdp-row';
    var predLbl = document.createElement('div'); predLbl.className = 'jdp-label'; predLbl.textContent = '\u2190 Depende de (' + allPreds.length + ')';
    predDiv.appendChild(predLbl);
    if (allPreds.length === 0) {
      var n = document.createElement('span'); n.className = 'jdp-chip-none'; n.textContent = 'início do fluxo';
      predDiv.appendChild(n);
    } else {
      allPreds.forEach(function(p) {
        var c = document.createElement('span'); c.className = 'jdp-chip';
        c.textContent = p.id + (p.status ? ' ' + p.status : '');
        c.title = 'Ir para ' + p.id;
        c.onclick = (function(pid) { return function() { _fluxoSelecionarJobSidebar(pid, null); }; })(p.id);
        predDiv.appendChild(c);
      });
    }
    body.appendChild(predDiv);

    // Sucessores
    var succDiv = document.createElement('div'); succDiv.className = 'jdp-row';
    var succLbl = document.createElement('div'); succLbl.className = 'jdp-label'; succLbl.textContent = '\u2192 Dispara (' + allSuccs.length + ')';
    succDiv.appendChild(succLbl);
    if (allSuccs.length === 0) {
      var n2 = document.createElement('span'); n2.className = 'jdp-chip-none'; n2.textContent = 'fim do fluxo';
      succDiv.appendChild(n2);
    } else {
      allSuccs.forEach(function(s) {
        var c = document.createElement('span'); c.className = 'jdp-chip';
        c.textContent = s.id + (s.status ? ' ' + s.status : '');
        c.title = 'Ir para ' + s.id;
        c.onclick = (function(sid) { return function() { _fluxoSelecionarJobSidebar(sid, null); }; })(s.id);
        succDiv.appendChild(c);
      });
    }
    body.appendChild(succDiv);
  }

  // ── Mini-calendário do job ──
  if (_calData && _calData.jobs) {
    var jup = (data.id || '').toUpperCase();
    var jobCal = _calData.jobs[jup];
    if (jobCal) {
      body.appendChild(sep());
      var calDiv = document.createElement('div'); calDiv.className = 'jdp-row';
      var calLbl = document.createElement('div'); calLbl.className = 'jdp-label'; calLbl.textContent = '\uD83D\uDCC5 Calendário ' + (_calData.year || '');
      calDiv.appendChild(calLbl);
      var yr = _calData.year;
      for (var m = 1; m <= 12; m++) {
        var mKey  = 'M' + (m < 10 ? '0' : '') + m;
        var dias  = jobCal[mKey];
        if (!dias || !dias.length) continue;
        var dInM  = new Date(yr, m, 0).getDate();
        var fDow  = new Date(yr, m-1, 1).getDay();
        var hasRun = dias.some(function(d) { return d; });
        if (!hasRun) continue;
        var mhdr = document.createElement('div'); mhdr.className = 'jdp-cal-month-hdr';
        mhdr.textContent = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][m-1];
        calDiv.appendChild(mhdr);
        var row2 = document.createElement('div'); row2.style.cssText = 'display:flex;flex-wrap:wrap;';
        for (var dd = 1; dd <= dInM; dd++) {
          var dow  = (fDow + dd - 1) % 7;
          var isWE = dow === 0 || dow === 6;
          var exec = dias[dd-1];
          var cell = document.createElement('span');
          cell.className = 'jdp-cal-day ' + (exec ? 'run' : 'norun') + (isWE ? ' we' : '');
          cell.textContent = dd;
          cell.title = dd + '/' + m + (exec ? ' — EXECUTA' : '');
          row2.appendChild(cell);
        }
        calDiv.appendChild(row2);
      }
      body.appendChild(calDiv);
    }
  }

  panel.classList.add('open');
}

function _fluxoFecharPainel() {
  var panel = document.getElementById('job-detail-panel');
  if (panel) panel.classList.remove('open');
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
