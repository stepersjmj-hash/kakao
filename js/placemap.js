// js/placemap.js - place-api.map.kakao.com JSON API 기반 데이터 수집
// API: https://place-api.map.kakao.com/places/panel3/{id}
// 필수 헤더: appVersion, pf=PC, Accept: application/json

(() => {
'use strict';

function pmLog(msg, cls='') {
  const el = document.getElementById('pmLog');
  if (!el) return;
  const span = document.createElement('div');
  if (cls) span.className = 'log-' + cls;
  const t = new Date().toLocaleTimeString();
  span.textContent = `[${t}] ${msg}`;
  el.appendChild(span);
  el.scrollTop = el.scrollHeight;
}

// 상태
let pmWorkingData = null;
let pmStopFlag = false;
let pmRunning = false;
let pmSelectedFields = {}; // { key: {checked, outKey} }

// 알려진 필드 (출력 키 + 한글 라벨 + 기본 체크)
const PM_KNOWN_FIELDS = {
  hours:            { outKey: 'hours',           label: '영업시간 (status + 요일별)',         defaultChecked: true },
  hoursAll:         { outKey: 'hoursAll',        label: '영업시간 전체 (휴무일 포함)',         defaultChecked: false },
  homepageUrl:      { outKey: 'homepageUrl',     label: '홈페이지 URL',                       defaultChecked: true },
  facilities:       { outKey: 'facilities',      label: '시설정보 (반려견동반/포장/배달 등)',  defaultChecked: true },
  tags:             { outKey: 'tags',            label: '태그 (#대형카페 등)',                 defaultChecked: true },
  panelTags:        { outKey: 'panelTags',       label: '패널 태그 (카드+탭)',                 defaultChecked: false },
  menus:            { outKey: 'menus',           label: '메뉴 목록 (이름/가격/설명)',          defaultChecked: true },
  parkingInfo:      { outKey: 'parkingInfo',     label: '주차 정보',                           defaultChecked: true },
  subwayInfo:       { outKey: 'subwayInfo',      label: '지하철 출구정보',                     defaultChecked: true },
  ratingDetails:    { outKey: 'ratingDetails',   label: '별점 상세 (맛/분위기/주차/가성비/친절)', defaultChecked: true },
  aiSummary:        { outKey: 'aiSummary',       label: 'AI 요약 (kanana)',                    defaultChecked: false },
  aiQuestions:      { outKey: 'aiQuestions',     label: 'AI 자주묻는질문',                     defaultChecked: false },
  blogSummaries:    { outKey: 'blogSummaries',   label: '블로그 요약',                         defaultChecked: false },
  detailInfos:      { outKey: 'detailInfos',     label: '상세 정보 (full_detail_infos)',       defaultChecked: false },
  simpleInfos:      { outKey: 'simpleInfos',     label: '간단 상세 정보',                      defaultChecked: false },
  photoCount:       { outKey: 'photoCount',      label: '사진 수',                             defaultChecked: false },
  blogReviewCount:  { outKey: 'blogReviewCount', label: '블로그 리뷰 수',                      defaultChecked: false },
  kakaomapReviewCount: { outKey: 'kakaomapReviewCount', label: '카카오맵 리뷰 수',             defaultChecked: false },
  visitorStats:     { outKey: 'visitorStats',    label: '요일별 방문자 통계',                  defaultChecked: false },
  payments:         { outKey: 'payments',        label: '결제 수단',                           defaultChecked: false },
  region:           { outKey: 'regionPm',        label: '지역 정보 (regions)',                 defaultChecked: false },
  storeFacilityIcons: { outKey: 'storeFacilityIcons', label: '시설 아이콘',                    defaultChecked: false },
  priceLevel:       { outKey: 'priceLevel',      label: '가격대',                              defaultChecked: false },
  addInfoSummaries: { outKey: 'addInfoSummaries', label: '추가정보 요약',                      defaultChecked: false },
};

// ========================================================================
// API 호출 — CORS 프록시 경유 (custom 헤더 통과 여부 자동 진단)
// ========================================================================
async function pmFetchJson(id) {
  const target = `https://place-api.map.kakao.com/places/panel3/${encodeURIComponent(id)}`;
  const proxy = document.getElementById('pmProxySelect').value;
  const appVersion = document.getElementById('pmAppVersion').value || '1.0.0';
  const url = proxy ? (proxy + encodeURIComponent(target)) : target;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'appVersion': appVersion,
      'pf': 'PC',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

// ========================================================================
// 파서 — JSON 응답에서 필드 추출
// ========================================================================
function parsePanel3Json(d) {
  const r = { _parseSource: [], _raw: d };
  if (!d || typeof d !== 'object') return r;

  // 영업시간 (open_hours)
  try {
    const oh = d.open_hours;
    if (oh) {
      const status = oh.headline?.text || oh.headline?.headline || null;
      const weekly = {};
      const week = oh.week_from_today || [];
      for (const day of week) {
        // 구조 미확실 — 가능한 키 패턴 시도
        const dayName = day.day_of_week || day.day || day.name || day.label;
        const timeText = day.text || day.business_text || day.open_close_text ||
                         (day.start_time && day.end_time ? `${day.start_time} ~ ${day.end_time}` : null);
        if (dayName && timeText) {
          const dm = String(dayName).match(/^([월화수목금토일])/);
          weekly[dm ? dm[1] : dayName] = timeText;
        }
      }
      if (status || Object.keys(weekly).length) {
        r.hours = { status, weekly };
        r._parseSource.push('hours');
      }
      if (oh.all) {
        r.hoursAll = oh.all;
        r._parseSource.push('hoursAll');
      }
    }
  } catch(_) {}

  // 홈페이지 URL (summary.homepages[0])
  try {
    const hp = d.summary?.homepages;
    if (Array.isArray(hp) && hp.length) {
      // 형태: 문자열 또는 객체
      const first = hp[0];
      r.homepageUrl = typeof first === 'string' ? first : (first.url || first.href || first.value || null);
      if (r.homepageUrl) r._parseSource.push('homepageUrl');
    }
  } catch(_) {}

  // 시설정보 (place_add_info.facilities) — 배열의 각 항목에서 이름 추출
  try {
    const fac = d.place_add_info?.facilities;
    if (Array.isArray(fac) && fac.length) {
      const names = fac.map(f => typeof f === 'string' ? f : (f.name || f.title || f.label || f.text)).filter(x => x);
      if (names.length) {
        r.facilities = names;
        r._parseSource.push('facilities');
      } else {
        // 구조 추출 실패 시 그대로 저장
        r.facilities = fac;
        r._parseSource.push('facilities(raw)');
      }
    }
  } catch(_) {}

  // 태그 (place_add_info.tags)
  try {
    const tags = d.place_add_info?.tags;
    if (Array.isArray(tags) && tags.length) {
      const names = tags.map(t => typeof t === 'string' ? t : (t.name || t.label || t.text || t.title)).filter(x => x);
      r.tags = names.length ? names : tags;
      r._parseSource.push('tags');
    }
  } catch(_) {}

  // 패널 태그 (panel_card_tags + panel_tab_tags)
  try {
    const card = d.panel_card_tags || [];
    const tab = d.panel_tab_tags || [];
    if (card.length || tab.length) {
      const extract = arr => arr.map(t => typeof t === 'string' ? t : (t.name || t.label || t.text || t.title)).filter(x => x);
      r.panelTags = { card: extract(card), tab: extract(tab) };
      r._parseSource.push('panelTags');
    }
  } catch(_) {}

  // 메뉴 (menu.menus.items)
  try {
    const items = d.menu?.menus?.items;
    if (Array.isArray(items) && items.length) {
      r.menus = items.map(m => ({
        name: m.name,
        price: m.price,
        is_recommend: m.is_recommend,
        recommend_reasons: m.recommend_reasons,
        ai_mate_desc: m.ai_mate_desc,
        is_ai_mate: m.is_ai_mate,
      }));
      r._parseSource.push('menus');
    }
  } catch(_) {}

  // 주차 정보 (place_add_info.simple_parking_infos)
  try {
    const pk = d.place_add_info?.simple_parking_infos;
    if (pk) {
      r.parkingInfo = pk;
      r._parseSource.push('parkingInfo');
    }
  } catch(_) {}

  // 지하철 출구정보 (find_way.subway)
  try {
    const sub = d.find_way?.subway;
    if (sub) {
      r.subwayInfo = sub;
      r._parseSource.push('subwayInfo');
    }
  } catch(_) {}

  // 별점 상세 (kakaomap_review.score_set)
  try {
    const ss = d.kakaomap_review?.score_set;
    if (ss) {
      r.ratingDetails = ss;
      r._parseSource.push('ratingDetails');
    }
  } catch(_) {}

  // AI 요약 (ai_mate.summary)
  try {
    const ai = d.ai_mate?.summary;
    if (ai) {
      r.aiSummary = ai;
      r._parseSource.push('aiSummary');
    }
  } catch(_) {}

  try {
    const aq = d.ai_mate?.ai_questions;
    if (Array.isArray(aq) && aq.length) {
      r.aiQuestions = aq;
      r._parseSource.push('aiQuestions');
    }
  } catch(_) {}

  try {
    const bs = d.ai_mate?.blog_summaries;
    if (bs) {
      r.blogSummaries = bs;
      r._parseSource.push('blogSummaries');
    }
  } catch(_) {}

  // 가격대
  try {
    const pl = d.ai_mate?.price_level;
    if (pl) {
      r.priceLevel = pl;
      r._parseSource.push('priceLevel');
    }
  } catch(_) {}

  // 상세 정보
  try {
    const fd = d.place_add_info?.full_detail_infos;
    if (fd) {
      r.detailInfos = fd;
      r._parseSource.push('detailInfos');
    }
  } catch(_) {}

  try {
    const sd = d.place_add_info?.simple_detail_infos;
    if (sd) {
      r.simpleInfos = sd;
      r._parseSource.push('simpleInfos');
    }
  } catch(_) {}

  try {
    const as = d.place_add_info?.add_info_summaries;
    if (as) {
      r.addInfoSummaries = as;
      r._parseSource.push('addInfoSummaries');
    }
  } catch(_) {}

  // 시설 아이콘
  try {
    const sfi = d.place_add_info?.store_facility_icons;
    if (sfi) {
      r.storeFacilityIcons = sfi;
      r._parseSource.push('storeFacilityIcons');
    }
  } catch(_) {}

  // 사진 수
  try {
    const pc = d.photos?.counts;
    if (pc) {
      r.photoCount = pc;
      r._parseSource.push('photoCount');
    }
  } catch(_) {}

  // 블로그 리뷰 수
  try {
    const brc = d.blog_review?.review_count;
    if (brc != null) {
      r.blogReviewCount = brc;
      r._parseSource.push('blogReviewCount');
    }
  } catch(_) {}

  // 카카오맵 리뷰 수
  try {
    const krc = d.kakaomap_review?.review_count ||
                d.kakaomap_review?.reviews?.length;
    if (krc != null) {
      r.kakaomapReviewCount = krc;
      r._parseSource.push('kakaomapReviewCount');
    }
  } catch(_) {}

  // 방문자 통계
  try {
    const v = d.visitor;
    if (v) {
      r.visitorStats = {
        weekly_average: v.weekly_uv_average,
        monday: v.monday_uv,
        tuesday: v.tuesday_uv,
        wednesday: v.wednesday_uv,
        thursday: v.thursday_uv,
        friday: v.friday_uv,
        saturday: v.saturday_uv,
        sunday: v.sunday_uv,
        labels: v.labels,
        updated_at: v.updated_at,
      };
      r._parseSource.push('visitorStats');
    }
  } catch(_) {}

  // 결제 수단
  try {
    const pay = d.summary?.payments;
    if (pay && (Array.isArray(pay) ? pay.length : Object.keys(pay).length)) {
      r.payments = pay;
      r._parseSource.push('payments');
    }
  } catch(_) {}

  // 지역
  try {
    const reg = d.summary?.regions;
    if (reg) {
      r.region = reg;
      r._parseSource.push('region');
    }
  } catch(_) {}

  delete r._raw; // 기본 결과에선 제거 (디버그 모드에서 별도 처리)
  return r;
}

// ========================================================================
// 필드 선택 UI
// ========================================================================
function pmLoadSavedSelection() {
  try { return JSON.parse(localStorage.getItem('placemap_v2_selectedFields') || '{}'); }
  catch(_) { return {}; }
}
function pmSaveSelection() {
  try { localStorage.setItem('placemap_v2_selectedFields', JSON.stringify(pmSelectedFields)); } catch(_) {}
  pmUpdateSummary();
}
function pmUpdateSummary() {
  const total = Object.keys(pmSelectedFields).length;
  const checked = Object.values(pmSelectedFields).filter(s => s.checked).length;
  const el = document.getElementById('pmFieldSummary');
  if (el) el.textContent = total ? `${checked}/${total}개 선택됨` : '';
}

function pmEsc(s) {
  if (s == null) return '';
  return String(s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
}

function pmRenderFieldSelector(parsed) {
  const container = document.getElementById('pmFieldSelector');
  const saved = pmLoadSavedSelection();
  pmSelectedFields = {};
  const keys = Object.keys(parsed).filter(k => !k.startsWith('_'));
  if (!keys.length) {
    container.innerHTML = '<span style="color:#c33;">추출된 필드가 없습니다.</span>';
    return;
  }
  let html = '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:8px;text-align:left;">';
  for (const key of keys) {
    const known = PM_KNOWN_FIELDS[key];
    const outKey = known ? known.outKey : key;
    const label = known ? known.label : '(자동 감지)';
    const defChecked = known ? known.defaultChecked : true;
    const checked = saved.hasOwnProperty(key) ? saved[key].checked : defChecked;
    pmSelectedFields[key] = { checked, outKey };

    const v = parsed[key];
    let preview;
    if (v == null) preview = '<i>(null)</i>';
    else if (typeof v === 'string') preview = pmEsc(v.length > 100 ? v.substring(0,100)+'…' : v);
    else if (Array.isArray(v)) preview = `[${v.length}개] ` + pmEsc(JSON.stringify(v).substring(0,120));
    else if (typeof v === 'object') preview = pmEsc(JSON.stringify(v).substring(0,120));
    else preview = pmEsc(String(v));

    html += `<label style="display:flex;align-items:flex-start;gap:8px;padding:10px;border:1px solid #ddd;border-radius:4px;background:white;cursor:pointer;">
      <input type="checkbox" data-key="${pmEsc(key)}" ${checked?'checked':''} style="margin-top:3px;flex-shrink:0;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;"><b>${pmEsc(key)}</b> <span style="color:#888;font-weight:normal;">→ ${pmEsc(outKey)}</span></div>
        <div style="font-size:12px;color:#666;margin-top:2px;">${pmEsc(label)}</div>
        <div style="font-size:11px;color:#999;margin-top:4px;word-break:break-all;font-family:Consolas,monospace;">${preview}</div>
      </div>
    </label>`;
  }
  html += '</div>';
  container.innerHTML = html;
  container.style.padding = '0';
  container.style.border = 'none';
  container.style.textAlign = 'left';

  container.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const k = cb.dataset.key;
      if (pmSelectedFields[k]) pmSelectedFields[k].checked = cb.checked;
      pmSaveSelection();
    });
  });
  pmSaveSelection();
}

