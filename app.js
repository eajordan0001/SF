/**
 * 超釩 Super Fan — 客戶查詢系統
 * ════════════════════════════════════════════
 * 試算表欄位順序（第1列為標題，第2列起為資料）：
 *
 *   A  公司名稱     必填
 *   B  地址         必填
 *   C  電話         必填
 *   D  聯絡人       必填
 *   E  注意事項     選填
 *   F  標籤         選填  逗號分隔，例：今日,冷藏
 *   G  Maps連結     選填  從 Google Maps 分享複製的連結
 *                        有填 → 精準導航；沒填 → 地址搜尋
 * ════════════════════════════════════════════
 */

// ────────────────────────────────────────────
// ⚙️  設定（如需異動請修改此區）
// ────────────────────────────────────────────
const CONFIG = {
  SHEET_ID:      '19nmZArUntNhd9OjiTRt8xiioC6RZWel3ZKRmBPn8KjA',
  SHEET_NAME:    'Sheet1',   // 工作表名稱（中文名請用 URL encode）
  CACHE_MINUTES: 30,         // 本地快取時間（分鐘）
  HOME_CITY:     '台南市',   // 主要配送城市，行政區篩選以此為主
};

// ────────────────────────────────────────────
// 台南市行政區固定排序
// ────────────────────────────────────────────
const TAINAN_DISTRICTS = [
  '中西區','東區','南區','北區','安平區','安南區',
  '永康區','歸仁區','新化區','左鎮區','玉井區','楠西區',
  '南化區','仁德區','關廟區','龍崎區','官田區','麻豆區',
  '佳里區','西港區','七股區','將軍區','學甲區','北門區',
  '新營區','後壁區','白河區','東山區','六甲區','下營區',
  '柳營區','鹽水區','善化區','大內區','山上區','新市區',
  '安定區',
];

// ────────────────────────────────────────────
// SVG 圖示（inline，不依賴外部字型）
// ────────────────────────────────────────────
const IC = {
  pin:       `<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>`,
  phone:     `<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.05 3.4 2 2 0 0 1 3 1.24h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21 16.92z"/>`,
  user:      `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
  alert:     `<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
  navigate:  `<polygon points="3 11 22 2 13 21 11 13 3 11"/>`,
  chevron:   `<path d="m9 18 6-6-6-6"/>`,
  snow:      `<line x1="12" y1="2" x2="12" y2="22"/><path d="M2 12h20"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/>`,
};

function ic(path, size = 16) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

// ────────────────────────────────────────────
// App 狀態
// ────────────────────────────────────────────
let allData            = [];
let filterType         = 'all';
let filterDistrict     = 'all';
let searchText         = '';

// ────────────────────────────────────────────
// DOM
// ────────────────────────────────────────────
const el = id => document.getElementById(id);
const searchInput      = el('search-input');
const clearBtn         = el('clear-btn');
const refreshBtn       = el('refresh-btn');
const customerList     = el('customer-list');
const emptyState       = el('empty-state');
const resultCount      = el('result-count');
const lastUpdated      = el('last-updated');
const listView         = el('list-view');
const detailView       = el('detail-view');
const detailContent    = el('detail-content');
const backBtn          = el('back-btn');
const loadingEl        = el('loading');
const toastEl          = el('toast');
const typeChips        = el('type-chips');
const districtChips    = el('district-chips');
const activeFilters    = el('active-filters');
const activeFiltersText= el('active-filters-text');
const clearFiltersBtn  = el('clear-filters-btn');

// ────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────
function showToast(msg, ms = 2600) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), ms);
}

function hideLoading() {
  loadingEl.classList.add('hidden');
}

