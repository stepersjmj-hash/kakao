// 탭 1: 카카오 place ID 매칭

// =========================
// 카카오 place ID 매칭 로직
// =========================
let matchStopFlag = false;
let matchRunning = false;

function normalizeName(s) {
  if (!s) return '';
  // 괄호 안 내용 제거 ("(고모리본점)" 등), 공백/특수문자 제거, 소문자화
  return String(s)
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^\w가-힣]/g, '')
    .toLowerCase();
}

function nameMatch(a, b) {
  const na = normalizeName(a), nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // 한 쪽이 다른 쪽을 포함 (지점명 차이 등)
  if (na.length >= 2 && nb.includes(na)) return true;
  if (nb.length >= 2 && na.includes(nb)) return true;
  return false;
}

async function kakaoSearchByKeyword(apiKey, query, lng, lat) {
  const params = new URLSearchParams({ query, size: '15' });
  if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
    params.set('x', String(lng));
    params.set('y', String(lat));
    params.set('radius', '20000');
    params.set('sort', 'distance');
  }
  const url = 'https://dapi.kakao.com/v2/local/search/keyword.json?' + params.toString();
  const res = await fetch(url, {
    headers: { 'Authorization': 'KakaoAK ' + apiKey }
  });
  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch(_) {}
    throw new Error(`HTTP ${res.status} ${body.substring(0,120)}`);
  }
  return await res.json();
}

function updateMatchProgress(done, total, ok, doubt, fail, skip) {
  $('mStatDone').textContent = done;
  $('mStatTotal').textContent = total;
  $('mStatOk').textContent = ok;
  $('mStatDoubt').textContent = doubt;
  $('mStatFail').textContent = fail;
  $('mStatSkip').textContent = skip;
  $('matchProgressFill').style.width = total ? (done/total*100)+'%' : '0%';
}

async function matchOne(item, opts) {
  const { apiKey, titleField, latField, lngField, distThreshold, replaceIdx, alsoReplaceDoubt } = opts;
  const query = item[titleField];
  const lat = (item[latField] != null) ? parseFloat(item[latField]) : null;
  const lng = (item[lngField] != null) ? parseFloat(item[lngField]) : null;
  if (!query) { item._matchStatus='fail'; item._matchReason='제목 없음'; return { status:'fail' }; }

  const json = await kakaoSearchByKeyword(apiKey, query, lng, lat);
  const docs = json.documents || [];
  if (docs.length === 0) {
    item._matchStatus = 'fail';
    item._matchReason = '검색 결과 없음';
    return { status: 'fail' };
  }

  // 좌표 있으면 sort=distance라 docs[0]이 최단거리, 없으면 그냥 첫 번째
  const top = docs[0];
  const dist = top.distance ? parseFloat(top.distance) : null;
  const nm = nameMatch(query, top.place_name);

  let status = 'fail';
  let reason = '';
  if (lat != null && lng != null && dist != null) {
    if (dist <= distThreshold && nm) { status = 'ok'; }
    else if (dist <= distThreshold) { status = 'doubt'; reason = `거리 ${dist}m, 이름 다름`; }
    else if (dist <= distThreshold * 2 && nm) { status = 'doubt'; reason = `거리 ${dist}m (임계 ${distThreshold}m 초과)`; }
    else { status = 'fail'; reason = `거리 ${dist}m, 이름 ${nm?'일치':'다름'}`; }
  } else {
    status = nm ? 'doubt' : 'fail';
    reason = nm ? '좌표 없음, 이름만 일치' : '좌표 없음, 이름 불일치';
  }

  // 결과 기록
  item._matchStatus = status;
  if (reason) item._matchReason = reason;
  if (status === 'ok' || status === 'doubt') {
    item.id = top.id;
    item._matchedPlaceName = top.place_name;
    item._matchedAddr = top.road_address_name || top.address_name;
    item._matchedCategory = top.category_name;
    if (dist != null) item._matchDistance = dist;
    // _idx 삭제 조건
    const shouldReplace = (status === 'ok' && replaceIdx) || (status === 'doubt' && alsoReplaceDoubt);
    if (shouldReplace) delete item._idx;
  }
  return { status, dist, name: top.place_name };
}