// ========================================================================
// JSON 소스 처리
// ========================================================================
function pmSetWorkingData(data, source) {
  pmWorkingData = JSON.parse(JSON.stringify(data));
  const arr = getCafesArray(pmWorkingData);
  if (!arr) {
    document.getElementById('pmFileInfo').textContent = '⚠ 배열을 찾지 못했습니다.';
    return false;
  }
  document.getElementById('pmFileInfo').innerHTML = `✓ ${source} — 항목 <b>${arr.length}</b>개`;
  document.getElementById('pmStartBtn').disabled = false;
  document.getElementById('pmDownloadBtn').disabled = false;
  pmLog(`JSON 로드 완료: ${arr.length}개 항목 (출처: ${source})`, 'ok');
  return true;
}

document.getElementById('pmFileInput').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const txt = await f.text();
    const data = JSON.parse(txt);
    pmSetWorkingData(data, f.name);
  } catch(err) {
    document.getElementById('pmFileInfo').textContent = '✗ 파싱 실패: ' + err.message;
    pmLog('JSON 파싱 실패: ' + err.message, 'err');
  }
});

document.getElementById('pmUseShared').onclick = () => {
  if (typeof workingData === 'undefined' || workingData == null) {
    pmLog('현재 작업 중인 JSON이 없습니다. 직접 업로드하세요.', 'err');
    return;
  }
  pmSetWorkingData(workingData, '장소정보 수집 탭의 현재 JSON');
};

