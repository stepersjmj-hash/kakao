// 탭 1: 장소정보 수집 (enrich)

let originalData = null;
let workingData = null;
let stopFlag = false;
let running = false;

$('fileInput').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const txt = await f.text();
    originalData = JSON.parse(txt);
    workingData = JSON.parse(JSON.stringify(originalData));
    const arr = getCafesArray(workingData);
    if (!arr) {
      $('fileInfo').textContent = '⚠ 배열을 찾지 못했습니다. JSON 구조를 확인해주세요.';
      $('startBtn').disabled = true;
      return;
    }
    $('fileInfo').innerHTML = `✓ ${f.name} — 항목 <b>${arr.length}</b>개`;
    $('startBtn').disabled = false;
    $('downloadBtn').disabled = false;
    log(`파일 로드 완료: ${arr.length}개 항목`, 'ok');
  } catch(err) {
    $('fileInfo').textContent = '✗ JSON 파싱 실패: ' + err.message;
    log('JSON 파싱 실패: ' + err.message, 'err');
  }
});


const KNOWN_FIELDS = {
  summary:        { outKey: 'description',  label: '설명 (본문)',         defaultChecked: true },
  parkingSummary: { outKey: 'parking',      label: '주차 정보',           defaultChecked: true },
  serviceOptions: { outKey: 'services',     label: '제공서비스',          defaultChecked: true },
  title:          { outKey: 'subtitle',     label: '부제목 / 한 줄 요약',  defaultChecked: true },
  mainMenus:      { outKey: 'mainMenus',    label: '대표 메뉴',           defaultChecked: true },
  seatOptions:    { outKey: 'seatOptions',  label: '좌석 옵션',           defaultChecked: true },
  childOptions:   { outKey: 'childOptions', label: '어린이 옵션',         defaultChecked: true },
  questions:      { outKey: 'questions',    label: '자주 묻는 질문',      defaultChecked: false },
  thumbnailUrl:   { outKey: 'thumbnailUrl', label: '썸네일 URL',          defaultChecked: true },
  name:           { outKey: 'kananaName',   label: '카나나 이름 (원본 name 덮어쓰기 방지)', defaultChecked: false },
  rating:         { outKey: 'kananaRating', label: '카나나 평점 (원본에 이미 있음)',        defaultChecked: false },
  reviewCount:    { outKey: 'kananaReviews', label: '카나나 리뷰수 (원본에 이미 있음)',     defaultChecked: false },
  region:         { outKey: 'region',       label: '지역(동)',            defaultChecked: false },
  appSchemes:     { outKey: 'appSchemes',   label: '앱 스키마',           defaultChecked: false },
};

let selectedFields = {}; // { poi_key: { checked, outKey } }

function loadSavedSelection() {
  try { return JSON.parse(localStorage.getItem('kakao_selectedFields') || '{}'); }
  catch(_) { return {}; }
}
function saveSelection() {
  try { localStorage.setItem('kakao_selectedFields', JSON.stringify(selectedFields)); } catch(_) {}
  updateFieldSummary();
}
function updateFieldSummary() {
  const total = Object.keys(selectedFields).length;
  const checked = Object.values(selectedFields).filter(s => s.checked).length;
  $('fieldSummary').textContent = total ? `${checked}/${total}개 선택됨` : '';
}

