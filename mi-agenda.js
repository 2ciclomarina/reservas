/* =====================================================================
   mi-agenda.js  -  Planificador Institucional (Colegio Marina de Chile)
   1) "Mi Agenda": reservas e insumos del docente (hoy y semana)
   2) Diseño para celular: un día a la vez, barra inferior y tarjetas
   ===================================================================== */
(function () {
  'use strict';
  if (window.__miAgendaCargada) return;
  window.__miAgendaCargada = true;

  var DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  var DIAS_CORTO = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  var tabAgenda = 'hoy';
  var diaMovil = 1; // 1 = lunes ... 5 = viernes
  (function () { var d = new Date().getDay(); if (d >= 1 && d <= 5) diaMovil = d; })();

  // ---------------------------------------------------------------- utilidades
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(d) { return window.formatInputDate(d); }
  function ahoraMin() { var n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

  function lunesDeSemana() {
    var t = new Date();
    var d = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    var dw = d.getDay();
    if (dw === 0) d.setDate(d.getDate() + 1);        // domingo -> próxima semana
    else if (dw === 6) d.setDate(d.getDate() + 2);   // sábado  -> próxima semana
    else d.setDate(d.getDate() - (dw - 1));
    return d;
  }

  // ---------------------------------------------------------------- datos
  function misActividades() {
    var u = window.userName, out = [];
    var todas = window.actividadesProgramadas || {};
    for (var k in todas) {
      var a = todas[k];
      if (!a || a.isBase) continue;
      if (a.docente !== u && a.creador !== u) continue;
      out.push(a);
    }
    return out;
  }

  function horas(g) {
    var f = g.first, l = g.last, ini = null, fin = null, mod = '';
    if (f.horaInicio && f.horaFin) {
      ini = f.horaInicio; fin = f.horaFin;
    } else {
      var arr = window.getArrayBloques(f.jornada) || [];
      var b1 = arr[parseInt(f.bloque)], b2 = arr[parseInt(l.bloque)];
      if (b1 && b2) { ini = b1.time.split(' - ')[0]; fin = b2.time.split(' - ')[1]; mod = (b1 === b2) ? b1.title : (b1.title + ' a ' + b2.title); }
    }
    if (!ini) return { txt: 'Módulo ' + (parseInt(f.bloque) + 1), ini: 0, fin: null, mod: '' };
    return { txt: ini + ' - ' + fin, ini: window.horaAMin(ini), fin: window.horaAMin(fin), mod: mod };
  }

  // Une los bloques consecutivos de una misma reserva en un solo elemento
  function agrupar(acts) {
    var m = {};
    acts.forEach(function (a) {
      var key = (a.idGrupo || a.id) + '|' + a.fecha + '|' + a.curso + '|' + a.lugar;
      (m[key] = m[key] || []).push(a);
    });
    var res = Object.keys(m).map(function (k) {
      var list = m[k].sort(function (x, y) { return parseInt(x.bloque) - parseInt(y.bloque); });
      var g = { list: list, first: list[0], last: list[list.length - 1], fecha: list[0].fecha, solo: list[0].lugar === 'Solo Recursos' };
      g.horas = horas(g);
      return g;
    });
    res.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.horas.ini - b.horas.ini; });
    return res;
  }

  function insumosDe(grupos) {
    var out = [];
    grupos.forEach(function (g) {
      var src = g.list.find(function (a) { return a.recursos && a.recursos.length; });
      if (!src) return;
      src.recursos.forEach(function (r) { out.push({ r: r, g: g, a: g.first, fecha: g.fecha, ini: g.horas.ini }); });
    });
    out.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.ini - b.ini; });
    return out;
  }

  // ---------------------------------------------------------------- piezas visuales
  function pill(txt, cls) { return '<span class="px-2 py-0.5 rounded-full text-[11px] font-bold border ' + cls + '">' + txt + '</span>'; }

  function badgeEstado(est) {
    if (est === 'espera') return pill('En espera', 'bg-amber-100 text-amber-800 border-amber-300');
    if (est === 'anulacion_solicitada') return pill('Anulación solicitada', 'bg-red-100 text-red-700 border-red-300');
    return pill('Confirmada', 'bg-emerald-100 text-emerald-700 border-emerald-300');
  }
  function badgeRecurso(est) {
    if (est === 'espera') return pill('Lista de espera', 'bg-rose-100 text-rose-700 border-rose-300');
    if (est === 'ok') return pill('Aprobado', 'bg-emerald-100 text-emerald-700 border-emerald-300');
    if (est === 'prestado') return pill('En uso', 'bg-blue-100 text-blue-700 border-blue-300');
    if (est === 'devuelto') return pill('Devuelto', 'bg-slate-100 text-slate-600 border-slate-300');
    return pill('Pendiente', 'bg-amber-100 text-amber-800 border-amber-300');
  }

  function itemEspacio(g, hoyStr) {
    var a = g.first, h = g.horas;
    var ed = (window.nombresEdificios || {})[window.getEdificioDeActividad(a)] || '';
    var hoy = g.fecha === hoyStr, n = ahoraMin();
    var terminada = hoy && h.fin != null && n >= h.fin;
    var enCurso = hoy && h.fin != null && n >= h.ini && n < h.fin;
    var otro = (a.docente && a.docente !== window.userName) ? '<p class="text-xs text-slate-500 mt-0.5"><i class="fas fa-user mr-1"></i>Responsable: ' + esc(a.docente) + '</p>' : '';
    return '<button type="button" onclick="window.miAgendaVer(\'' + esc(a.id) + '\')" class="w-full text-left rounded-xl border p-3 shadow-sm ' +
      (terminada ? 'bg-slate-50 border-slate-200 opacity-70' : 'bg-white border-indigo-200 active:bg-indigo-50') + '">' +
      '<div class="flex items-center justify-between gap-2 mb-1">' +
        '<span class="text-sm font-black text-indigo-700"><i class="far fa-clock mr-1"></i>' + esc(h.txt) + '</span>' +
        '<span class="flex items-center gap-1 flex-wrap justify-end">' +
          (enCurso ? pill('En curso', 'bg-indigo-600 text-white border-indigo-700') : '') +
          (terminada ? pill('Finalizada', 'bg-slate-100 text-slate-500 border-slate-300') : '') +
          badgeEstado(a.estado) +
        '</span>' +
      '</div>' +
      '<p class="font-bold text-slate-800 text-sm leading-tight">' + esc(a.nombre) + '</p>' +
      '<p class="text-xs text-slate-600 mt-0.5">' + esc(a.curso) + ' · ' + esc(a.asignatura) + (h.mod ? ' · ' + esc(h.mod) : '') + '</p>' +
      '<p class="text-xs text-slate-600 mt-0.5"><i class="fas fa-map-marker-alt text-red-400 mr-1"></i>' + esc(a.lugar) + (ed ? ' · ' + esc(ed) : '') + '</p>' +
      otro +
    '</button>';
  }

  function itemInsumo(e) {
    var a = e.a, r = e.r;
    var icon = window.getIconoRecurso ? window.getIconoRecurso(r.nombre) : 'fa-box';
    var lugar = a.lugar === 'Solo Recursos' ? 'Sin sala' : a.lugar;
    return '<button type="button" onclick="window.miAgendaVer(\'' + esc(a.id) + '\')" class="w-full text-left rounded-xl border border-teal-200 bg-teal-50 p-3 shadow-sm active:bg-teal-100">' +
      '<div class="flex items-start justify-between gap-2">' +
        '<span class="font-bold text-teal-900 text-sm leading-tight"><i class="fas ' + icon + ' mr-1 text-teal-600"></i>' + esc(r.cantidad) + 'x ' + esc(r.nombre) + '</span>' +
        badgeRecurso(r.estado) +
      '</div>' +
      '<p class="text-xs text-slate-600 mt-1"><i class="far fa-clock mr-1"></i>' + esc(e.g.horas.txt) + ' · ' + esc(a.curso) + ' · ' + esc(lugar) + '</p>' +
      '<p class="text-xs text-slate-500 mt-0.5">' + esc(a.nombre) + '</p>' +
    '</button>';
  }

  function seccion(titulo, icono, color, n, cuerpo, vacio) {
    return '<section class="mb-5">' +
      '<h3 class="flex items-center gap-2 text-sm font-black text-' + color + '-900 mb-2 pb-1 border-b border-' + color + '-100">' +
        '<i class="fas ' + icono + ' text-' + color + '-500"></i> ' + titulo +
        '<span class="ml-auto text-xs bg-' + color + '-100 text-' + color + '-700 rounded-full px-2 py-0.5">' + n + '</span>' +
      '</h3>' +
      (n ? cuerpo : '<p class="text-xs text-slate-400 italic bg-slate-50 rounded-lg p-3 text-center">' + vacio + '</p>') +
    '</section>';
  }

  function listaPlana(items, fn, hoyStr) {
    return '<div class="space-y-2">' + items.map(function (x) { return fn(x, hoyStr); }).join('') + '</div>';
  }

  function listaPorDia(items, fn, dias5, hoyStr) {
    var html = '';
    dias5.forEach(function (d) {
      var ds = fmt(d);
      var its = items.filter(function (x) { return x.fecha === ds; });
      if (!its.length) return;
      html += '<div class="mb-3"><p class="text-xs font-black uppercase tracking-wide mb-1.5 ' + (ds === hoyStr ? 'text-amber-600' : 'text-slate-500') + '">' +
        DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()] + (ds === hoyStr ? ' · HOY' : '') + '</p>' +
        '<div class="space-y-2">' + its.map(function (x) { return fn(x, hoyStr); }).join('') + '</div></div>';
    });
    return html;
  }

  // ---------------------------------------------------------------- Mi Agenda
  function render() {
    var cont = document.getElementById('miAgendaContenido');
    if (!cont) return;
    var hoy = new Date(), hoyStr = fmt(hoy), dw = hoy.getDay(), finde = (dw === 0 || dw === 6);
    var lunes = lunesDeSemana();
    var dias5 = [0, 1, 2, 3, 4].map(function (i) { var d = new Date(lunes); d.setDate(d.getDate() + i); return d; });
    var fechasSem = {}; dias5.forEach(function (d) { fechasSem[fmt(d)] = true; });

    var grupos = agrupar(misActividades());
    var gHoy = grupos.filter(function (g) { return g.fecha === hoyStr; });
    var gSem = grupos.filter(function (g) { return fechasSem[g.fecha]; });

    var nombre = document.getElementById('miAgendaNombre');
    if (nombre) nombre.textContent = window.userName || '';
    var fechaTxt = document.getElementById('miAgendaFecha');
    if (fechaTxt) fechaTxt.textContent = 'Hoy: ' + DIAS[dw] + ' ' + hoy.getDate() + ' de ' + MESES[hoy.getMonth()];

    var tHoy = document.getElementById('tabAgHoy'), tSem = document.getElementById('tabAgSem');
    var on = 'bg-indigo-600 text-white border-indigo-700 shadow', off = 'bg-white text-slate-600 border-slate-200';
    if (tHoy) { tHoy.className = 'py-2.5 rounded-xl border text-sm font-black ' + (tabAgenda === 'hoy' ? on : off); tHoy.innerHTML = 'Hoy <span class="ml-1 text-xs opacity-80">(' + gHoy.length + ')</span>'; }
    if (tSem) { tSem.className = 'py-2.5 rounded-xl border text-sm font-black ' + (tabAgenda === 'semana' ? on : off); tSem.innerHTML = (finde ? 'Próxima semana' : 'Esta semana') + ' <span class="ml-1 text-xs opacity-80">(' + gSem.length + ')</span>'; }

    var html = '';
    if (tabAgenda === 'hoy') {
      var esp = gHoy.filter(function (g) { return !g.solo; });
      var ins = insumosDe(gHoy);
      if (finde && !gHoy.length) {
        html += '<p class="text-center text-sm text-slate-500 bg-slate-50 rounded-xl p-4 mb-4"><i class="fas fa-umbrella-beach mr-1"></i> Hoy es fin de semana. Revise la pestaña de la próxima semana.</p>';
      }
      html += seccion('Mis reservas de hoy', 'fa-door-open', 'indigo', esp.length, listaPlana(esp, itemEspacio, hoyStr), 'No tiene reservas de salas o recintos para hoy.');
      html += seccion('Mis insumos y materiales de hoy', 'fa-boxes', 'teal', ins.length, listaPlana(ins, function (e) { return itemInsumo(e); }, hoyStr), 'No tiene insumos solicitados para hoy.');
    } else {
      var espS = gSem.filter(function (g) { return !g.solo; });
      var insS = insumosDe(gSem);
      var rango = dias5[0].getDate() + ' al ' + dias5[4].getDate() + ' de ' + MESES[dias5[4].getMonth()];
      html += '<p class="text-xs font-bold text-slate-500 mb-3 text-center">' + (finde ? 'Próxima semana' : 'Semana') + ': ' + rango + '</p>';
      html += seccion('Mis reservas de la semana', 'fa-door-open', 'indigo', espS.length, listaPorDia(espS.map(function (g) { return g; }).map(function (g) { g.fecha = g.fecha; return g; }), itemEspacio, dias5, hoyStr), 'No tiene reservas de salas o recintos esta semana.');
      html += seccion('Mis insumos y materiales de la semana', 'fa-boxes', 'teal', insS.length, listaPorDia(insS, function (e) { return itemInsumo(e); }, dias5, hoyStr), 'No tiene insumos solicitados esta semana.');
    }
    cont.innerHTML = html;
    actualizarBadge();
  }

  function modalAbierto() {
    var m = document.getElementById('modalMiAgenda');
    return !!m && !m.classList.contains('hidden');
  }

  window.abrirMiAgenda = function (tab) {
    if (!window.isLogged) { window.showToast('Inicie sesión para ver su agenda.', 'error'); return window.abrirModalLogin(); }
    if (tab) tabAgenda = tab;
    render();
    window.toggleModal('modalMiAgenda', true);
    var c = document.getElementById('miAgendaScroll'); if (c) c.scrollTop = 0;
  };
  window.miAgendaTab = function (t) {
    tabAgenda = t; render();
    var c = document.getElementById('miAgendaScroll'); if (c) c.scrollTop = 0;
  };
  window.miAgendaVer = function (id) { window.abrirModalDetalle(id); };
  window.miAgendaNueva = function () { window.cerrarModal('modalMiAgenda'); setTimeout(function () { window.irANuevaReserva(); }, 300); };

  function actualizarBadge() {
    var n = 0;
    if (window.isLogged) {
      var hoyStr = fmt(new Date());
      n = agrupar(misActividades().filter(function (a) { return a.estado !== 'anulacion_solicitada'; })).filter(function (g) { return g.fecha === hoyStr; }).length;
    }
    ['badgeMiAgenda', 'badgeMiAgendaBarra'].forEach(function (id) {
      var e = document.getElementById(id);
      if (!e) return;
      e.textContent = n;
      e.style.display = n > 0 ? '' : 'none';
    });
  }

  function mostrarBoton() {
    var b = document.getElementById('btnMiAgenda');
    if (b) { b.classList.remove('hidden'); b.classList.add('flex'); }
    actualizarBadge();
  }
  function ocultarBoton() {
    var b = document.getElementById('btnMiAgenda');
    if (b) { b.classList.add('hidden'); b.classList.remove('flex'); }
    actualizarBadge();
  }

  // ---------------------------------------------------------------- vista de un día (celular)
  function etiquetarColumnas(tabla) {
    if (!tabla || !tabla.tBodies[0]) return;
    var head = tabla.tHead && tabla.tHead.rows[0];
    if (head) Array.prototype.forEach.call(head.cells, function (c, i) { c.setAttribute('data-col', i); });
    var occ = [0, 0, 0, 0, 0, 0];
    Array.prototype.forEach.call(tabla.tBodies[0].rows, function (tr) {
      var col = 0;
      Array.prototype.forEach.call(tr.cells, function (cell) {
        while (col < 6 && occ[col] > 0) col++;
        var cs = cell.colSpan || 1, rs = cell.rowSpan || 1;
        if (cs === 1) cell.setAttribute('data-col', col); else cell.removeAttribute('data-col');
        if (rs > 1) for (var c = col; c < col + cs && c < 6; c++) occ[c] = rs;
        col += cs;
      });
      for (var c2 = 0; c2 < 6; c2++) if (occ[c2] > 0) occ[c2]--;
    });
  }

  function asegurarSelector() {
    var sel = document.getElementById('selectorDiaMovil');
    if (sel) return sel;
    var cont = document.getElementById('contenedorTablaHorarioVisual');
    if (!cont || !cont.parentElement) return null;
    sel = document.createElement('div');
    sel.id = 'selectorDiaMovil';
    cont.parentElement.insertBefore(sel, cont);
    sel.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-dia]');
      if (!b) return;
      diaMovil = parseInt(b.getAttribute('data-dia'));
      var t = document.getElementById('tablaHorario');
      if (t) t.setAttribute('data-dia', String(diaMovil));
      renderSelectorDia();
    });
    return sel;
  }

  function renderSelectorDia() {
    var sel = asegurarSelector();
    if (!sel || !window.getDatesOfWeek) return;
    var fechas = window.getDatesOfWeek(), hoyStr = fmt(new Date());
    sel.innerHTML = fechas.map(function (d, i) {
      return '<button type="button" data-dia="' + (i + 1) + '" class="' + ((i + 1) === diaMovil ? 'activo' : '') + '">' +
        '<span>' + DIAS_CORTO[i] + '</span><b>' + d.getDate() + '</b>' + (fmt(d) === hoyStr ? '<i class="hoy"></i>' : '') + '</button>';
    }).join('');
  }

  function aplicarVistaMovil() {
    var tabla = document.getElementById('tablaHorario');
    if (!tabla) return;
    etiquetarColumnas(tabla);
    renderSelectorDia();
    tabla.setAttribute('data-dia', String(diaMovil));
  }

  // ---------------------------------------------------------------- estilos
  var reglasDia = '';
  for (var d = 1; d <= 5; d++) {
    reglasDia += '#tablaHorario[data-dia="' + d + '"] [data-col="' + d + '"]{display:table-cell!important;width:auto!important}';
  }

  var CSS =
    '#selectorDiaMovil,#barraMovil{display:none}' +
    '#barraMovil .nbadge{display:none}' +
    '#selectorDiaMovil button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:6px 0;border-radius:12px;border:1px solid #e2e8f0;background:#fff;color:#475569;font-size:11px;font-weight:700;position:relative}' +
    '#selectorDiaMovil button b{font-size:17px;line-height:1.1}' +
    '#selectorDiaMovil button.activo{background:#4f46e5;border-color:#4f46e5;color:#fff}' +
    '#selectorDiaMovil button .hoy{position:absolute;top:4px;right:6px;width:7px;height:7px;border-radius:9999px;background:#f59e0b}' +
    '@media (max-width:767px){' +
      'body{padding-bottom:calc(4.75rem + env(safe-area-inset-bottom))!important}' +
      '#fabReserva{display:none!important}' +
      '#barraMovil{display:grid;position:fixed;left:0;right:0;bottom:0;z-index:60000;grid-template-columns:repeat(3,1fr);background:#fff;border-top:1px solid #e2e8f0;box-shadow:0 -2px 12px rgba(0,0,0,.08);padding-bottom:env(safe-area-inset-bottom)}' +
      '#barraMovil button{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;font-size:11px;font-weight:700;color:#475569;position:relative}' +
      '#barraMovil button i{font-size:19px;color:#4f46e5}' +
      '#barraMovil .nbadge{position:absolute;top:3px;left:calc(50% + 8px);background:#e11d48;color:#fff;border-radius:9999px;font-size:10px;padding:0 5px;min-width:16px;text-align:center;line-height:16px}' +
      '#selectorDiaMovil{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;padding:8px;background:#f8fafc;border-bottom:1px solid #e2e8f0}' +
      '#contenedorTablaHorarioVisual{overflow-x:visible!important;min-height:0!important}' +
      '#tablaHorario{min-width:0!important;width:100%;table-layout:auto}' +
      '#tablaHorario [data-col]:not([data-col="0"]){display:none!important}' +
      reglasDia +
      '#tablaHorario [data-col="0"]{width:72px!important;min-width:72px}' +
      '#tablaHorario [class*="text-[7px]"]{font-size:9px!important}' +
      '#tablaHorario [class*="text-[8px]"]{font-size:10px!important}' +
      '#tablaHorario [class*="text-[9px]"]{font-size:11px!important}' +
      '#tablaHorario [class*="text-[10px]"]{font-size:12px!important}' +
      '#panelHorario>div:first-child{padding:8px!important;gap:8px!important}' +
      '#semanaActualDisplay{font-size:.95rem!important}' +
      '[class*="min-w-[250px]"]{min-width:0!important;width:100%}' +
      '#panelAgendamiento>div{position:static!important;max-height:none!important;overflow:visible!important}' +
      '#modalPedidosRecursos table,#modalPedidosRecursos tbody,#modalPedidosRecursos tr,#modalPedidosRecursos td{display:block;width:100%}' +
      '#modalPedidosRecursos thead{display:none}' +
      '#modalPedidosRecursos tbody tr{width:auto;margin:8px;padding:6px;border:1px solid #e2e8f0;border-radius:12px;background:#fff}' +
      '#modalPedidosRecursos td{width:auto!important;border:0!important;padding:4px 8px!important;text-align:left!important}' +
      '#modalPedidosRecursos div:has(>#rangoPDFPedidos){flex-wrap:wrap}' +
    '}';

  // ---------------------------------------------------------------- interfaz (se crea sola)
  var MODAL_HTML =
    '<div id="modalMiAgenda" class="modal hidden opacity-0 fixed inset-0 z-[95000] overflow-y-auto">' +
      '<div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onclick="window.cerrarModal(\'modalMiAgenda\')"></div>' +
      '<div class="flex items-start justify-center min-h-screen p-2 sm:p-4 sm:pt-12 pointer-events-none">' +
        '<div class="bg-white w-full max-w-2xl rounded-2xl shadow-2xl z-50 flex flex-col pointer-events-auto border-t-[6px] border-indigo-600 overflow-hidden" style="max-height:calc(100dvh - 1rem)">' +
          '<div class="p-4 bg-indigo-50 border-b border-indigo-100 flex justify-between items-start gap-3 shrink-0">' +
            '<div class="min-w-0">' +
              '<h2 class="text-lg font-black text-indigo-900 flex items-center gap-2"><i class="fas fa-user-clock text-indigo-600"></i> Mi Agenda</h2>' +
              '<p id="miAgendaNombre" class="text-sm font-bold text-slate-700 truncate"></p>' +
              '<p id="miAgendaFecha" class="text-xs text-slate-500"></p>' +
            '</div>' +
            '<button class="text-indigo-400 hover:text-indigo-600 text-2xl leading-none px-1" onclick="window.cerrarModal(\'modalMiAgenda\')" aria-label="Cerrar"><i class="fas fa-times"></i></button>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-2 p-3 bg-slate-50 border-b border-slate-200 shrink-0">' +
            '<button id="tabAgHoy" type="button" onclick="window.miAgendaTab(\'hoy\')"></button>' +
            '<button id="tabAgSem" type="button" onclick="window.miAgendaTab(\'semana\')"></button>' +
          '</div>' +
          '<div id="miAgendaScroll" class="p-4 overflow-y-auto flex-1"><div id="miAgendaContenido"></div></div>' +
          '<div class="p-3 border-t border-slate-200 bg-white grid grid-cols-2 gap-2 shrink-0">' +
            '<button type="button" onclick="window.cerrarModal(\'modalMiAgenda\')" class="py-3 rounded-xl border border-slate-300 text-slate-600 text-sm font-bold">Cerrar</button>' +
            '<button type="button" onclick="window.miAgendaNueva()" class="py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow"><i class="fas fa-calendar-plus mr-1"></i> Nueva reserva</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  var BARRA_HTML =
    '<nav id="barraMovil">' +
      '<button type="button" onclick="window.barraHorario()"><i class="fas fa-calendar-week"></i><span>Horario</span></button>' +
      '<button type="button" onclick="window.abrirMiAgenda()"><i class="fas fa-user-clock"></i><span>Mi agenda</span><span id="badgeMiAgendaBarra" class="nbadge">0</span></button>' +
      '<button type="button" onclick="window.irANuevaReserva()"><i class="fas fa-calendar-plus"></i><span>Reservar</span></button>' +
    '</nav>';

  window.barraHorario = function () {
    var p = document.getElementById('panelHorario');
    if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function crearInterfaz() {
    if (!document.getElementById('estilosMiAgenda')) {
      var st = document.createElement('style');
      st.id = 'estilosMiAgenda';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    if (!document.getElementById('modalMiAgenda')) {
      var w = document.createElement('div');
      w.innerHTML = MODAL_HTML;
      document.body.appendChild(w.firstElementChild);
    }
    if (!document.getElementById('barraMovil')) {
      var w2 = document.createElement('div');
      w2.innerHTML = BARRA_HTML;
      document.body.appendChild(w2.firstElementChild);
    }
    if (!document.getElementById('btnMiAgenda')) {
      var ref = document.getElementById('btnNotifPedidos');
      if (ref && ref.parentElement) {
        var b = document.createElement('button');
        b.id = 'btnMiAgenda';
        b.type = 'button';
        b.className = 'hidden relative bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold py-2 px-3 rounded-lg shadow-sm transition-colors items-center gap-2 text-xs';
        b.innerHTML = '<i class="fas fa-user-clock text-indigo-500"></i> Mi Agenda <span id="badgeMiAgenda" class="bg-indigo-600 text-white rounded-full px-1.5 py-0.5 text-[9px]" style="display:none">0</span>';
        b.onclick = function () { window.abrirMiAgenda(); };
        ref.parentElement.insertBefore(b, ref);
      }
    }
  }

  // ---------------------------------------------------------------- conexión con la app existente
  function iniciar() {
    crearInterfaz();

    var origCargar = window.cargarHorarioVista;
    window.cargarHorarioVista = function () {
      var r = origCargar.apply(this, arguments);
      try { aplicarVistaMovil(); } catch (e) { console.warn('Vista móvil:', e); }
      return r;
    };

    var origLogin = window.procesarLogin;
    window.procesarLogin = function () {
      var antes = window.isLogged ? window.userName : '';
      var r = origLogin.apply(this, arguments);
      if (window.isLogged && window.userName !== antes) {
        mostrarBoton();
        if (window.esPerfilDocente && window.esPerfilDocente()) {
          setTimeout(function () { window.abrirMiAgenda('hoy'); }, 500);
        }
      }
      return r;
    };

    var origSalir = window.cerrarAdmin;
    window.cerrarAdmin = function () {
      var r = origSalir.apply(this, arguments);
      ocultarBoton();
      window.cerrarModal('modalMiAgenda');
      return r;
    };

    var origNotif = window.actualizarNotificacionesPedidos;
    window.actualizarNotificacionesPedidos = function () {
      var r = origNotif.apply(this, arguments);
      actualizarBadge();
      if (modalAbierto()) render();
      return r;
    };

    aplicarVistaMovil();
    if (window.isLogged) mostrarBoton();
  }

  function esperar(cond, cb, intentos) {
    if (cond()) return cb();
    if (intentos <= 0) { console.warn('mi-agenda.js: la aplicación principal no terminó de cargar.'); return; }
    setTimeout(function () { esperar(cond, cb, intentos - 1); }, 150);
  }

  esperar(function () {
    return window.cargarHorarioVista && window.procesarLogin && window.cerrarAdmin &&
      window.actualizarNotificacionesPedidos && window.getArrayBloques && window.irANuevaReserva &&
      document.getElementById('tablaHorario') && document.getElementById('btnNotifPedidos');
  }, iniciar, 200);
})();
