// 탭 2: 필드 제거 / 필수 필드 기반 항목 삭제

let fieldsData = null;
let fieldsArray = null;
let fieldsSelected = {};   // { key: bool } — 제거
let fieldsRequired = {};   // { key: bool } — 필수
let fieldsKeyList = [];

function truncateText(s, n) {
  if (s == null) return '';
  s = String(s);
  return s.length > n ? s.substring(0, n) + '…' : s;
}

function previewValue(v) {
  if (v == null) return '(null)';
  if (typeof v === 'string') return truncateText(v, 80);
  if (Array.isArray(v)) return `[Array ${v.length}] ` + truncateText(JSON.stringify(v), 60);
  if (typeof v === 'object') return truncateText(JSON.stringify(v), 80);
  return String(v);
}

// 필수 필드 기준의 "비어있음" 판정
function isFieldEmpty(v) {
  if (v == null) return true;
  if (typeof v === 'string' && v === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false; // 0, false 는 값으로 간주
}

function collectKeys(arr) {
  const order = [];
  const seen = new Set();
  const freq = {};
  const first = {};
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    for (const k of Object.keys(item)) {
      if (!seen.has(k)) { seen.add(k); order.push(k); freq[k] = 0; }
      const v = item[k];
      if (!isFieldEmpty(v)) {
        freq[k]++;
        if (!(k in first)) first[k] = v;
      }
    }
  }
  return { order, freq, first, total: arr.length };
}

function renderFieldsList() {
  const container = $('fieldsList');
  if (!fieldsArray || fieldsKeyList.length === 0) {
    container.innerHTML = '<div style="padding:16px;text-align:center;color:#888;font-size:13px;">JSON 파일을 먼저 업로드하세요.</div>';
    return;
  }
  const stats = collectKeys(fieldsArray);
  let html = '<div class="field-row-header"><span style="min-width:140px;">동작</span><span style="flex:1;">키 / 빈도 / 미리보기</span></div>';
  for (const k of fieldsKeyList) {
    const cnt = stats.freq[k] || 0;
    const pct = stats.total ? Math.round(cnt / stats.total * 100) : 0;
    const pv = (k in stats.first) ? previewValue(stats.first[k]) : '(전부 비어있음)';
    const rmChecked = fieldsSelected[k] ? 'checked' : '';
    const reqChecked = fieldsRequired[k] ? 'checked' : '';
    html += `<div class="field-row">
      <label class="cb-wrap remove" title="이 키를 모든 항목에서 delete">
        <input type="checkbox" class="cb-remove" data-key="${esc(k)}" ${rmChecked}>
        <span class="cb-label">제거</span>
      </label>
      <label class="cb-wrap required" title="이 키가 없거나 비어있는 항목은 결과에서 삭제">
        <input type="checkbox" class="cb-required" data-key="${esc(k)}" ${reqChecked}>
        <span class="cb-label">필수</span>
      </label>
      <span class="key">${esc(k)}</span>
      <span class="freq">${cnt}/${stats.total} (${pct}%)</span>
      <span class="pv">${esc(pv)}</span>
    </div>`;
  }
  container.innerHTML = html;
  container.querySelectorAll('input.cb-remove').forEach(cb => {
    cb.addEventListener('change', () => {
      fieldsSelected[cb.dataset.key] = cb.checked;
      updateFieldsSelSummary();
    });
  });
  container.querySelectorAll('input.cb-required').forEach(cb => {
    cb.addEventListener('change', () => {
      fieldsRequired[cb.dataset.key] = cb.checked;
      updateFieldsSelSummary();
    });
  });
  updateFieldsSelSummary();
}