function renderFieldSelector(poi) {
  const container = $('fieldSelector');
  if (!poi || typeof poi !== 'object') {
    container.innerHTML = '<span style="color:#c33;">poiThreadInfo를 추출하지 못했습니다.</span>';
    return;
  }
  const saved = loadSavedSelection();
  const keys = Object.keys(poi);
  selectedFields = {};

  let html = '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:8px;text-align:left;">';
  for (const key of keys) {
    const known = KNOWN_FIELDS[key];
    const outKey = known ? known.outKey : key;
    const label = known ? known.label : '(자동 감지된 새 필드)';
    const defChecked = known ? known.defaultChecked : true;
    const checked = saved.hasOwnProperty(key) ? saved[key].checked : defChecked;
    selectedFields[key] = { checked, outKey };

    const v = poi[key];
    let preview;
    if (v == null) preview = '<i>(null)</i>';
    else if (typeof v === 'string') preview = esc(v.length > 100 ? v.substring(0,100)+'…' : v);
    else if (Array.isArray(v)) preview = `[${v.length}개] ` + esc(JSON.stringify(v).substring(0,100));
    else if (typeof v === 'object') preview = esc(JSON.stringify(v).substring(0,100));
    else preview = esc(String(v));

    const isEmpty = v == null || (Array.isArray(v) && v.length===0) || v === '';
    html += `<label style="display:flex;align-items:flex-start;gap:8px;padding:10px;border:1px solid #ddd;border-radius:4px;background:white;cursor:pointer;${isEmpty?'opacity:0.7;':''}">
      <input type="checkbox" data-key="${esc(key)}" ${checked?'checked':''} style="margin-top:3px;flex-shrink:0;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;"><b>${esc(key)}</b> <span style="color:#888;font-weight:normal;">→ ${esc(outKey)}</span></div>
        <div style="font-size:12px;color:#666;margin-top:2px;">${esc(label)}</div>
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
      if (selectedFields[k]) selectedFields[k].checked = cb.checked;
      saveSelection();
    });
  });
  saveSelection();
  log(`필드 선택 UI 렌더링 완료: ${keys.length}개 필드`, 'ok');
}

function buildUrl(id) {
  return `https://kanana.kakao.com/place/p?entry=kakaomap&cid=${encodeURIComponent(id)}&t_src=kakaomap&t_ch=pc_place`;
}

function buildProxiedUrl(id) {
  const proxy = $('proxySelect').value;
  const target = buildUrl(id);
  if (!proxy) return target;
  return proxy + encodeURIComponent(target);
}

async function fetchHtml(id) {
  const url = buildProxiedUrl(id);
  const res = await fetch(url, { headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// place.map.kakao.com 페이지 fetch (영업시간 등 SSR 데이터)
async function fetchPlaceMapHtml(id) {
  const target = `https://place.map.kakao.com/${encodeURIComponent(id)}`;
  const proxy = $('proxySelect').value;
  const url = proxy ? (proxy + encodeURIComponent(target)) : target;
  const res = await fetch(url, { headers: { 'Accept': 'text/html,*/*;q=0.8' } });
  if (!res.ok) throw new Error(`place.map HTTP ${res.status}`);
  return await res.text();
}

// place.map HTML에서 영업시간 파싱
// 반환: { status: "영업 전 07:00 오픈", weekly: { "월":"07:00 ~ 22:00", ... } }
function parsePlaceMapHours(html) {
  const result = { status: null, weekly: {} };
  try {
    const re = /<span[^>]*class="tit_detail[^"]*emph_point2[^"]*"[^>]*>\s*([^<]+?)\s*<\/span>\s*<span[^>]*class="txt_detail[^"]*"[^>]*>\s*([^<]+?)\s*<\/span>/;
    const m = html.match(re);
    if (m) result.status = (m[1].trim() + ' ' + m[2].trim()).replace(/\s+/g, ' ');
  } catch(_) {}
  try {
    const re = /<span[^>]*class="tit_fold[^"]*"[^>]*>\s*([^<]+?)\s*<\/span>\s*<div[^>]*class="detail_fold"[^>]*>\s*<span[^>]*class="txt_detail[^"]*"[^>]*>\s*([^<]+?)\s*<\/span>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      let day = m[1].trim();
      const dm = day.match(/^([월화수목금토일])/);
      if (dm) day = dm[1];
      result.weekly[day] = m[2].trim();
    }
  } catch(_) {}
  return result;
}

// 다중 파싱 전략
function parsePage(html) {
  const result = {
    description: null,
    parking: null,
    services: null,
    extra: {},
    _parseSource: []
  };

  // 0) poiThreadInfo 직접 추출 — 가장 정확한 소스 (최우선)
  try {
    const rscTextPre = extractNextFPayload(html);
    let poi = extractPoiThreadInfo(rscTextPre);
    if (!poi) poi = extractPoiThreadInfo(html);
    if (poi) {
      result._parseSource.push('poiThreadInfo');
      result.poiThreadInfo = poi;
      // description: summary > title > description
      if (poi.summary) { result.description = poi.summary; result._parseSource.push('poi.summary'); }
      else if (poi.title) { result.description = poi.title; result._parseSource.push('poi.title'); }
      else if (poi.description) { result.description = poi.description; result._parseSource.push('poi.description'); }
      // parking: parkingSummary > parking
      if (poi.parkingSummary) { result.parking = poi.parkingSummary; result._parseSource.push('poi.parkingSummary'); }
      else if (poi.parking) { result.parking = poi.parking; result._parseSource.push('poi.parking'); }
      else if (poi.parkingInfo) { result.parking = poi.parkingInfo; result._parseSource.push('poi.parkingInfo'); }
      // services: serviceOptions 최우선
      const svcKeys = ['serviceOptions','services','convenience','convenienceServices','providedServices','amenities','amenity','facility','facilities','features','tags','keywords','convenienceList','serviceList','featureList'];
      for (const k of svcKeys) {
        if (poi[k] !== undefined && poi[k] !== null) {
          result.services = poi[k];
          result._parseSource.push('poi.' + k);
          break;
        }
      }
      // 유용한 추가 필드 복사
      if (poi.title) result.subtitle = poi.title;
      if (poi.mainMenus) result.mainMenus = poi.mainMenus;
      if (poi.seatOptions) result.seatOptions = poi.seatOptions;
      if (poi.childOptions) result.childOptions = poi.childOptions;
      if (poi.questions) result.questions = poi.questions;
      if (poi.thumbnailUrl) result.thumbnailUrl = poi.thumbnailUrl;
    }
  } catch(e) { result._parseSource.push('poi.err:' + e.message); }

  // 1) JSON-LD
  try {
    const ldMatches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of ldMatches) {
      try {
        const data = JSON.parse(m[1].trim());
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item.description && !result.description) {
            result.description = item.description;
            result._parseSource.push('jsonld.description');
          }
          if (item.amenityFeature) result.extra.amenities = item.amenityFeature;
        }
      } catch(_) {}
    }
  } catch(_) {}

  // 2) __NEXT_DATA__ / 임베디드 state
  try {
    const nextMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
    if (nextMatch) {
      try {
        const data = JSON.parse(nextMatch[1]);
        result._parseSource.push('next_data');
        // 깊이 탐색
        const found = deepFindKakaoFields(data);
        Object.assign(result.extra, found.extra);
        if (!result.description && found.description) { result.description = found.description; result._parseSource.push('next.description'); }
        if (!result.parking && found.parking) { result.parking = found.parking; result._parseSource.push('next.parking'); }
        if (!result.services && found.services) { result.services = found.services; result._parseSource.push('next.services'); }
      } catch(_) {}
    }
  } catch(_) {}

  // 3) window.__INITIAL_STATE__ / __PRELOADED_STATE__
  try {
    const stateRegexes = [
      /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});\s*<\/script>/,
      /window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});\s*<\/script>/,
      /window\.__APOLLO_STATE__\s*=\s*({[\s\S]*?});\s*<\/script>/,
      /__NUXT__\s*=\s*({[\s\S]*?});\s*<\/script>/,
    ];
    for (const re of stateRegexes) {
      const m = html.match(re);
      if (m) {
        try {
          const data = JSON.parse(m[1]);
          result._parseSource.push('window_state');
          const found = deepFindKakaoFields(data);
          if (!result.description && found.description) result.description = found.description;
          if (!result.parking && found.parking) result.parking = found.parking;
          if (!result.services && found.services) result.services = found.services;
          Object.assign(result.extra, found.extra);
        } catch(_) {}
      }
    }
  } catch(_) {}

  // 4) Open Graph / 메타 description
  try {
    const og = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    if (og && !result.description) {
      result.description = og[1];
      result._parseSource.push('og:description');
    }
    const md = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    if (md && !result.description) {
      result.description = md[1];
      result._parseSource.push('meta.description');
    }
  } catch(_) {}

  // 4.5) Next.js RSC 스트림 (self.__next_f.push) — App Router의 핵심 데이터
  try {
    const rscText = extractNextFPayload(html);
    if (rscText) {
      result._parseSource.push('rsc.payload(' + rscText.length + ')');
      const found = parseRscForFields(rscText);
      if (!result.description && found.description) { result.description = found.description; result._parseSource.push('rsc.description'); }
      if (!result.parking && found.parking) { result.parking = found.parking; result._parseSource.push('rsc.parking'); }
      if (!result.services && found.services) { result.services = found.services; result._parseSource.push('rsc.services'); }
      if (found.extra && Object.keys(found.extra).length) Object.assign(result.extra, found.extra);
    }
  } catch(e) { result._parseSource.push('rsc.err:'+e.message); }

  // 5) DOM 휴리스틱: "주차", "제공서비스" 키워드 주변 텍스트
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    if (!result.parking) {
      const pk = findByKeyword(doc, ['주차', 'parking']);
      if (pk) { result.parking = pk; result._parseSource.push('dom.parking'); }
    }
    if (!result.services) {
      const sv = findByKeyword(doc, ['제공서비스', '편의시설', '서비스']);
      if (sv) { result.services = sv; result._parseSource.push('dom.services'); }
    }
    if (!result.description) {
      const desc = findByKeyword(doc, ['소개', '설명', '안내']);
      if (desc) { result.description = desc; result._parseSource.push('dom.description'); }
    }
  } catch(_) {}

  return result;
}

