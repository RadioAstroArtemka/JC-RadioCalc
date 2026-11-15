/* JCJENSON: графики на Chart.js.
   Подключается после основного скрипта и добавляет график под результатами
   каждой вкладки, не меняя её разметку. Без Chart.js сайт работает как раньше. */
(function () {
  if (typeof Chart === 'undefined' || typeof T === 'undefined') return;

  const css = k => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  const st = document.createElement('style');
  st.textContent = '.chartbox{position:relative;height:340px;background:var(--panel);border:1px solid var(--bd);padding:14px 16px;margin-bottom:22px}';
  document.head.appendChild(st);

  const reg = {};
  const logTick = x => {
    const m = x / Math.pow(10, Math.floor(Math.log10(x)));
    return [1, 2, 5].some(a => Math.abs(m - a) < 1e-6) ? x.toLocaleString('ru-RU') : '';
  };

  /* Рисует график под блоком anchor. scales: {ось: {t: подпись, o: доп. настройки}} */
  function draw(key, anchor, title, type, data, scales, tip) {
    const a = document.getElementById(anchor);
    if (!a) return;
    let w = document.getElementById('cw_' + key);
    if (!w) {
      w = document.createElement('div');
      w.id = 'cw_' + key;
      w.innerHTML = '<h2 class="sub">' + title + '</h2><div class="chartbox"><canvas></canvas></div>';
      a.after(w);
    }
    if (reg[key]) reg[key].destroy();
    const fg = css('--fg'), mut = css('--mut'), grid = css('--hair'), bd = css('--bd');
    const sc = {};
    for (const k in scales) {
      const s = scales[k];
      sc[k] = Object.assign({
        title: { display: !!s.t, text: s.t, color: mut },
        grid: { color: grid }, border: { color: bd }, ticks: { color: mut }
      }, s.o || {});
    }
    reg[key] = new Chart(w.querySelector('canvas'), {
      type, data,
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'nearest', intersect: false, axis: 'x' },
        elements: { point: { radius: 0, hoverRadius: 4 }, line: { borderWidth: 2, tension: 0 } },
        plugins: { legend: { labels: { color: fg, boxWidth: 14 } }, tooltip: tip || {} },
        scales: sc
      }
    });
  }

  const marker = (label, pts, color, axis) => ({
    label, data: pts, showLine: false, pointRadius: 6, pointHoverRadius: 7,
    backgroundColor: color, borderColor: css('--bg'), borderWidth: 2, yAxisID: axis || 'y'
  });

  /* ---- Антенны: размеры по диапазонам ---- */
  const BANDS = [['160 м', 1.85], ['80 м', 3.65], ['60 м', 5.36], ['40 м', 7.1], ['30 м', 10.12],
    ['20 м', 14.17], ['17 м', 18.12], ['15 м', 21.2], ['12 м', 24.94], ['10 м', 28.5], ['6 м', 50.2]];
  function cAnt() {
    const kd = n('a_kd'), kv = n('a_kv'), kq = n('a_kq');
    draw('ant', 'out', 'Размеры антенн по любительским диапазонам', 'bar', {
      labels: BANDS.map(b => b[0]),
      datasets: [
        { label: 'Диполь, м', data: BANDS.map(b => 150 * kd / b[1]), backgroundColor: css('--red') },
        { label: 'V-диполь, м', data: BANDS.map(b => 150 * kv / b[1]), backgroundColor: css('--fg') },
        { label: 'Штырь λ/4, м', data: BANDS.map(b => 75 * kq / b[1]), backgroundColor: css('--mut') }
      ]
    }, {
      x: { t: 'Диапазон' },
      y: { t: 'Длина, м (логарифмическая шкала)', o: { type: 'logarithmic', ticks: { callback: logTick, color: css('--mut') } } }
    }, { mode: 'index', intersect: false });
  }

  /* ---- Кабель: потери от частоты ---- */
  function cCab() {
    const L = n('c_l'), A = n('c_a'), f0 = n('c_f');
    const fs = [];
    for (let i = 0; i <= 60; i++) fs.push(Math.pow(10, i / 20));
    const line = a => fs.map(f => ({ x: f, y: a * Math.sqrt(f / 100) * L / 100 }));
    const ds = CAB.map(c => ({ label: c[0], data: line(c[1]), borderColor: css('--bd'), borderWidth: 1.5 }));
    ds.push({ label: 'Ваш кабель', data: line(A), borderColor: css('--red'), borderWidth: 3 });
    ds.push(marker('Рабочая частота', [{ x: f0, y: A * Math.sqrt(f0 / 100) * L / 100 }], css('--red')));
    draw('cab', 'out', 'Потери в кабеле длиной ' + sig(L) + ' м', 'line', { datasets: ds }, {
      x: { t: 'Частота, МГц', o: { type: 'logarithmic', ticks: { callback: logTick, color: css('--mut') } } },
      y: { t: 'Потери, дБ', o: { type: 'logarithmic', ticks: { callback: logTick, color: css('--mut') } } }
    });
  }

  /* ---- Фильтр: амплитудно-частотная характеристика ---- */
  function cFlt() {
    const t = document.getElementById('f_t').value, k = +document.getElementById('f_n').value;
    const f1 = n('f_1'), f2 = n('f_2'), Lr = n('f_r'), fx = n('f_x');
    if (!(f2 > f1)) return;
    const f0 = Math.sqrt(f1 * f2), d = (f2 - f1) / f0, bw = f2 - f1, e2 = Math.pow(10, Lr / 10) - 1;
    const att = f => {
      const W = Math.abs(f / f0 - f0 / f) / d;
      if (t === 'b') return 10 * Math.log10(1 + Math.pow(W, 2 * k));
      const T = W <= 1 ? Math.cos(k * Math.acos(W)) : Math.cosh(k * Math.acosh(W));
      return 10 * Math.log10(1 + e2 * T * T);
    };
    let lo = Math.max(f1 - 3 * bw, f0 * 0.15), hi = f2 + 3 * bw;
    if (isFinite(fx) && fx > 0) { lo = Math.min(lo, fx * 0.97); hi = Math.max(hi, fx * 1.03); }
    const pts = [];
    for (let i = 0; i <= 800; i++) { const f = lo + (hi - lo) * i / 800; pts.push({ x: f, y: -Math.min(att(f), 80) }); }
    const ds = [{ label: 'Вносимые потери, дБ', data: pts, borderColor: css('--red'), borderWidth: 2.5 }];
    if (isFinite(fx) && fx > 0) ds.push(marker('Частота ' + sig(fx) + ' МГц: −' + sig(att(fx), 3) + ' дБ', [{ x: fx, y: -Math.min(att(fx), 80) }], css('--fg')));
    draw('flt', 'out', 'Амплитудно-частотная характеристика', 'line', { datasets: ds }, {
      x: { t: 'Частота, МГц', o: { type: 'linear' } },
      y: { t: 'Ослабление, дБ', o: { min: -80, max: 0 } }
    });
  }

  /* ---- Доплер: сдвиг за пролёт через зенит ---- */
  function cDop() {
    const fd = n('d_fd'), fu = n('d_fu'), h = n('d_h'), R = 6371, a = R + h, c = 299792.458;
    const w = Math.sqrt(398600.4418 / Math.pow(a, 3)), tm = Math.acos(R / a);
    const rx = [], tx = [];
    for (let i = 0; i <= 120; i++) {
      const th = -tm + 2 * tm * i / 120, t = th / w / 60;
      const dist = Math.sqrt(R * R + a * a - 2 * R * a * Math.cos(th));
      const dd = R * a * Math.sin(th) * w / dist; /* км/с, > 0 при удалении */
      rx.push({ x: t, y: -fd * 1e3 * dd / c });
      tx.push({ x: t, y: fu * 1e3 * dd / c });
    }
    draw('dop', 'out', 'Доплеровский сдвиг за пролёт (через зенит, ' + sig(2 * tm / w / 60, 3) + ' мин)', 'line', {
      datasets: [
        { label: 'Приём, кГц', data: rx, borderColor: css('--red'), borderWidth: 2.5 },
        { label: 'Поправка передачи, кГц', data: tx, borderColor: css('--fg'), borderDash: [6, 4] }
      ]
    }, {
      x: { t: 'Время от середины пролёта, мин', o: { type: 'linear' } },
      y: { t: 'Сдвиг, кГц' }
    });
  }

  /* ---- Конвертер: напряжение от уровня сигнала и шкала S-метра ---- */
  function cConv() {
    const Z = n('u_z'), u = document.getElementById('u_u').value, v = n('u_v');
    let P;
    if (u === 'w') P = v; else if (u === 'mw') P = v / 1e3;
    else if (u === 'dbm') P = 1e-3 * Math.pow(10, v / 10); else if (u === 'dbw') P = Math.pow(10, v / 10);
    else {
      const V = u === 'v' ? v : u === 'mv' ? v / 1e3 : u === 'uv' ? v / 1e6 : u === 'dbuv' ? 1e-6 * Math.pow(10, v / 20) : 1e-3 * Math.pow(10, v / 20);
      P = V * V / Z;
    }
    const uv = d => Math.sqrt(1e-3 * Math.pow(10, d / 10) * Z) * 1e6;
    const pts = [];
    for (let d = -130; d <= 50; d += 2) pts.push({ x: d, y: uv(d) });
    const S = [1, 3, 5, 7, 9].map(s => { const d = -73 - 6 * (9 - s); return { x: d, y: uv(d), s: 'S' + s }; });
    const dbm = 10 * Math.log10(P * 1e3);
    const ds = [
      { label: 'Напряжение, мкВ', data: pts, borderColor: css('--red'), borderWidth: 2.5 },
      marker('Метки S-метра (S9 = −73 дБм)', S, css('--fg'))
    ];
    if (dbm >= -130 && dbm <= 50) ds.push(marker('Ваш уровень: ' + sig(dbm, 4) + ' дБм', [{ x: dbm, y: uv(dbm) }], css('--red')));
    draw('conv', 'o1', 'Напряжение на ' + sig(Z) + ' Ом в зависимости от уровня', 'line', { datasets: ds }, {
      x: { t: 'Уровень, дБм', o: { type: 'linear' } },
      y: { t: 'Напряжение RMS, мкВ', o: { type: 'logarithmic', ticks: { callback: logTick, color: css('--mut') } } }
    }, {
      callbacks: {
        label: c => c.raw && c.raw.s ? c.raw.s + ': ' + c.raw.x + ' дБм, ' + sig(c.raw.y, 3) + ' мкВ'
          : c.dataset.label.indexOf('Ваш') === 0 ? sig(c.raw.y, 4) + ' мкВ' : sig(c.parsed.x, 4) + ' дБм → ' + sig(c.parsed.y, 4) + ' мкВ'
      }
    });
  }

  /* ---- КСВ: потери и отражённая мощность ---- */
  function curSwr() {
    const m = document.getElementById('s_m').value;
    let G;
    if (m === 'swr') { const s = n('s_s'); G = (s - 1) / (s + 1); }
    else if (m === 'rl') G = Math.pow(10, -n('s_rl') / 20);
    else if (m === 'gam') G = n('s_g');
    else if (m === 'pw') G = Math.sqrt(n('s_pr') / n('s_pf'));
    else G = Math.hypot(n('s_r') - n('s_z0'), n('s_x')) / Math.hypot(n('s_r') + n('s_z0'), n('s_x'));
    return G >= 0 && G < 1 ? (1 + G) / (1 - G) : NaN;
  }
  function cSwr() {
    const loss = s => { const G = (s - 1) / (s + 1); return -10 * Math.log10(1 - G * G); };
    const refl = s => Math.pow((s - 1) / (s + 1), 2) * 100;
    const p1 = [], p2 = [];
    for (let s = 1; s <= 10.001; s += 0.1) { p1.push({ x: s, y: loss(s) }); p2.push({ x: s, y: refl(s) }); }
    const ds = [
      { label: 'Потери на рассогласование, дБ', data: p1, borderColor: css('--red'), borderWidth: 2.5, yAxisID: 'y' },
      { label: 'Отражённая мощность, %', data: p2, borderColor: css('--fg'), borderDash: [6, 4], yAxisID: 'y1' }
    ];
    const S = curSwr();
    if (isFinite(S) && S <= 10) {
      ds.push(marker('Ваш КСВ ' + sig(S, 3), [{ x: S, y: loss(S) }], css('--red'), 'y'));
      ds.push(marker('Отражено ' + sig(refl(S), 3) + ' %', [{ x: S, y: refl(S) }], css('--fg'), 'y1'));
    }
    draw('swr', 'out', 'Потери и отражённая мощность в зависимости от КСВ', 'line', { datasets: ds }, {
      x: { t: 'КСВ', o: { type: 'linear', min: 1, max: 10 } },
      y: { t: 'Потери, дБ', o: { min: 0 } },
      y1: { t: 'Отражённая мощность, %', o: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false } } }
    });
  }

  const HOOK = {
    'Антенны': cAnt, 'Коаксиальный кабель': cCab, 'Полосовые фильтры': cFlt,
    'Доплер для спутников': cDop, 'Конвертер единиц': cConv, 'КСВ и согласование': cSwr
  };
  T.forEach(p => {
    const h = HOOK[p.t], base = p.c;
    if (!h) return;
    p.c = () => { base(); try { h(); } catch (e) { console.error(e); } };
  });

  const mq = window.matchMedia('(prefers-color-scheme:dark)');
  if (mq.addEventListener) mq.addEventListener('change', () => T[cur].c());
  T[cur].c();
})();