function timeStr(d) {
  return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function highlight(text, q) {
  if (!q || !text) return esc(text ?? '');
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return esc(text).replace(
    new RegExp(`(${esc(q).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'),
    '<mark style="background:#ffe082;border-radius:3px;padding:0 1px">$1</mark>'
  );
}

// ────────────────────────────────────────────
// 行政區解析
// ────────────────────────────────────────────
function parseDistrict(address) {
  if (!address) return { city: '', district: '' };
  const cm = address.match(/^(.{2,4}(?:市|縣))/);
  const city = cm ? cm[1] : '';
  const rest = city ? address.slice(city.length) : address;
  const dm = rest.match(/^(.{2,4}(?:區|鎮|鄉|市))/);
  return { city, district: dm ? dm[1] : '' };
}

// ────────────────────────────────────────────
// Maps URL 智慧取得
// ────────────────────────────────────────────
function getMapsInfo(c) {
  const raw = (c.mapsUrl || '').trim();
  if (raw && (raw.startsWith('https://') || raw.startsWith('http://'))) {
    return { url: raw, precise: true };
  }
  const q = encodeURIComponent((c.address || '') + ' 台灣');
  return { url: `https://www.google.com/maps/search/?api=1&query=${q}`, precise: false };
}

// ────────────────────────────────────────────
// 行政區 Chips 建立
// ────────────────────────────────────────────
function buildDistrictChips() {
  // 統計各區筆數
  const cnt = {};
  allData.forEach(c => {
    const { city, district } = c._loc;
    if (!district) return;
    const key = city + '__' + district;
    cnt[key] = (cnt[key] || { city, district, n: 0 });
    cnt[key].n++;
  });

  const entries = Object.values(cnt);
  const home = entries.filter(e => e.city === CONFIG.HOME_CITY);
  const away = entries.filter(e => e.city !== CONFIG.HOME_CITY);

  // 台南市依固定順序排序
  home.sort((a, b) => {
    const ia = TAINAN_DISTRICTS.indexOf(a.district);
    const ib = TAINAN_DISTRICTS.indexOf(b.district);
    if (ia < 0 && ib < 0) return b.n - a.n;
    if (ia < 0) return 1;
    if (ib < 0) return -1;
    return ia - ib;
  });

  const awayTotal = away.reduce((s, e) => s + e.n, 0);

  let html = `<button class="chip active" data-district="all">全區</button>`;
  home.forEach(e => {
    html += `<button class="chip" data-district="${esc(e.city + '__' + e.district)}">
      ${esc(e.district)} <span class="chip-n">${e.n}</span>
    </button>`;
  });
  if (awayTotal > 0) {
    html += `<button class="chip chip-outside" data-district="outside">
      外縣市 <span class="chip-n">${awayTotal}</span>
    </button>`;
  }

  districtChips.innerHTML = html;

  districtChips.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      districtChips.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterDistrict = btn.dataset.district;
      syncFilterBar();
      renderList();
    });
  });
}

// ────────────────────────────────────────────
// 篩選提示列同步
// ────────────────────────────────────────────
function syncFilterBar() {
  const parts = [];
  if (filterType !== 'all') {
    parts.push({ all:'全部', 今日:'今日配送', 冷藏:'冷藏品', 注意:'需注意' }[filterType] || filterType);
  }
  if (filterDistrict !== 'all') {
    parts.push(filterDistrict === 'outside' ? '外縣市' : filterDistrict.split('__')[1]);
  }
  if (parts.length === 0) {
    activeFilters.hidden = true;
  } else {
    activeFiltersText.textContent = '篩選：' + parts.join(' ＋ ');
    activeFilters.hidden = false;
  }
}

clearFiltersBtn.addEventListener('click', () => {
  filterType     = 'all';
  filterDistrict = 'all';
  typeChips.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
  typeChips.querySelector('[data-type="all"]').classList.add('active');
  districtChips.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
  const allBtn = districtChips.querySelector('[data-district="all"]');
  if (allBtn) allBtn.classList.add('active');
  syncFilterBar();
  renderList();
});