async function runMatch() {
  if (matchRunning) return;
  const apiKey = $('kakaoApiKey').value.trim();
  if (!apiKey) { log('카카오 REST API 키를 입력하세요.', 'err'); return; }
  if (!workingData) { log('JSON 파일을 먼저 업로드하세요.', 'err'); return; }
  const arr = getCafesArray(workingData);
  if (!arr) { log('JSON에서 배열을 찾지 못했습니다.', 'err'); return; }

  // 설정값 저장
  try {
    localStorage.setItem('kakao_apiKey', apiKey);
    localStorage.setItem('kakao_matchOpts', JSON.stringify({
      titleField: $('titleField').value,
      latField: $('latField').value,
      lngField: $('lngField').value,
      distThreshold: $('distThreshold').value,
      matchConc: $('matchConc').value,
      matchDelay: $('matchDelay').value,
    }));
  } catch(_) {}

  const opts = {
    apiKey,
    titleField: $('titleField').value || '제목',
    latField: $('latField').value || '_LAT',
    lngField: $('lngField').value || '_LNG',
    distThreshold: parseInt($('distThreshold').value) || 150,
    replaceIdx: $('replaceIdx').checked,
    alsoReplaceDoubt: $('alsoReplaceDoubt').checked,
  };
  const conc = parseInt($('matchConc').value) || 2;
  const delay = parseInt($('matchDelay').value) || 0;

  matchRunning = true; matchStopFlag = false;
  $('matchBtn').disabled = true;
  $('stopMatchBtn').disabled = false;
  $('downloadMatchBtn').disabled = true;

  // 이미 id 있는 항목은 스킵
  const targets = [];
  let skip = 0;
  for (const item of arr) {
    if (item.id) { skip++; continue; }
    targets.push(item);
  }
  log(`[매칭] 대상 ${targets.length}개 / 스킵 ${skip}개 (이미 id 있음) / 전체 ${arr.length}`, 'info');

  let done = 0, ok = 0, doubt = 0, fail = 0;
  updateMatchProgress(done, targets.length, ok, doubt, fail, skip);

  let idx = 0;
  async function worker() {
    while (idx < targets.length && !matchStopFlag) {
      const my = idx++;
      const item = targets[my];
      const title = item[opts.titleField] || '(no title)';
      try {
        const r = await matchOne(item, opts);
        if (r.status === 'ok') {
          ok++;
          log(`[매칭 ${my+1}/${targets.length}] ✓ ${title} → id=${item.id} (${r.dist}m, "${r.name}")`, 'ok');
        } else if (r.status === 'doubt') {
          doubt++;
          log(`[매칭 ${my+1}/${targets.length}] ? ${title} → id=${item.id} — ${item._matchReason} (카카오: "${r.name||''}")`, 'warn');
        } else {
          fail++;
          log(`[매칭 ${my+1}/${targets.length}] ✗ ${title} — ${item._matchReason||'실패'}`, 'err');
        }
      } catch(err) {
        fail++;
        item._matchStatus = 'fail';
        item._matchReason = err.message;
        log(`[매칭 ${my+1}/${targets.length}] ✗ ${title} — ${err.message}`, 'err');
      }
      done++;
      updateMatchProgress(done, targets.length, ok, doubt, fail, skip);
      if (delay) await new Promise(r=>setTimeout(r, delay));
    }
  }
  const workers = [];
  for (let i=0; i<conc; i++) workers.push(worker());
  await Promise.all(workers);

  log(`[매칭] 완료 — 성공 ${ok}, 의심 ${doubt}, 실패 ${fail}, 스킵 ${skip}`, 'info');

  // 실패 항목 삭제 옵션 처리 (모든 워커 종료 후 안전하게 in-place 제거)
  if ($('deleteFailed').checked) {
    let removed = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] && arr[i]._matchStatus === 'fail') {
        arr.splice(i, 1);
        removed++;
      }
    }
    if (removed > 0) {
      log(`[매칭] 실패 항목 ${removed}개를 결과에서 삭제했습니다. (남은 항목: ${arr.length}개)`, 'warn');
    } else {
      log(`[매칭] 삭제할 실패 항목 없음.`, 'info');
    }
  }

  matchRunning = false;
  $('matchBtn').disabled = false;
  $('stopMatchBtn').disabled = true;
  $('downloadMatchBtn').disabled = false;
  // 메인 enrich 단계에서 사용할 수 있도록 다운로드 버튼도 활성화
  $('downloadBtn').disabled = false;
}

$('matchBtn').onclick = runMatch;
$('stopMatchBtn').onclick = () => { matchStopFlag = true; log('[매칭] 중단 요청됨', 'warn'); };
$('downloadMatchBtn').onclick = () => {
  if (!workingData) return;
  const blob = new Blob([JSON.stringify(workingData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const ts = new Date().toISOString().replace(/[:.]/g,'-').substring(0,19);
  a.href = URL.createObjectURL(blob);
  a.download = `matched_${ts}.json`;
  a.click();
  log('매칭된 JSON 다운로드 시작', 'info');
};

// 저장된 API 키 / 매칭 설정 복원
(function restoreMatchSettings() {
  try {
    const k = localStorage.getItem('kakao_apiKey');
    if (k) $('kakaoApiKey').value = k;
    const raw = localStorage.getItem('kakao_matchOpts');
    if (raw) {
      const o = JSON.parse(raw);
      if (o.titleField) $('titleField').value = o.titleField;
      if (o.latField) $('latField').value = o.latField;
      if (o.lngField) $('lngField').value = o.lngField;
      if (o.distThreshold) $('distThreshold').value = o.distThreshold;
      if (o.matchConc) $('matchConc').value = o.matchConc;
      if (o.matchDelay) $('matchDelay').value = o.matchDelay;
    }
  } catch(_) {}
})();