function findByKeyword(doc, keywords) {
  // dt/th/strong/label 기준으로 키워드 찾고 인접 형제/부모의 dd/td 추출
  const tags = ['dt','th','strong','label','h3','h4','span','div'];
  for (const tag of tags) {
    const els = doc.getElementsByTagName(tag);
    for (const el of els) {
      const txt = (el.textContent || '').trim();
      if (txt.length > 30) continue;
      for (const kw of keywords) {
        if (txt === kw || txt.replace(/\s/g,'') === kw) {
          // 같은 행의 dd/td/span 찾기
          let val = null;
          if (tag === 'dt') {
            let nxt = el.nextElementSibling;
            while (nxt && nxt.tagName !== 'DD') nxt = nxt.nextElementSibling;
            if (nxt) val = nxt.textContent.trim();
          } else if (tag === 'th') {
            const tr = el.closest('tr');
            if (tr) {
              const td = tr.querySelector('td');
              if (td) val = td.textContent.trim();
            }
          } else {
            const sib = el.nextElementSibling;
            if (sib) val = sib.textContent.trim();
            else if (el.parentElement) {
              const p = el.parentElement;
              const all = p.textContent.trim();
              val = all.replace(txt, '').trim();
            }
          }
          if (val && val.length < 500) return val;
        }
      }
    }
  }
  return null;
}