// ========================================================================
// 테스트 / 수집 실행
// ========================================================================
document.getElementById('pmTestBtn').onclick = async () => {
  const testId = '4718442';
  const proxy = document.getElementById('pmProxySelect').value;
  const appVersion = document.getElementById('pmAppVersion').value || '1.0.0';
  const target = `https://place-api.map.kakao.com/places/panel3/${testId}`;
  const url = proxy ? (proxy + encodeURIComponent(target)) : target;

  pmLog(`샘플 테스트 시작: id=${testId}`, 'info');
  pmLog(`프록시: ${proxy || '(없음)'} / appVersion: ${appVersion}`, 'info');

  // === 1단계: 헤더 없이 호출 (프록시 자체 동작 확인) ===
  pmLog(`1단계: 헤더 없이 fetch → 프록시 통과 확인...`, 'info');
  try {
    const res = await fetch(url);
    const txt = await res.text();
    pmLog(`1단계 결과: HTTP ${res.status} / ${txt.length} bytes`, res.status === 406 ? 'ok' : 'warn');
    if (res.status === 406) {
      pmLog(`✓ 프록시 정상 동작. 406은 appVersion 헤더 누락 때문. 2단계 진행...`, 'ok');
    } else if (res.ok) {
      pmLog(`✓ 헤더 없이도 응답 받음. 응답 앞 300자: ${txt.substring(0,300)}`, 'ok');
    } else {
      pmLog(`⚠ 응답 앞 300자: ${txt.substring(0,300)}`, 'warn');
    }
  } catch(e) {
    pmLog(`1단계 실패: ${e.message}`, 'err');
    pmLog(`→ 프록시 자체가 막혀있습니다. 다른 프록시로 변경하세요.`, 'err');
    return;
  }

  // === 2단계: 헤더 포함 호출 ===
  pmLog(`2단계: appVersion + pf 헤더 포함 fetch...`, 'info');
  try {
    const data = await pmFetchJson(testId);
    const size = JSON.stringify(data).length;
    pmLog(`✓ JSON 수신: ${size.toLocaleString()} bytes`, size > 5000 ? 'ok' : 'warn');
    pmLog(`최상위 키: ${Object.keys(data).join(', ')}`, 'info');

    const parsed = parsePanel3Json(data);
    pmLog(`파싱 성공 필드: ${parsed._parseSource.join(', ') || '(없음)'}`, parsed._parseSource.length ? 'ok' : 'err');
    pmLog(`파싱 결과:\n${JSON.stringify(parsed, null, 2)}`, 'info');

    if (parsed._parseSource.length) {
      pmRenderFieldSelector(parsed);
    } else {
      pmLog(`필드 추출 0건. 응답 샘플 (1500자):\n${JSON.stringify(data, null, 2).substring(0, 1500)}`, 'err');
    }
  } catch(err) {
    pmLog(`2단계 실패: ${err.message}`, 'err');
    pmLog(`원인: 프록시가 CORS preflight(OPTIONS)에서 appVersion/pf 헤더를 허용하지 않습니다.`, 'warn');
    pmLog(`해결책 A: 로컬 프록시 실행 (Python 3줄)`, 'warn');
    pmLog(`  python -c "import http.server,urllib.request as u; \\nclass H(http.server.BaseHTTPRequestHandler):\\n def do_GET(s): r=u.urlopen(u.Request('https://place-api.map.kakao.com/places/panel3/'+s.path.strip('/'),headers={'appVersion':'1.0.0','pf':'PC','Accept':'application/json'})); d=r.read(); s.send_response(200); s.send_header('Content-Type','application/json'); s.send_header('Access-Control-Allow-Origin','*'); s.end_headers(); s.wfile.write(d)\\nhttp.server.HTTPServer(('127.0.0.1',8765),H).serve_forever()"`, 'info');
    pmLog(`  실행 후 프록시 옵션을 "프록시 없음"으로 두고, idField를 그대로 두면 안 됩니다. 대신 별도 옵션 필요 — 다음 단계에서 만들어 드릴게요.`, 'warn');
    pmLog(`해결책 B: 브라우저 확장(CORS Unblock 등)으로 CORS 일시 비활성화 후 "프록시 없음"으로 직접 호출`, 'warn');
  }
};

