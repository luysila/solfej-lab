// Solfej Lab — js/summary.js
// Teşhis ekranı (sınav sonucu) ve "Önceki testlerim" (localStorage geçmişi, puan grafiği).

import { CONFIG } from './config.js';
import { KINDS, KIND_DETAIL, KIND_LABEL, MINUS, TENDENCY_LABEL, clamp, fmtSigned, normalizeHistory, tendencyOf } from './pure.js';
import { biasRange, dateFmt, el, fmtDuration, lastDiag, nf0, nf1, nf2, nfMax1, prefersReducedMotion, session, setText, shortDay, showNotice, ui } from './ui.js';
import { storageGet, storageRemove, storageSet } from './settings.js';

// ── Teşhis ekranı ──
export function renderSummary(d, sess) {
  const N = sess.questions.length, A = sess.attempted.length;
  setText(ui.sumMeta, `${A}/${N} soru · ${fmtDuration((sess.finishedAt ?? Date.now()) - sess.startedAt)}${sess.aborted ? ' · yarıda bitirildi' : ''} · set #${sess.seed}`);
  if (!d) {
    renderAnswers(sess);
    setText(ui.sumScore, '—');
    setText(ui.sumTendency, '—');
    ui.sumBiasMark.hidden = true;
    setText(ui.sumHardest, '—');
    setText(ui.sumHardestWhy, '');
    ui.sumRows.replaceChildren();
    ui.sumRoles.replaceChildren();
    ui.sumAdvice.replaceChildren(el('li', null, 'Cevaplanmış soru yok; teşhis için en az bir soru denenmeli.'));
    return;
  }
  setText(ui.sumScore, nfMax1.format(d.score));
  const o = d.overall, R = biasRange();
  setText(ui.sumTendency, o.biasCents == null ? 'Belirsiz' : `${TENDENCY_LABEL[o.tendency]} · ${fmtSigned(o.biasCents, 1)} sent`);
  setText(ui.sumBiasMin, `${MINUS}${R}`);
  setText(ui.sumBiasMax, `+${R}`);
  ui.sumBiasMark.hidden = o.biasCents == null;
  if (o.biasCents != null) ui.sumBiasMark.style.left = `${50 + clamp(o.biasCents / R, -1, 1) * 50}%`;

  const h = d.hardest ? d.byType[d.hardest] : null;
  const typeCount = Object.keys(d.byType).length;
  const notable = !!h && typeCount > 1 && h.difficulty >= CONFIG.ANALYSIS.NOTABLE_DIFFICULTY;
  if (!h) { setText(ui.sumHardest, '—'); setText(ui.sumHardestWhy, ''); }
  else if (notable) {
    setText(ui.sumHardest, `${KIND_LABEL[h.kind]} · ${KIND_DETAIL[h.kind]}`);
    setText(ui.sumHardestWhy, `zorlanma %${nf0.format(h.difficulty * 100)} · seslerin %${nf0.format(h.accuracy * 100)} doğrulandı`);
  } else {
    setText(ui.sumHardest, typeCount > 1 ? 'Belirgin fark yok' : KIND_LABEL[h.kind]);
    setText(ui.sumHardestWhy, `en yüksek zorlanma: ${KIND_LABEL[h.kind].toLocaleLowerCase('tr')} · %${nf0.format(h.difficulty * 100)}`);
  }

  ui.sumRows.replaceChildren();
  /** Tablo satırı: tip (ya da üç seste durum) için doğrulanan ses, süre, tekrar, sapma, eğilim, zorlanma */
  const statRow = (label, small, t, { hardest = false, sub = false } = {}) => {
    const tr = el('tr', sub ? 'sub-row' : null);
    const c1 = el('td');
    c1.append(document.createTextNode(label));
    if (hardest) c1.append(el('span', 'tag', 'en zor'));
    c1.append(el('small', null, small));
    const c2 = el('td', null, `${t.verified}/${t.notes} · %${nf0.format(t.accuracy * 100)}`);
    const c3 = el('td', null, t.meanTimeMs == null ? '—' : `${nf1.format(t.meanTimeMs / 1000)} sn`);
    const c4 = el('td', null, nf1.format(t.replaysPerQuestion));
    const c5 = el('td', null, t.meanAbsCents == null ? '—' : `±${nf1.format(t.meanAbsCents)} sent`);
    const c6 = el('td', null, t.biasCents == null ? '—' : `${fmtSigned(t.biasCents, 1)} sent · ${TENDENCY_LABEL[tendencyOf(t.biasCents)]}`);
    const c7 = el('td');
    const diff = el('div', 'diff'), bar = el('div', 'diff-bar'), fill = el('div', 'diff-fill');
    fill.style.width = `${clamp(t.difficulty, 0, 1) * 100}%`;
    bar.append(fill);
    diff.append(bar, el('span', null, `%${nf0.format(t.difficulty * 100)}`));
    c7.append(diff);
    tr.append(c1, c2, c3, c4, c5, c6, c7);
    ui.sumRows.append(tr);
  };
  const notableMin = CONFIG.ANALYSIS.NOTABLE_DIFFICULTY;
  for (const kind of KINDS) {
    const t = d.byType[kind];
    if (!t) continue;
    statRow(KIND_LABEL[kind], `${KIND_DETAIL[kind]} · ${t.questions} soru · puan ${nfMax1.format(t.score)}`, t,
      { hardest: kind === d.hardest && typeCount > 1 && t.difficulty >= notableMin });
    if (kind !== 'triple') continue;
    // Üç ses: duruma göre (temel durum / 1. çevrim / 2. çevrim) — hangisinde zorlanıldığı görünür (alt satır)
    for (const g of Object.values(d.byInversion || {})) {
      statRow(`› ${g.label}`, `${g.questions} soru · puan ${nfMax1.format(g.score)}`, g,
        { sub: true, hardest: g.inversion === d.hardestInversion && g.difficulty >= notableMin });
    }
  }

  ui.sumRoles.replaceChildren();
  for (const [role, r] of Object.entries(d.byRole)) {
    if (r.biasCents == null) continue;
    const chip = el('span', 'chip', `${role === 'Ses' ? 'Tek ses' : role}: ${fmtSigned(r.biasCents, 1)} sent`);
    chip.title = `${r.frames} kare`;
    ui.sumRoles.append(chip);
  }
  ui.sumAdvice.replaceChildren(...d.messages.map((m) => el('li', null, m)));
  renderAnswers(sess);
}
const STATUS_MARK = { done: '✓ tam', partial: '◐ kısmi', skipped: '✗ geçildi', timeout: '✗ süre doldu', unanswered: '— cevaplanmadı', pending: '—' };
/** Sorular ve cevaplar: nota adları "hiç" değilse (özellikle "sınav sonunda" seçeneğinde cevaplar burada açılır) */
export function renderAnswers(sess) {
  const rv = (sess.cfg ?? CONFIG).EXAM.REVEAL_NOTE_NAMES;
  ui.sumAnswersWrap.hidden = rv === 'never';
  ui.sumAnswersWrap.open = rv === 'session';
  ui.sumAnswers.replaceChildren(...sess.results.map((r) => {
    const li = el('li', `ans-${r.status}`);
    li.append(el('span', null, r.title), el('small', null, STATUS_MARK[r.status] ?? r.status));
    return li;
  }));
}
export function showSummary() {
  renderSummary(lastDiag, session);
  ui.summaryPanel.hidden = false;
  renderHistory();
  ui.summaryPanel.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}