// ────────────────────────────────────────────
// 列表渲染
// ────────────────────────────────────────────
function renderList() {
  const q = searchText.toLowerCase();

  const list = allData.filter(c => {
    // 類型
    if (filterType === '注意' && !c.note) return false;
    if (filterType !== 'all' && filterType !== '注意' && !c.tags.includes(filterType)) return false;

    // 行政區
    if (filterDistrict !== 'all') {
      const { city, district } = c._loc;
      if (filterDistrict === 'outside') {
        if (city === CONFIG.HOME_CITY) return false;
      } else {
        const [fc, fd] = filterDistrict.split('__');
        if (city !== fc || district !== fd) return false;
      }
    }

    // 搜尋
    if (q && ![c.name, c.phone, c.contact, c.address].some(v => v.toLowerCase().includes(q))) return false;

    return true;
  });

  resultCount.textContent = `共 ${list.length} 筆`;
  emptyState.hidden  = list.length > 0;
  customerList.innerHTML = list.map((c, i) => {
    const { city, district } = c._loc;
    const isOutside = city && city !== CONFIG.HOME_CITY;
    const distTag = district
      ? `<span class="tag ${isOutside ? 'tag-outside' : 'tag-district'}">${isOutside ? city.replace(/市|縣/,'') + '·' : ''}${esc(district)}</span>`
      : '';
    const typeTags = c.tags.map(t =>
      t === '冷藏' ? `<span class="tag tag-cold">${ic(IC.snow,11)} ${t}</span>` :
      t === '今日' ? `<span class="tag tag-today">▶ ${t}</span>` :
                    `<span class="tag tag-warn">${t}</span>`
    ).join('');

    return `
    <div class="card" data-id="${c.id}" style="animation-delay:${i*.04}s" role="button" tabindex="0" aria-label="${esc(c.name)}">
      <div class="card-head">
        <div class="card-name">${highlight(c.name, q)}</div>
        <div class="card-tags">${distTag}${typeTags}</div>
      </div>
      <div class="card-rows">
        ${c.address ? `<div class="card-row">${ic(IC.pin)} <span>${highlight(c.address, q)}</span></div>` : ''}
        ${c.phone   ? `<div class="card-row">${ic(IC.phone)} <span>${highlight(c.phone, q)}</span></div>` : ''}
        ${c.contact ? `<div class="card-row">${ic(IC.user)} <span>${highlight(c.contact, q)}</span></div>` : ''}
      </div>
      ${c.note ? `<div class="card-note">${ic(IC.alert,13)} <span>${esc(c.note)}</span></div>` : ''}
      <div class="card-arrow">${ic(IC.chevron,17)}</div>
    </div>`;
  }).join('');

  // 點擊事件
  customerList.querySelectorAll('.card').forEach(card => {
    const open = () => {
      const c = allData.find(x => x.id === Number(card.dataset.id));
      if (c) showDetail(c);
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  });
}

// ────────────────────────────────────────────
// 詳細頁渲染
// ────────────────────────────────────────────
function showDetail(c) {
  const { url: mapsUrl, precise } = getMapsInfo(c);
  const callUrl = `tel:${(c.phone || '').replace(/[^\d+]/g, '')}`;
  const { city, district } = c._loc;
  const isOutside = city && city !== CONFIG.HOME_CITY;

  const districtTag = district
    ? `<span class="hero-tag">${ic(IC.pin,12)} ${isOutside ? city + ' · ' : ''}${esc(district)}</span>`
    : '';

  const precisionBadge = c.address
    ? `<span class="precision-badge ${precise ? 'badge-precise' : 'badge-search'}">
        ${ic(IC.pin,12)} ${precise ? '精準定位' : '地址搜尋'}
       </span>`
    : '';

  detailContent.innerHTML = `

    <div class="detail-hero">
      <div class="hero-name">${esc(c.name)}</div>
      <div class="hero-tags">
        ${districtTag}
        ${c.tags.map(t => `<span class="hero-tag">${esc(t)}</span>`).join('')}
      </div>
    </div>

    ${c.note ? `
    <div class="note-card">
      <div class="note-icon">${ic(IC.alert,18)}</div>
      <div>
        <div class="note-head">⚠ 注意事項</div>
        <div class="note-body">${esc(c.note)}</div>
      </div>
    </div>` : ''}

    <div class="info-card">
      <div class="info-card-title">聯絡資訊</div>

      ${c.contact ? `
      <div class="info-row">
        <div class="info-icon">${ic(IC.user,17)}</div>
        <div class="info-text">
          <div class="info-label">聯絡人</div>
          <div class="info-value">${esc(c.contact)}</div>
        </div>
      </div>` : ''}

      ${c.phone ? `
      <a href="${callUrl}">
        <div class="info-row clickable">
          <div class="info-icon">${ic(IC.phone,17)}</div>
          <div class="info-text">
            <div class="info-label">電話</div>
            <div class="info-value link">${esc(c.phone)}</div>
          </div>
        </div>
      </a>` : ''}

      ${c.address ? `
      <a href="${mapsUrl}" target="_blank" rel="noopener">
        <div class="info-row clickable">
          <div class="info-icon">${ic(IC.pin,17)}</div>
          <div class="info-text">
            <div class="info-label">地址</div>
            <div class="info-value">${esc(c.address)}</div>
          </div>
          ${precisionBadge}
        </div>
      </a>` : ''}
    </div>

    <div class="action-row">
      ${c.address ? `
      <a href="${mapsUrl}" target="_blank" rel="noopener" style="flex:2;display:flex">
        <button class="action-btn ${precise ? 'btn-map-precise' : 'btn-map-search'}" style="width:100%">
          ${ic(IC.navigate,18)} ${precise ? 'Google Maps 導航' : 'Google Maps 搜尋'}
        </button>
      </a>` : ''}
      ${c.phone ? `
      <a href="${callUrl}" style="flex:1;display:flex">
        <button class="action-btn btn-call" style="width:100%">
          ${ic(IC.phone,18)} 撥打
        </button>
      </a>` : ''}
    </div>

    ${!precise && c.address ? `
    <div class="maps-hint">
      ${ic(IC.alert,14)}
      <span>若導航位置不準確，請在 Google Maps 找到正確地點後點「分享」→「複製連結」，告知管理員填入試算表 G 欄。</span>
    </div>` : ''}
  `;

  listView.classList.remove('active');
  detailView.classList.add('active');
  window.scrollTo(0, 0);
  history.pushState({ detail: c.id }, '');
}

// ────────────────────────────────────────────
// 導航（返回）
// ────────────────────────────────────────────
function goBack() {
  detailView.classList.remove('active');
  listView.classList.add('active');
  window.scrollTo(0, 0);
}

backBtn.addEventListener('click', goBack);
window.addEventListener('popstate', () => {
  if (detailView.classList.contains('active')) goBack();
});

// ────────────────────────────────────────────
// 搜尋 & 類型篩選
// ────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  searchText = searchInput.value;
  clearBtn.hidden = !searchText;
  renderList();
});

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchText = '';
  clearBtn.hidden = true;
  searchInput.focus();
  renderList();
});