async function pmProcessOne(item, idField) {
  const id = item[idField];
  if (!id) throw new Error('id 없음');
  const data = await pmFetchJson(id);
  const parsed = parsePanel3Json(data);

  // 선택된 필드만 추가 (자동 감지 새 필드는 기본 체크)
  for (const k of Object.keys(parsed)) {
    if (k.startsWith('_')) continue;
    if (!pmSelectedFields.hasOwnProperty(k)) {
      const known = PM_KNOWN_FIELDS[k];
      const outKey = known ? known.outKey : k;
      const defChecked = known ? known.defaultChecked : true;
      pmSelectedFields[k] = { checked: defChecked, outKey };
    }
    const info = pmSelectedFields[k];
    if (info.checked && parsed[k] !== undefined) {
      item[info.outKey] = parsed[k];
    }
  }
  if (document.getElementById('pmDebugMode').checked) {
    item._pm_raw_sample = JSON.stringify(data).substring(0, 2000);
    item._pm_parse_source = parsed._parseSource;
  }
  return parsed;
}

function pmUpdateProgress(done, total, ok, fail, skip) {
  document.getElementById('pmStatDone').textContent = done;
  document.getElementById('pmStatTotal').textContent = total;
  document.getElementById('pmStatOk').textContent = ok;
  document.getElementById('pmStatFail').textContent = fail;
  document.getElementById('pmStatSkip').textContent = skip;
  document.getElementById('pmProgressFill').style.width = total ? (done/total*100)+'%' : '0%';
}