// "poiThreadInfo":{ ... } 객체를 괄호 매칭으로 정확히 추출
function extractPoiThreadInfo(text) {
  if (!text) return null;
  const marker = '"poiThreadInfo":';
  const idx = text.indexOf(marker);
  if (idx < 0) return null;
  let i = idx + marker.length;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== '{') return null;
  const start = i;
  let depth = 0, inStr = false, esc = false;
  for (; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  const jsonStr = text.substring(start, i);
  try { return JSON.parse(jsonStr); }
  catch(_) {
    // 이스케이프된 JSON일 수 있음 (HTML 안에서 \" 형태)
    try { return JSON.parse(JSON.parse('"' + jsonStr.replace(/"/g,'\\"').replace(/\\\\"/g,'\\"') + '"')); }
    catch(_) { return null; }
  }
}

// Next.js App Router RSC 스트림 추출
// HTML 내의 self.__next_f.push([1, "..."]) 호출들을 모아 하나의 페이로드로 합침
function extractNextFPayload(html) {
  const pushes = [];
  // self.__next_f.push([1,"...."]) 패턴, 두 번째 인자가 문자열인 것만 수집
  const re = /self\.__next_f\.push\(\[\s*1\s*,\s*"((?:\\.|[^"\\])*)"\s*\]\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      // 따옴표 안의 내용을 JSON 문자열로 다시 파싱하여 escape 해제
      const decoded = JSON.parse('"' + m[1] + '"');
      pushes.push(decoded);
    } catch(_) {
      pushes.push(m[1]);
    }
  }
  return pushes.join('');
}

// RSC 페이로드 텍스트에서 필드 찾기
// 페이로드는 "0:["$L1"]\n1:I[...]\n2:["$","div",{"children":...}]\n..." 형태
// JSON 객체들이 줄마다 들어있어, 각 줄을 시도해보고 깊이 탐색
function parseRscForFields(rscText) {
  const found = { description: null, parking: null, services: null, extra: {} };
  // 줄 단위로 분리하여 각각 JSON 파싱 시도
  const lines = rscText.split('\n');
  for (const line of lines) {
    // "숫자:" 접두사 제거
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const body = line.substring(idx+1);
    if (!body || (body[0] !== '[' && body[0] !== '{')) continue;
    try {
      const data = JSON.parse(body);
      const f = deepFindKakaoFields(data);
      if (!found.description && f.description) found.description = f.description;
      if (!found.parking && f.parking) found.parking = f.parking;
      if (!found.services && f.services) found.services = f.services;
      if (f.extra) Object.assign(found.extra, f.extra);
    } catch(_) { /* 부분 JSON일 수 있음 */ }
  }
  return found;
}

function deepFindKakaoFields(obj, depth=0, found=null) {
  if (!found) found = { description: null, parking: null, services: null, extra: {} };
  if (depth > 12 || !obj) return found;
  if (typeof obj !== 'object') return found;

  const descKeys = ['description', 'desc', 'introduce', 'intro', 'mainphotourl_intro', 'businessIntroduction', 'comment'];
  const parkKeys = ['parking', 'parkingInfo', 'parking_info', 'park'];
  const svcKeys = ['services', 'service', 'amenity', 'amenities', 'facility', 'facilities', 'convenience', 'conveniences', 'tags'];

  if (!Array.isArray(obj)) {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const lk = k.toLowerCase();
      if (!found.description && descKeys.includes(lk) && typeof v === 'string' && v.length > 5 && v.length < 2000) {
        found.description = v;
      }
      if (!found.parking && parkKeys.includes(lk)) {
        if (typeof v === 'string') found.parking = v;
        else if (typeof v === 'object') found.parking = JSON.stringify(v);
      }
      if (!found.services && svcKeys.includes(lk)) {
        if (Array.isArray(v)) found.services = v;
        else if (typeof v === 'string') found.services = v;
        else if (typeof v === 'object') found.services = v;
      }
    }
  }

  for (const k in obj) {
    const v = obj[k];
    if (v && typeof v === 'object') deepFindKakaoFields(v, depth+1, found);
  }
  return found;
}