function updateFieldsSelSummary() {
  const total = fieldsKeyList.length;
  const rmCnt = fieldsKeyList.filter(k => fieldsSelected[k]).length;
  const reqCnt = fieldsKeyList.filter(k => fieldsRequired[k]).length;
  $('fieldsSelSummary').textContent = total
    ? `제거 ${rmCnt}/${total} · 필수 ${reqCnt}/${total}`
    : '';
  $('fieldsDownloadBtn').disabled = !(fieldsArray && (rmCnt > 0 || reqCnt > 0));
  if (fieldsArray && (rmCnt > 0 || reqCnt > 0)) {
    const parts = [];
    if (reqCnt > 0) parts.push(`필수 ${reqCnt}개 키 누락 항목 삭제`);
    if (rmCnt > 0) parts.push(`제거 ${rmCnt}개 키 delete`);
    $('fieldsDownloadInfo').textContent = `${fieldsArray.length}개 항목에 적용 예정 — ${parts.join(', ')}`;
  } else {
    $('fieldsDownloadInfo').textContent = '';
  }
}

$('fieldsFileInput').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const txt = await f.text();
    fieldsData = JSON.parse(txt);
    fieldsArray = getCafesArray(fieldsData);
    if (!fieldsArray) {
      $('fieldsFileInfo').textContent = '⚠ 배열을 찾지 못했습니다.';
      return;
    }
    const stats = collectKeys(fieldsArray);
    fieldsKeyList = stats.order;
    fieldsSelected = {};
    fieldsRequired = {};
    $('fieldsFileInfo').innerHTML = `✓ ${f.name} — 항목 <b>${fieldsArray.length}</b>개, 키 <b>${fieldsKeyList.length}</b>개`;
    renderFieldsList();
  } catch(err) {
    $('fieldsFileInfo').textContent = '✗ JSON 파싱 실패: ' + err.message;
  }
});

$('fieldsSelectAll').onclick = () => {
  // "제거 전체 선택" — 제거 컬럼만
  fieldsKeyList.forEach(k => fieldsSelected[k] = true);
  renderFieldsList();
};
$('fieldsSelectNone').onclick = () => {
  // 제거 + 필수 모두 해제
  fieldsSelected = {};
  fieldsRequired = {};
  renderFieldsList();
};

$('fieldsDownloadBtn').onclick = () => {
  if (!fieldsArray) return;
  const toRemove = fieldsKeyList.filter(k => fieldsSelected[k]);
  const required = fieldsKeyList.filter(k => fieldsRequired[k]);
  if (toRemove.length === 0 && required.length === 0) return;

  // 원본 보존 — deep clone
  const cloned = JSON.parse(JSON.stringify(fieldsData));
  const arr = getCafesArray(cloned);
  if (!arr) return;

  const totalBefore = arr.length;

  // 1) 필수 키 없거나 비어있는 항목 제거 (AND — 모든 필수 키 충족해야 유지)
  if (required.length > 0) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const item = arr[i];
      if (!item || typeof item !== 'object') { arr.splice(i, 1); continue; }
      for (const k of required) {
        if (!(k in item) || isFieldEmpty(item[k])) {
          arr.splice(i, 1);
          break;
        }
      }
    }
  }
  const removedItems = totalBefore - arr.length;

  // 2) 남은 항목에서 제거 키 삭제
  let removedKeys = 0;
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    for (const k of toRemove) {
      if (k in item) { delete item[k]; removedKeys++; }
    }
  }

  const blob = new Blob([JSON.stringify(cloned, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const ts = new Date().toISOString().replace(/[:.]/g,'-').substring(0,19);
  a.href = URL.createObjectURL(blob);
  a.download = `cleaned_${ts}.json`;
  a.click();

  const parts = ['✓ 다운로드 완료'];
  if (required.length > 0) parts.push(`항목 ${totalBefore} → ${arr.length} (필수 누락 ${removedItems}개 제거)`);
  if (toRemove.length > 0) parts.push(`키 ${toRemove.length}개 / ${removedKeys}회 delete`);
  $('fieldsDownloadInfo').textContent = parts.join(' · ');
};

log('준비 완료. JSON 파일을 업로드하세요.', 'info');