async function pmRun() {
  if (pmRunning) return;
  if (!pmWorkingData) { pmLog('먼저 JSON 소스를 선택하세요.', 'err'); return; }
  const checkedCount = Object.values(pmSelectedFields).filter(s => s.checked).length;
  if (Object.keys(pmSelectedFields).length === 0) {
    pmLog('먼저 "샘플 1개 테스트"를 실행하세요.', 'err');
    return;
  }
  if (checkedCount === 0) {
    pmLog('수집할 필드를 하나 이상 선택하세요.', 'err');
    return;
  }
  pmRunning = true; pmStopFlag = false;
  document.getElementById('pmStartBtn').disabled = true;
  document.getElementById('pmStopBtn').disabled = false;

  const arr = getCafesArray(pmWorkingData);
  const idField = document.getElementById('pmIdField').value || 'id';
  const conc = parseInt(document.getElementById('pmConcurrency').value) || 2;
  const delay = parseInt(document.getElementById('pmDelay').value) || 0;
  const limit = parseInt(document.getElementById('pmLimit').value) || 0;
  const skipExisting = document.getElementById('pmSkipExisting').checked;

  const targets = [];
  for (const item of arr) {
    if (skipExisting && item.hours) continue;
    targets.push(item);
    if (limit && targets.length >= limit) break;
  }
  pmLog(`처리 대상: ${targets.length}개 (전체 ${arr.length})`, 'info');

  let done = 0, ok = 0, fail = 0, skip = arr.length - targets.length;
  pmUpdateProgress(done, targets.length, ok, fail, skip);

  let idx = 0;
  async function worker() {
    while (idx < targets.length && !pmStopFlag) {
      const my = idx++;
      const item = targets[my];
      const id = item[idField];
      try {
        const parsed = await pmProcessOne(item, idField);
        ok++;
        pmLog(`[${my+1}/${targets.length}] ✓ ${id} ${item.name||''} — ${parsed._parseSource.join(',')}`, 'ok');
      } catch(err) {
        fail++;
        pmLog(`[${my+1}/${targets.length}] ✗ ${id} — ${err.message}`, 'err');
      }
      done++;
      pmUpdateProgress(done, targets.length, ok, fail, skip);
      if (delay) await new Promise(r => setTimeout(r, delay));
    }
  }
  const workers = [];
  for (let i=0; i<conc; i++) workers.push(worker());
  await Promise.all(workers);

  pmLog(`완료: 성공 ${ok}, 실패 ${fail}, 스킵 ${skip}`, 'info');
  pmRunning = false;
  document.getElementById('pmStartBtn').disabled = false;
  document.getElementById('pmStopBtn').disabled = true;
}