async function processOne(item, idField) {
  const id = item[idField];
  if (!id) throw new Error('id 없음');
  const html = await fetchHtml(id);
  const parsed = parsePage(html);
  const poi = parsed.poiThreadInfo;

  // 사용자가 선택한 필드만 출력 JSON에 추가
  if (poi && Object.keys(selectedFields).length) {
    for (const [k, info] of Object.entries(selectedFields)) {
      if (!info.checked) continue;
      if (poi[k] !== undefined) item[info.outKey] = poi[k];
    }
    // 새로 발견된 필드 (selectedFields에 없는) — 기본 체크 처리
    for (const k of Object.keys(poi)) {
      if (!selectedFields.hasOwnProperty(k)) {
        const known = KNOWN_FIELDS[k];
        const outKey = known ? known.outKey : k;
        const defChecked = known ? known.defaultChecked : true;
        selectedFields[k] = { checked: defChecked, outKey };
        if (defChecked) item[outKey] = poi[k];
      }
    }
  }

  if ($('debugMode').checked) {
    item._raw_snippet = html.substring(0, 2000);
    item._parse_source = parsed._parseSource;
    if (poi) item._poi_full = poi;
  }
  return parsed;
}

function updateProgress(done, total, ok, fail, skip) {
  $('statDone').textContent = done;
  $('statTotal').textContent = total;
  $('statOk').textContent = ok;
  $('statFail').textContent = fail;
  $('statSkip').textContent = skip;
  $('progressFill').style.width = total ? (done/total*100)+'%' : '0%';
}