export function hideSummary() { ui.summaryPanel.hidden = true; }


// ── Önceki testlerim (localStorage) ──
export function loadHistory() { return normalizeHistory(storageGet(CONFIG.HISTORY.STORAGE_KEY, []), CONFIG.HISTORY.MAX_ENTRIES); }
export function addHistory(entry) {
  const list = loadHistory();
  list.push(entry);
  if (!storageSet(CONFIG.HISTORY.STORAGE_KEY, list.slice(-CONFIG.HISTORY.MAX_ENTRIES))) {
    showNotice('Sonuç kaydedilemedi (tarayıcı depolaması kapalı ya da dolu).');
  }
}
export function clearHistory() { storageRemove(CONFIG.HISTORY.STORAGE_KEY); renderHistory(); }

export const SVG_NS = 'http://www.w3.org/2000/svg';
export function svgEl(tag, attrs = {}, text) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text != null) n.textContent = text;
  return n;
}
export function renderHistory() {
  const list = CONFIG.HISTORY.ENABLED ? loadHistory() : [];
  ui.historyEmpty.hidden = list.length > 0;
  ui.historyClear.disabled = !list.length;
  drawHistoryChart(list.slice(-CONFIG.HISTORY.CHART_LAST_N));
  ui.historyList.replaceChildren(...list.slice(-CONFIG.HISTORY.LIST_LAST_N).reverse().map(historyItem));
}
/** Tek seri sütun grafiği: test başına puan (0–100). Değerlerin tamamı aşağıdaki listede de yazılı. */
export function drawHistoryChart(entries) {
  const host = ui.historyChart;
  host.replaceChildren();
  if (!entries.length) return;
  const W = Math.max(260, Math.floor(host.clientWidth || 600)), H = 168;
  const m = { l: 34, r: 12, t: 20, b: 26 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const y = (v) => m.t + ph - (clamp(v, 0, 100) / 100) * ph;
  const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Son ${entries.length} testin puanları` });
  for (const v of [0, 50, 100]) {
    svg.append(svgEl('line', { x1: m.l, x2: W - m.r, y1: y(v) + 0.5, y2: y(v) + 0.5, class: v === 0 ? 'hc-base' : 'hc-grid', 'shape-rendering': 'crispEdges' }));
    svg.append(svgEl('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'hc-tick' }, String(v)));
  }
  const band = pw / entries.length, cw = Math.min(24, band * 0.62);
  const best = Math.max(...entries.map((e) => e.score));
  const bestIdx = entries.map((e) => e.score).lastIndexOf(best);
  const labelEvery = entries.length > 8 ? 2 : 1;
  entries.forEach((e, i) => {
    const x = m.l + i * band + (band - cw) / 2, top = y(e.score), base = y(0);
    const h = base - top, r = Math.min(4, h, cw / 2);
    const label = `${dateFmt.format(new Date(e.at))} · ${nfMax1.format(e.score)} puan${e.complete ? '' : ' (yarım test)'}`;
    const g = svgEl('g', { class: 'hc-col', tabindex: 0, role: 'img', 'aria-label': label });
    g.append(svgEl('rect', { class: 'hc-hit', x: m.l + i * band + 1, y: m.t, width: Math.max(1, band - 2), height: ph, fill: 'transparent', rx: 4 }));
    if (h > 0.5) {
      const d = `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + cw - r}Q${x + cw},${top} ${x + cw},${top + r}V${base}Z`;
      g.append(svgEl('path', { d, class: `hc-bar${e.complete ? '' : ' partial'}` }));
    }
    g.append(svgEl('title', {}, label));
    svg.append(g);
    if (i % labelEvery === (entries.length - 1) % labelEvery) {
      svg.append(svgEl('text', { x: x + cw / 2, y: H - 8, 'text-anchor': 'middle', class: 'hc-tick' }, shortDay.format(new Date(e.at))));
    }
    if (i === entries.length - 1 || i === bestIdx) {            // seçici doğrudan etiket: son ve en iyi
      svg.append(svgEl('text', { x: x + cw / 2, y: top - 6, 'text-anchor': 'middle', class: 'hc-label' }, nfMax1.format(e.score)));
    }
  });
  host.append(svg);
}
export function historyItem(e) {
  const li = el('li', 'h-item');
  const meta = el('div', 'h-meta');
  const tags = [
    e.biasCents != null ? `${TENDENCY_LABEL[e.tendency] ?? '—'} ${fmtSigned(e.biasCents, 1)} sent` : 'eğilim belirsiz',
    e.hardest ? `en zor: ${KIND_LABEL[e.hardest] ?? e.hardest}` : null,
    e.settings ? `±${e.settings.tol} sent · ${nf2.format((e.settings.sustainMs ?? 0) / 1000)} sn` : null,
    e.complete ? `${e.answered} soru` : `yarım · ${e.answered}/${e.total}`,
  ].filter(Boolean);
  if (e.name) tags.unshift(`“${e.name}”`);       // özel sınavın adı (eski kayıtlarda yok)
  meta.append(...tags.map((t) => el('span', null, t)));
  const score = el('div', 'h-score');
  score.append(el('b', null, nfMax1.format(e.score)), el('span', 'muted', ' puan'));
  li.append(el('div', 'h-date', dateFmt.format(new Date(e.at))), meta, score);
  return li;
}