typeChips.querySelectorAll('.chip').forEach(btn => {
  btn.addEventListener('click', () => {
    typeChips.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterType = btn.dataset.type;
    syncFilterBar();
    renderList();
  });
});

// ────────────────────────────────────────────
// 重新整理按鈕
// ────────────────────────────────────────────
refreshBtn.addEventListener('click', async () => {
  refreshBtn.classList.add('spin');
  localStorage.removeItem('sf_data');
  localStorage.removeItem('sf_time');
  try {
    await loadData();
    showToast('✓ 資料已更新');
  } catch {
    showToast('⚠ 更新失敗，請檢查網路');
  }
  refreshBtn.classList.remove('spin');
});

// ────────────────────────────────────────────
// CSV 解析
// ────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  let cur = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQ && text[i+1] === '"') { field += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      cur.push(field); field = '';
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (ch === '\r' && text[i+1] === '\n') i++;
      cur.push(field); field = '';
      if (cur.some(c => c.trim())) rows.push(cur);
      cur = [];
    } else {
      field += ch;
    }
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

// ────────────────────────────────────────────
// 資料載入（Google Sheets CSV）
// ────────────────────────────────────────────
async function loadData() {
  const CACHE_MS = CONFIG.CACHE_MINUTES * 60 * 1000;
  const cached = localStorage.getItem('sf_data');
  const cachedAt = localStorage.getItem('sf_time');

  if (cached && cachedAt && Date.now() - Number(cachedAt) < CACHE_MS) {
    setData(JSON.parse(cached));
    return;
  }

  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(CONFIG.SHEET_NAME)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const rows = parseCSV(text).slice(1); // 跳過標題列
  const data = rows
    .filter(r => r[0]?.trim())
    .map((r, i) => ({
      id:      i + 1,
      name:    r[0]?.trim() || '',
      address: r[1]?.trim() || '',
      phone:   r[2]?.trim() || '',
      contact: r[3]?.trim() || '',
      note:    r[4]?.trim() || '',
      tags:    r[5] ? r[5].trim().split(',').map(t => t.trim()).filter(Boolean) : [],
      mapsUrl: r[6]?.trim() || '',
    }));

  localStorage.setItem('sf_data', JSON.stringify(data));
  localStorage.setItem('sf_time', String(Date.now()));
  setData(data);
}

function setData(data) {
  // 加入解析後的行政區
  allData = data.map(c => ({ ...c, _loc: parseDistrict(c.address) }));
  buildDistrictChips();
  renderList();
  lastUpdated.textContent = `更新：${timeStr(new Date())}`;
}

// ────────────────────────────────────────────
// 初始化
// ────────────────────────────────────────────
async function init() {
  try {
    await loadData();
  } catch (err) {
    resultCount.textContent = '載入失敗';
    showToast('⚠ 無法載入資料：請確認試算表已設為公開', 5000);
    console.error(err);
  } finally {
    setTimeout(hideLoading, 500);
  }
}

// Service Worker 離線快取
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