function renderPreview() {
  const arr = getCafesArray(workingData);
  if (!arr) return;
  const enriched = arr.filter(x => x.description || x.parking || x.services).slice(-10);
  if (enriched.length === 0) { $('preview').innerHTML = '<div style="color:#888;font-size:13px;">아직 결과 없음</div>'; return; }
  let h = '<table><thead><tr><th>이름</th><th>설명</th><th>주차</th><th>제공서비스</th></tr></thead><tbody>';
  for (const it of enriched) {
    h += `<tr>
      <td>${esc(it.name||it[$('idField').value]||'')}</td>
      <td>${esc(truncate(it.description, 200))}</td>
      <td>${esc(truncate(it.parking, 100))}</td>
      <td>${esc(truncate(typeof it.services==='string'?it.services:JSON.stringify(it.services||''), 200))}</td>
    </tr>`;
  }
  h += '</tbody></table>';
  $('preview').innerHTML = h;
}

async function runEnrich() {
  if (running) return;
  // 필드 선택 검증
  const checkedCount = Object.values(selectedFields).filter(s => s.checked).length;
  if (Object.keys(selectedFields).length === 0) {
    log('먼저 "샘플 1개 테스트"를 실행하여 수집 필드를 확인하고 선택하세요.', 'err');
    return;
  }
  if (checkedCount === 0) {
    log('수집할 필드가 하나도 선택되지 않았습니다. 위 카드에서 필드를 선택하세요.', 'err');
    return;
  }
  running = true; stopFlag = false;
  $('startBtn').disabled = true;
  $('stopBtn').disabled = false;

  const arr = getCafesArray(workingData);
  const idField = $('idField').value || 'id';
  const conc = parseInt($('concurrency').value)||3;
  const delay = parseInt($('delay').value)||0;
  const limit = parseInt($('limit').value)||0;
  const skipExisting = $('skipExisting').checked;

  const targets = [];
  for (const item of arr) {
    if (skipExisting && item.description) continue;
    targets.push(item);
    if (limit && targets.length >= limit) break;
  }
  log(`처리 대상: ${targets.length}개 (전체 ${arr.length})`, 'info');

  let done = 0, ok = 0, fail = 0, skip = arr.length - targets.length;
  updateProgress(done, targets.length, ok, fail, skip);

  // 동시 요청 풀
  let idx = 0;
  async function worker() {
    while (idx < targets.length && !stopFlag) {
      const my = idx++;
      const item = targets[my];
      const id = item[idField];
      try {
        await processOne(item, idField);
        ok++;
        log(`[${my+1}/${targets.length}] ✓ ${id} ${item.name||''} — desc:${item.description?'O':'X'} park:${item.parking?'O':'X'} svc:${item.services?'O':'X'}`, 'ok');
      } catch(err) {
        fail++;
        log(`[${my+1}/${targets.length}] ✗ ${id} — ${err.message}`, 'err');
      }
      done++;
      updateProgress(done, targets.length, ok, fail, skip);
      if (delay) await new Promise(r=>setTimeout(r, delay));
      if (done % 5 === 0) renderPreview();
    }
  }
  const workers = [];
  for (let i=0; i<conc; i++) workers.push(worker());
  await Promise.all(workers);

  renderPreview();
  log(`완료: 성공 ${ok}, 실패 ${fail}, 스킵 ${skip}`, 'info');
  running = false;
  $('startBtn').disabled = false;
  $('stopBtn').disabled = true;
}

$('startBtn').onclick = runEnrich;
$('stopBtn').onclick = () => { stopFlag = true; log('중단 요청됨', 'warn'); };