document.getElementById('pmStartBtn').onclick = pmRun;
document.getElementById('pmStopBtn').onclick = () => { pmStopFlag = true; pmLog('중단 요청됨', 'warn'); };

document.getElementById('pmDownloadBtn').onclick = () => {
  if (!pmWorkingData) return;
  const blob = new Blob([JSON.stringify(pmWorkingData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const ts = new Date().toISOString().replace(/[:.]/g,'-').substring(0,19);
  a.href = URL.createObjectURL(blob);
  a.download = `placemap_enriched_${ts}.json`;
  a.click();
  pmLog('JSON 다운로드 시작', 'info');
};

document.getElementById('pmSelectAllBtn').onclick = () => {
  document.querySelectorAll('#pmFieldSelector input[type=checkbox]').forEach(cb => {
    cb.checked = true;
    const k = cb.dataset.key;
    if (pmSelectedFields[k]) pmSelectedFields[k].checked = true;
  });
  pmSaveSelection();
};
document.getElementById('pmSelectNoneBtn').onclick = () => {
  document.querySelectorAll('#pmFieldSelector input[type=checkbox]').forEach(cb => {
    cb.checked = false;
    const k = cb.dataset.key;
    if (pmSelectedFields[k]) pmSelectedFields[k].checked = false;
  });
  pmSaveSelection();
};

pmLog('place.map JSON API 모드 준비 완료. JSON 소스를 선택하고 샘플 테스트하세요.', 'info');
pmLog('API: place-api.map.kakao.com/places/panel3/{id} (헤더: appVersion=1.0.0, pf=PC)', 'info');

})();