$('downloadBtn').onclick = () => {
  if (!workingData) return;
  const blob = new Blob([JSON.stringify(workingData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const ts = new Date().toISOString().replace(/[:.]/g,'-').substring(0,19);
  a.href = URL.createObjectURL(blob);
  a.download = `enriched_${ts}.json`;
  a.click();
  log('JSON 다운로드 시작', 'info');
};

$('testBtn').onclick = async () => {
  const testId = '4718442'; // 커피빈 용인역북점
  const expectedName = '커피빈 용인역북점';
  log(`테스트 시작: id=${testId} (예상 카페명: "${expectedName}")`, 'info');
  try {
    const html = await fetchHtml(testId);
    log(`HTML 수신: ${html.length.toLocaleString()} bytes`, 'ok');

    // 1) 카페명이 HTML에 들어있는지
    const nameInHtml = html.includes(expectedName);
    log(`카페명 "${expectedName}" HTML 포함 여부: ${nameInHtml ? '✓ 있음' : '✗ 없음'}`, nameInHtml?'ok':'warn');

    // 2) 핵심 키워드 카운트
    const kws = ['주차','제공서비스','편의시설','소개','description','parking','service','amenity'];
    const counts = kws.map(k => `${k}:${(html.match(new RegExp(k,'gi'))||[]).length}`).join(' / ');
    log(`키워드 출현 횟수 — ${counts}`, 'info');

    // 3) __next_f.push 페이로드 통계
    const nextFCount = (html.match(/self\.__next_f\.push/g)||[]).length;
    log(`self.__next_f.push 호출: ${nextFCount}개`, 'info');
    const rscText = extractNextFPayload(html);
    log(`RSC 페이로드 합산 길이: ${rscText.length.toLocaleString()} chars`, 'info');

    // 4) RSC 안에 카페명이 있는지
    if (rscText.length) {
      const inRsc = rscText.includes(expectedName);
      log(`RSC 페이로드 내 카페명 포함 여부: ${inRsc ? '✓ 있음' : '✗ 없음'}`, inRsc?'ok':'warn');
      if (inRsc) {
        const i = rscText.indexOf(expectedName);
        const snippet = rscText.substring(Math.max(0,i-150), i+250);
        log(`RSC 카페명 주변 발췌:\n${snippet}`, 'info');
      }
    }

    // 5) 키워드 주변 컨텍스트
    for (const kw of ['주차','제공서비스','편의시설','소개']) {
      const i = html.indexOf(kw);
      if (i >= 0) {
        const snippet = html.substring(Math.max(0,i-100), i+200).replace(/\s+/g,' ');
        log(`"${kw}" 주변 발췌 (pos ${i}):\n${snippet}`, 'info');
      }
    }

    // 6) poiThreadInfo 직접 추출하여 모든 키 보기
    const poi = extractPoiThreadInfo(rscText) || extractPoiThreadInfo(html);
    if (poi) {
      log(`✓ poiThreadInfo 추출 성공 — 키 목록: ${Object.keys(poi).join(', ')}`, 'ok');
      for (const k of Object.keys(poi)) {
        const v = poi[k];
        let preview;
        if (v == null) preview = String(v);
        else if (typeof v === 'string') preview = v.length > 200 ? v.substring(0,200)+'…' : v;
        else if (Array.isArray(v)) preview = `[Array len=${v.length}] ${JSON.stringify(v).substring(0,300)}`;
        else if (typeof v === 'object') preview = JSON.stringify(v).substring(0,300);
        else preview = String(v);
        log(`  ${k}: ${preview}`, 'info');
      }
    } else {
      log(`✗ poiThreadInfo 추출 실패`, 'warn');
    }

    // 7) 최종 파싱 결과
    const parsed = parsePage(html);
    log(`최종 파싱 결과:\n${JSON.stringify(parsed, null, 2)}`, parsed.description||parsed.parking||parsed.services?'ok':'warn');

    // 8) 필드 선택 UI 렌더링
    if (poi) renderFieldSelector(poi);

  } catch(err) {
    log('테스트 실패: ' + err.message, 'err');
  }
};


$('selectAllBtn').onclick = () => {
  document.querySelectorAll('#fieldSelector input[type=checkbox]').forEach(cb => {
    cb.checked = true;
    const k = cb.dataset.key;
    if (selectedFields[k]) selectedFields[k].checked = true;
  });
  saveSelection();
};
$('selectNoneBtn').onclick = () => {
  document.querySelectorAll('#fieldSelector input[type=checkbox]').forEach(cb => {
    cb.checked = false;
    const k = cb.dataset.key;
    if (selectedFields[k]) selectedFields[k].checked = false;
  });
  saveSelection();
};
