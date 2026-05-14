// ============================================================
// 카카오 place.map 데이터 수집 — 콘솔 스크립트
// ============================================================
// 사용법:
//   1. 브라우저에서 https://place.map.kakao.com/4718442 같은 페이지 한 번 접속
//   2. F12 → 콘솔 탭
//   3. 이 파일 내용 전체를 복사해 콘솔에 붙여넣고 Enter
//   4. 페이지 우측에 떠있는 패널에서 JSON 업로드 → 테스트 → 수집 → 다운로드
// ============================================================

(() => {
  'use strict';
  if (window.__KAKAO_CONSOLE_INJECTED__) {
    console.warn('이미 패널이 떠있습니다. 새로고침 후 다시 붙여넣으세요.');
    return;
  }
  window.__KAKAO_CONSOLE_INJECTED__ = true;

  // --------------------------------------------------------
  // 1) UI 패널 주입
  // --------------------------------------------------------
  const panel = document.createElement('div');
  panel.id = 'kkc-panel';
  panel.style.cssText = `
    position: fixed; top: 20px; right: 20px; width: 480px; max-height: 92vh;
    background: #fff; border: 1px solid #ccc; border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.25); z-index: 999999;
    font-family: -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
    font-size: 13px; color: #222; overflow: hidden; display: flex; flex-direction: column;
  `;
  panel.innerHTML = `
    <div id="kkc-head" style="background:#fee500;color:#000;padding:10px 14px;font-weight:bold;cursor:move;display:flex;justify-content:space-between;align-items:center;">
      <span>카카오 place.map 수집기</span>
      <span>
        <button id="kkc-min" style="border:0;background:transparent;cursor:pointer;font-size:16px;padding:0 6px;">_</button>
        <button id="kkc-close" style="border:0;background:transparent;cursor:pointer;font-size:16px;padding:0 6px;">×</button>
      </span>
    </div>
    <div id="kkc-body" style="padding:12px;overflow:auto;flex:1;">
      <div style="margin-bottom:10px;">
        <label style="display:block;font-weight:bold;margin-bottom:4px;">1. JSON 파일</label>
        <input type="file" id="kkc-file" accept=".json,application/json" style="width:100%;font-size:12px;">
        <div id="kkc-fileinfo" style="font-size:11px;color:#666;margin-top:4px;"></div>
      </div>

      <div style="margin-bottom:10px;">
        <label style="display:block;font-weight:bold;margin-bottom:4px;">2. 옵션</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;">
          <label>동시 요청<input type="number" id="kkc-conc" value="3" min="1" max="10" style="width:60px;margin-left:6px;"></label>
          <label>대기(ms)<input type="number" id="kkc-delay" value="100" min="0" max="3000" style="width:70px;margin-left:6px;"></label>
          <label>제한(0=전체)<input type="number" id="kkc-limit" value="0" min="0" style="width:60px;margin-left:6px;"></label>
          <label>id필드<input type="text" id="kkc-idfield" value="id" style="width:60px;margin-left:6px;"></label>
          <label>appVersion<input type="text" id="kkc-appver" value="1.0.0" style="width:60px;margin-left:6px;"></label>
        </div>
        <div style="margin-top:6px;font-size:12px;">
          <label><input type="checkbox" id="kkc-skip"> 이미 hours가 있으면 건너뛰기</label><br>
          <label><input type="checkbox" id="kkc-debug"> 디버그 (raw API 응답 일부 저장)</label>
        </div>
      </div>

      <div style="margin-bottom:10px;">
        <label style="display:block;font-weight:bold;margin-bottom:4px;">3. 수집 필드</label>
        <div style="margin-bottom:6px;">
          <button id="kkc-test" style="padding:5px 10px;background:#555;color:#fff;border:0;border-radius:4px;cursor:pointer;font-size:12px;">샘플 1개 테스트</button>
          <button id="kkc-all" style="padding:5px 10px;background:#888;color:#fff;border:0;border-radius:4px;cursor:pointer;font-size:12px;">전체 선택</button>
          <button id="kkc-none" style="padding:5px 10px;background:#888;color:#fff;border:0;border-radius:4px;cursor:pointer;font-size:12px;">전체 해제</button>
          <span id="kkc-fsum" style="margin-left:8px;color:#666;font-size:11px;"></span>
        </div>
        <div id="kkc-fields" style="font-size:11px;color:#888;padding:8px;border:1px dashed #ccc;border-radius:4px;text-align:center;">
          샘플 테스트 후 필드 목록이 표시됩니다.
        </div>
      </div>

      <div style="margin-bottom:10px;">
        <label style="display:block;font-weight:bold;margin-bottom:4px;">4. 실행</label>
        <button id="kkc-start" disabled style="padding:6px 14px;background:#fee500;color:#000;border:0;border-radius:4px;cursor:pointer;font-weight:bold;font-size:13px;">수집 시작</button>
        <button id="kkc-stop" disabled style="padding:6px 14px;background:#c33;color:#fff;border:0;border-radius:4px;cursor:pointer;font-size:13px;">중단</button>
        <button id="kkc-dl" disabled style="padding:6px 14px;background:#555;color:#fff;border:0;border-radius:4px;cursor:pointer;font-size:13px;">JSON 다운로드</button>
        <div style="margin-top:8px;">
          <div style="width:100%;height:14px;background:#eee;border-radius:7px;overflow:hidden;">
            <div id="kkc-prog" style="width:0%;height:100%;background:#fee500;transition:width 0.2s;"></div>
          </div>
          <div style="margin-top:4px;font-size:11px;">
            <span>진행 <b id="kkc-done">0</b>/<b id="kkc-total">0</b></span>
            <span style="color:#2a8;margin-left:8px;">성공 <b id="kkc-ok">0</b></span>
            <span style="color:#c33;margin-left:8px;">실패 <b id="kkc-fail">0</b></span>
            <span style="color:#888;margin-left:8px;">스킵 <b id="kkc-skipn">0</b></span>
          </div>
        </div>
      </div>

      <div>
        <label style="display:block;font-weight:bold;margin-bottom:4px;">로그</label>
        <div id="kkc-log" style="background:#1e1e1e;color:#ddd;font-family:Consolas,monospace;font-size:11px;padding:8px;border-radius:4px;max-height:200px;overflow:auto;white-space:pre-wrap;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const $ = id => document.getElementById(id);
  function log(msg, cls='') {
    const el = $('kkc-log');
    const div = document.createElement('div');
    const color = cls==='ok' ? '#6dd16d' : cls==='err' ? '#ff7777' : cls==='warn' ? '#ffd166' : cls==='info' ? '#79b8ff' : '#ddd';
    div.style.color = color;
    const t = new Date().toLocaleTimeString();
    div.textContent = `[${t}] ${msg}`;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }

  // 드래그
  (() => {
    const head = $('kkc-head');
    let dragging = false, sx=0, sy=0, ox=0, oy=0;
    head.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY;
      ox = rect.left; oy = rect.top;
      panel.style.right = 'auto'; panel.style.left = rect.left+'px';
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      panel.style.left = (ox + e.clientX - sx) + 'px';
      panel.style.top = (oy + e.clientY - sy) + 'px';
    });
    window.addEventListener('mouseup', () => dragging = false);
  })();

  // 최소화 / 닫기
  $('kkc-min').onclick = () => {
    const body = $('kkc-body');
    body.style.display = body.style.display === 'none' ? '' : 'none';
  };
  $('kkc-close').onclick = () => {
    panel.remove();
    window.__KAKAO_CONSOLE_INJECTED__ = false;
    log('패널 닫힘. 다시 띄우려면 스크립트 재실행.', 'info');
  };

  // --------------------------------------------------------
  // 2) 알려진 필드 정의 (enrich_cafes의 placemap.js와 동일 매핑)
  // --------------------------------------------------------
  const KNOWN = {
    hours:               { outKey:'hours',               label:'영업시간 (status + 요일별)',      def:true },
    hoursAll:            { outKey:'hoursAll',            label:'영업시간 전체 (휴무일 포함)',      def:false },
    homepageUrl:         { outKey:'homepageUrl',         label:'홈페이지 URL',                     def:true },
    facilities:          { outKey:'facilities',          label:'시설정보 (반려견/포장/배달 등)',   def:true },
    tags:                { outKey:'tags',                label:'태그 (#대형카페 등)',              def:true },
    panelTags:           { outKey:'panelTags',           label:'패널 태그',                        def:false },
    menus:               { outKey:'menus',               label:'메뉴 (이름/가격/설명)',            def:true },
    parkingInfo:         { outKey:'parkingInfo',         label:'주차 정보',                        def:true },
    subwayInfo:          { outKey:'subwayInfo',          label:'지하철 출구',                      def:true },
    ratingDetails:       { outKey:'ratingDetails',       label:'별점 상세 (맛/분위기/주차/가성비/친절)', def:true },
    aiSummary:           { outKey:'aiSummary',           label:'AI 요약 (kanana)',                 def:false },
    aiQuestions:         { outKey:'aiQuestions',         label:'AI 자주묻는질문',                  def:false },
    blogSummaries:       { outKey:'blogSummaries',       label:'블로그 요약',                      def:false },
    detailInfos:         { outKey:'detailInfos',         label:'상세 정보 (full)',                 def:false },
    simpleInfos:         { outKey:'simpleInfos',         label:'간단 상세',                        def:false },
    thumbnail:           { outKey:'thumbnail',           label:'대표 썸네일 URL',                  def:true },
    photoCount:          { outKey:'photoCount',          label:'사진 수',                          def:false },
    blogReviewCount:     { outKey:'blogReviewCount',     label:'블로그 리뷰 수',                   def:false },
    kakaomapReviewCount: { outKey:'kakaomapReviewCount', label:'카카오맵 리뷰 수',                 def:false },
    visitorStats:        { outKey:'visitorStats',        label:'요일별 방문자',                    def:false },
    payments:            { outKey:'payments',            label:'결제 수단',                        def:false },
    region:              { outKey:'regionPm',            label:'지역',                             def:false },
    priceLevel:          { outKey:'priceLevel',          label:'가격대',                           def:false },
    phone:               { outKey:'phone',               label:'전화번호 (기존 phone 덮어쓰기)',   def:true },
  };

  // --------------------------------------------------------
  // 3) 파서
  // --------------------------------------------------------
  function parsePanel3(d) {
    const r = { _src: [] };
    if (!d || typeof d !== 'object') return r;

    try {
      const oh = d.open_hours;
      if (oh) {
        // headline: { code, display_text, display_text_info }
        const h = oh.headline;
        let status = null;
        if (h) {
          const parts = [h.display_text, h.display_text_info, h.text, h.headline].filter(x => x);
          status = parts.length ? parts.join(' ') : null;
        }

        // 요일별: open_hours.week_from_today.week_periods[*].days[*]
        const weekly = {};
        const wft = oh.week_from_today;
        const periods = Array.isArray(wft?.week_periods) ? wft.week_periods : [];
        for (const period of periods) {
          const days = Array.isArray(period?.days) ? period.days : [];
          for (const day of days) {
            const desc = day.day_of_the_week_desc || day.day_of_week || day.day_desc || day.day;
            // 시간 추출: on_days 또는 off_days
            let timeText = null;
            const od = day.on_days || day.business_hours || day.open_time;
            if (od) {
              // on_days 구조 후보: 단일 객체 또는 배열
              const items = Array.isArray(od) ? od : [od];
              const parts = items.map(o => {
                if (typeof o === 'string') return o;
                // 1순위: start_end_time_desc (단일 문자열)
                if (o.start_end_time_desc) return o.start_end_time_desc;
                if (o.display_text) return o.display_text;
                if (o.text) return o.text;
                // 2순위: start + end 조합
                const s = o.start_time || o.start_en_time || o.start || o.from || o.open_time;
                const e = o.end_time || o.end_en_time || o.end || o.to || o.close_time;
                if (s && e) return `${s} ~ ${e}`;
                return null;
              }).filter(x => x);
              if (parts.length) timeText = parts.join(', ');
            }
            if (!timeText && day.off_days) timeText = '휴무';
            if (!timeText) timeText = day.display_text || day.text;

            if (desc && timeText) {
              const dm = String(desc).match(/^([월화수목금토일])/);
              weekly[dm ? dm[1] : desc] = timeText;
            }
          }
        }

        // 옛 구조 (week_from_today가 배열인 경우) 호환
        if (!Object.keys(weekly).length && Array.isArray(wft)) {
          for (const day of wft) {
            const dn = day.day_of_the_week_desc || day.day_of_week || day.day || day.name;
            const tt = day.display_text || day.text ||
                       (day.start_time && day.end_time ? `${day.start_time} ~ ${day.end_time}` : null);
            if (dn && tt) {
              const dm = String(dn).match(/^([월화수목금토일])/);
              weekly[dm ? dm[1] : dn] = tt;
            }
          }
        }

        if (status || Object.keys(weekly).length) {
          r.hours = { status, weekly };
          r._src.push('hours');
        }
        if (oh.all) { r.hoursAll = oh.all; r._src.push('hoursAll'); }
      }
    } catch(e) { r._hoursErr = e.message; }

    try {
      const hp = d.summary?.homepages;
      if (Array.isArray(hp) && hp.length) {
        const f = hp[0];
        r.homepageUrl = typeof f === 'string' ? f : (f.url || f.href || f.value || null);
        if (r.homepageUrl) r._src.push('homepageUrl');
      }
    } catch(_) {}

    try {
      const fac = d.place_add_info?.facilities;
      if (Array.isArray(fac) && fac.length) {
        const names = fac.map(f => typeof f==='string' ? f : (f.name||f.title||f.label||f.text)).filter(x=>x);
        r.facilities = names.length ? names : fac;
        r._src.push('facilities');
      }
    } catch(_) {}

    try {
      const tags = d.place_add_info?.tags;
      if (Array.isArray(tags) && tags.length) {
        const names = tags.map(t => typeof t==='string' ? t : (t.name||t.label||t.text||t.title)).filter(x=>x);
        r.tags = names.length ? names : tags;
        r._src.push('tags');
      }
    } catch(_) {}

    try {
      const card = d.panel_card_tags || [], tab = d.panel_tab_tags || [];
      if (card.length || tab.length) {
        const ex = arr => arr.map(t => typeof t==='string' ? t : (t.name||t.label||t.text||t.title)).filter(x=>x);
        r.panelTags = { card: ex(card), tab: ex(tab) };
        r._src.push('panelTags');
      }
    } catch(_) {}

    try {
      const items = d.menu?.menus?.items;
      if (Array.isArray(items) && items.length) {
        r.menus = items.map(m => ({ name:m.name, price:m.price, is_recommend:m.is_recommend, recommend_reasons:m.recommend_reasons, ai_mate_desc:m.ai_mate_desc, is_ai_mate:m.is_ai_mate }));
        r._src.push('menus');
      }
    } catch(_) {}

    try { const pk = d.place_add_info?.simple_parking_infos; if (pk) { r.parkingInfo = pk; r._src.push('parkingInfo'); } } catch(_) {}
    try { const sub = d.find_way?.subway; if (sub) { r.subwayInfo = sub; r._src.push('subwayInfo'); } } catch(_) {}
    try { const ss = d.kakaomap_review?.score_set; if (ss) { r.ratingDetails = ss; r._src.push('ratingDetails'); } } catch(_) {}
    try { const ai = d.ai_mate?.summary; if (ai) { r.aiSummary = ai; r._src.push('aiSummary'); } } catch(_) {}
    try { const aq = d.ai_mate?.ai_questions; if (Array.isArray(aq) && aq.length) { r.aiQuestions = aq; r._src.push('aiQuestions'); } } catch(_) {}
    try { const bs = d.ai_mate?.blog_summaries; if (bs) { r.blogSummaries = bs; r._src.push('blogSummaries'); } } catch(_) {}
    try { const pl = d.ai_mate?.price_level; if (pl) { r.priceLevel = pl; r._src.push('priceLevel'); } } catch(_) {}
    try { const fd = d.place_add_info?.full_detail_infos; if (fd) { r.detailInfos = fd; r._src.push('detailInfos'); } } catch(_) {}
    try { const sd = d.place_add_info?.simple_detail_infos; if (sd) { r.simpleInfos = sd; r._src.push('simpleInfos'); } } catch(_) {}
    try {
      // 대표 썸네일: 1순위 my_store_notice.main_photo_url, 2순위 photos.photos[0].url
      let thumb = d.my_store_notice?.main_photo_url;
      if (!thumb) {
        const ph = d.photos?.photos;
        if (Array.isArray(ph) && ph.length) {
          const f = ph[0];
          thumb = typeof f === 'string' ? f : (f?.url || null);
        }
      }
      if (thumb) { r.thumbnail = thumb; r._src.push('thumbnail'); }
    } catch(_) {}
    try { const pc = d.photos?.counts; if (pc) { r.photoCount = pc; r._src.push('photoCount'); } } catch(_) {}
    try { const brc = d.blog_review?.review_count; if (brc != null) { r.blogReviewCount = brc; r._src.push('blogReviewCount'); } } catch(_) {}
    try { const krc = d.kakaomap_review?.review_count || d.kakaomap_review?.reviews?.length; if (krc != null) { r.kakaomapReviewCount = krc; r._src.push('kakaomapReviewCount'); } } catch(_) {}
    try {
      const v = d.visitor;
      if (v) {
        r.visitorStats = { weekly_average:v.weekly_uv_average, monday:v.monday_uv, tuesday:v.tuesday_uv, wednesday:v.wednesday_uv, thursday:v.thursday_uv, friday:v.friday_uv, saturday:v.saturday_uv, sunday:v.sunday_uv, labels:v.labels, updated_at:v.updated_at };
        r._src.push('visitorStats');
      }
    } catch(_) {}
    try { const p = d.summary?.payments; if (p && (Array.isArray(p) ? p.length : Object.keys(p).length)) { r.payments = p; r._src.push('payments'); } } catch(_) {}
    try { const reg = d.summary?.regions; if (reg) { r.region = reg; r._src.push('region'); } } catch(_) {}

    // 전화번호 (summary.phone_numbers) — 기존 phone 필드 덮어쓰기
    try {
      const pn = d.summary?.phone_numbers;
      if (pn) {
        let phoneVal = null;
        if (typeof pn === 'string') {
          phoneVal = pn;
        } else if (Array.isArray(pn) && pn.length) {
          const first = pn[0];
          if (typeof first === 'string') phoneVal = first;
          else if (first && typeof first === 'object') {
            phoneVal = first.tel || first.number || first.phone || first.value || first.text || first.display_text;
          }
        } else if (typeof pn === 'object') {
          phoneVal = pn.tel || pn.number || pn.phone || pn.value || pn.text || pn.display_text;
        }
        if (phoneVal) {
          r.phone = phoneVal;
          r._src.push('phone');
        }
      }
    } catch(_) {}

    return r;
  }

  // --------------------------------------------------------
  // 4) fetch (kakao origin, custom 헤더 OK)
  // --------------------------------------------------------
  async function fetchPanel3(id) {
    const appVer = $('kkc-appver').value || '1.0.0';
    const res = await fetch(`https://place-api.map.kakao.com/places/panel3/${encodeURIComponent(id)}`, {
      credentials: 'include',
      headers: { 'Accept': 'application/json, text/plain, */*', 'appVersion': appVer, 'pf': 'PC' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  // --------------------------------------------------------
  // 5) 상태 / 필드 선택
  // --------------------------------------------------------
  let workingData = null;
  let stopFlag = false, running = false;
  let selected = {};

  function loadSel() { try { return JSON.parse(localStorage.getItem('kakao_console_selectedFields')||'{}'); } catch(_){ return {}; } }
  function saveSel() {
    try { localStorage.setItem('kakao_console_selectedFields', JSON.stringify(selected)); } catch(_){}
    const total = Object.keys(selected).length;
    const ch = Object.values(selected).filter(s=>s.checked).length;
    $('kkc-fsum').textContent = total ? `${ch}/${total}개` : '';
  }
  function esc(s) { if (s==null) return ''; return String(s).replace(/[<>&"]/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); }

  function renderFields(parsed) {
    const cont = $('kkc-fields');
    const saved = loadSel();
    selected = {};
    const keys = Object.keys(parsed).filter(k => !k.startsWith('_'));
    if (!keys.length) { cont.innerHTML = '<span style="color:#c33;">추출된 필드가 없습니다.</span>'; return; }
    let html = '<div style="display:flex;flex-direction:column;gap:4px;text-align:left;max-height:280px;overflow:auto;">';
    for (const k of keys) {
      const known = KNOWN[k];
      const outKey = known ? known.outKey : k;
      const label = known ? known.label : '(자동 감지)';
      const def = known ? known.def : true;
      const checked = saved.hasOwnProperty(k) ? saved[k].checked : def;
      selected[k] = { checked, outKey };
      const v = parsed[k];
      let pv;
      if (v == null) pv = '(null)';
      else if (typeof v === 'string') pv = esc(v.length>60 ? v.substring(0,60)+'…' : v);
      else if (Array.isArray(v)) pv = `[${v.length}]`;
      else if (typeof v === 'object') pv = esc(JSON.stringify(v).substring(0,60));
      else pv = esc(String(v));
      html += `<label style="display:flex;gap:6px;padding:4px 6px;border:1px solid #eee;border-radius:3px;cursor:pointer;align-items:start;">
        <input type="checkbox" data-k="${esc(k)}" ${checked?'checked':''} style="flex-shrink:0;margin-top:2px;">
        <div style="flex:1;min-width:0;">
          <div><b>${esc(k)}</b> <span style="color:#888;font-size:10px;">→ ${esc(outKey)}</span></div>
          <div style="font-size:10px;color:#666;">${esc(label)}</div>
          <div style="font-size:10px;color:#999;font-family:Consolas,monospace;word-break:break-all;">${pv}</div>
        </div></label>`;
    }
    html += '</div>';
    cont.innerHTML = html;
    cont.style.padding = '0'; cont.style.border = 'none';
    cont.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.onchange = () => { const k = cb.dataset.k; if (selected[k]) selected[k].checked = cb.checked; saveSel(); };
    });
    saveSel();
  }

  function getArr(d) {
    if (Array.isArray(d)) return d;
    if (d?.cafes) return d.cafes;
    if (d?.places) return d.places;
    if (d?.items) return d.items;
    if (d?.data) return d.data;
    for (const k in d) if (Array.isArray(d[k])) return d[k];
    return null;
  }

  // --------------------------------------------------------
  // 6) 이벤트
  // --------------------------------------------------------
  $('kkc-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      workingData = JSON.parse(await f.text());
      const arr = getArr(workingData);
      if (!arr) { $('kkc-fileinfo').textContent = '⚠ 배열 못 찾음'; return; }
      $('kkc-fileinfo').innerHTML = `✓ ${esc(f.name)} — <b>${arr.length}</b>개`;
      $('kkc-start').disabled = false;
      $('kkc-dl').disabled = false;
      log(`JSON 로드: ${arr.length}개`, 'ok');
    } catch(err) { $('kkc-fileinfo').textContent = '✗ '+err.message; log('파싱 실패: '+err.message, 'err'); }
  };

  $('kkc-test').onclick = async () => {
    let testId = '4718442';
    const m = location.pathname.match(/\/(\d+)/);
    if (m) testId = m[1];
    log(`테스트 시작: id=${testId}`, 'info');
    try {
      const data = await fetchPanel3(testId);
      log(`수신 OK (${JSON.stringify(data).length.toLocaleString()} bytes)`, 'ok');
      log(`최상위 키: ${Object.keys(data).join(', ')}`, 'info');

      // === 영업시간 raw 구조 진단 ===
      const oh = data.open_hours;
      if (oh) {
        log(`open_hours 키: ${Object.keys(oh).join(', ')}`, 'info');
        if (oh.headline) log(`  headline = ${JSON.stringify(oh.headline)}`, 'info');
        if (Array.isArray(oh.week_from_today) && oh.week_from_today.length) {
          log(`  week_from_today[0] = ${JSON.stringify(oh.week_from_today[0])}`, 'info');
          log(`  week_from_today[0] 키: ${Object.keys(oh.week_from_today[0]).join(', ')}`, 'info');
        }
        if (oh.all) log(`  all = ${JSON.stringify(oh.all).substring(0,600)}`, 'info');
      } else {
        log(`open_hours 없음`, 'warn');
      }
      // 또한 window.__lastPanel3에 저장 — 콘솔에서 직접 탐색 가능
      window.__lastPanel3 = data;
      log(`전체 응답은 window.__lastPanel3 에 저장됨 (콘솔에서 확인 가능)`, 'info');

      // 전화번호 구조 진단
      try {
        const pn = data.summary?.phone_numbers;
        if (pn !== undefined) log(`summary.phone_numbers = ${JSON.stringify(pn)}`, 'info');
        else log(`summary.phone_numbers 없음`, 'warn');
      } catch(_) {}

      // === week_periods 정확한 구조 출력 ===
      try {
        const d0 = oh?.week_from_today?.week_periods?.[0]?.days?.[0];
        if (d0) {
          log(`  week_periods[0].days[0] 전체 = ${JSON.stringify(d0)}`, 'info');
          if (d0.on_days) log(`  on_days 키: ${Array.isArray(d0.on_days) ? '(array len='+d0.on_days.length+') keys[0]='+Object.keys(d0.on_days[0]||{}).join(',') : Object.keys(d0.on_days).join(',')}`, 'info');
        }
      } catch(_) {}

      // === panel3 내부에 hours/요일 키워드 깊이 검색 ===
      const hoursPaths = [];
      (function find(obj, path) {
        if (!obj || typeof obj !== 'object' || path.length > 6) return;
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          const lk = k.toLowerCase();
          if (/hour|time|business|week|day_of|open|close|holiday/i.test(k) && v != null) {
            const sample = typeof v === 'string' ? v.substring(0,80) : (Array.isArray(v) ? `[${v.length}]` : JSON.stringify(v).substring(0,80));
            hoursPaths.push(`${path.join('.')}.${k} = ${sample}`);
          }
          if (typeof v === 'object') find(v, [...path, k]);
        }
      })(data, []);
      if (hoursPaths.length) {
        log(`panel3 내 hours/요일 후보 (${hoursPaths.length}개):`, 'info');
        for (const p of hoursPaths.slice(0, 20)) log(`  ${p}`, 'info');
      }

      // === 페이지의 모든 API 호출 목록 (영업시간 endpoint 후보) ===
      try {
        const apis = performance.getEntriesByType('resource')
          .filter(e => (e.initiatorType === 'xmlhttprequest' || e.initiatorType === 'fetch'))
          .map(e => e.name)
          .filter(u => u.includes('kakao') && !u.includes('kakaocdn') && !u.includes('cthumb'));
        const unique = [...new Set(apis)];
        log(`페이지 API 호출 ${unique.length}개:`, 'info');
        for (const u of unique) log(`  ${u.substring(0, 150)}`, 'info');
      } catch(_) {}

      // === 영업시간 추가 API 후보 자동 시도 ===
      const candidates = [
        `business-hour/${testId}`, `business-hours/${testId}`,
        `open-hour/${testId}`, `open-hours/${testId}`,
        `operation-time/${testId}`, `working-hour/${testId}`,
        `${testId}/business-hour`, `${testId}/open-hours`,
        `panel3/${testId}/hours`, `hours/${testId}`,
      ];
      log(`영업시간 추가 endpoint 후보 자동 시도...`, 'info');
      for (const c of candidates) {
        try {
          const url = `https://place-api.map.kakao.com/places/${c}`;
          const r = await fetch(url, { credentials: 'include', headers: { 'Accept': 'application/json', 'appVersion': $('kkc-appver').value || '1.0.0', 'pf': 'PC' } });
          if (r.ok) {
            const t = await r.text();
            log(`  ✓ ${c} → HTTP ${r.status} / ${t.length} bytes / ${t.substring(0, 150)}`, 'ok');
          }
        } catch(_) {}
      }

      const parsed = parsePanel3(data);
      log(`파싱 성공: ${parsed._src.join(', ')||'(없음)'}`, parsed._src.length?'ok':'err');
      if (parsed.hours) log(`hours 파싱 결과: ${JSON.stringify(parsed.hours)}`, parsed.hours.status||Object.keys(parsed.hours.weekly).length?'ok':'warn');
      if (parsed._src.length) renderFields(parsed);
      else log(`raw 샘플: ${JSON.stringify(data).substring(0,500)}`, 'warn');
    } catch(err) { log('테스트 실패: '+err.message, 'err'); }
  };

  $('kkc-all').onclick = () => { panel.querySelectorAll('#kkc-fields input[type=checkbox]').forEach(cb=>{cb.checked=true;const k=cb.dataset.k;if(selected[k])selected[k].checked=true;}); saveSel(); };
  $('kkc-none').onclick = () => { panel.querySelectorAll('#kkc-fields input[type=checkbox]').forEach(cb=>{cb.checked=false;const k=cb.dataset.k;if(selected[k])selected[k].checked=false;}); saveSel(); };

  async function processOne(item, idField) {
    const id = item[idField]; if (!id) throw new Error('id 없음');
    const data = await fetchPanel3(id);
    const parsed = parsePanel3(data);
    for (const k of Object.keys(parsed)) {
      if (k.startsWith('_')) continue;
      if (!selected.hasOwnProperty(k)) {
        const known = KNOWN[k];
        selected[k] = { checked: known ? known.def : true, outKey: known ? known.outKey : k };
      }
      const info = selected[k];
      if (info.checked && parsed[k] !== undefined) item[info.outKey] = parsed[k];
    }
    if ($('kkc-debug').checked) {
      item._pm_raw = JSON.stringify(data).substring(0, 2000);
      item._pm_src = parsed._src;
    }
    return parsed;
  }

  $('kkc-start').onclick = async () => {
    if (running) return;
    if (!workingData) { log('JSON 먼저 업로드', 'err'); return; }
    const chCount = Object.values(selected).filter(s=>s.checked).length;
    if (Object.keys(selected).length === 0) { log('먼저 "샘플 1개 테스트"', 'err'); return; }
    if (chCount === 0) { log('필드를 하나 이상 선택하세요', 'err'); return; }
    running = true; stopFlag = false;
    $('kkc-start').disabled = true; $('kkc-stop').disabled = false;

    const arr = getArr(workingData);
    const idField = $('kkc-idfield').value || 'id';
    const conc = parseInt($('kkc-conc').value) || 3;
    const delay = parseInt($('kkc-delay').value) || 0;
    const limit = parseInt($('kkc-limit').value) || 0;
    const skipEx = $('kkc-skip').checked;

    const targets = [];
    for (const it of arr) {
      if (skipEx && it.hours) continue;
      targets.push(it);
      if (limit && targets.length >= limit) break;
    }
    log(`대상: ${targets.length}개 / 전체 ${arr.length}`, 'info');

    let done=0, ok=0, fail=0, skip=arr.length-targets.length;
    function upd() {
      $('kkc-done').textContent = done; $('kkc-total').textContent = targets.length;
      $('kkc-ok').textContent = ok; $('kkc-fail').textContent = fail; $('kkc-skipn').textContent = skip;
      $('kkc-prog').style.width = targets.length ? (done/targets.length*100)+'%' : '0%';
    }
    upd();

    let idx = 0;
    async function worker() {
      while (idx < targets.length && !stopFlag) {
        const my = idx++;
        const it = targets[my];
        const id = it[idField];
        try { const p = await processOne(it, idField); ok++;
          log(`[${my+1}/${targets.length}] ✓ ${id} ${it.name||''} — ${p._src.join(',')}`, 'ok');
        } catch(e) { fail++; log(`[${my+1}/${targets.length}] ✗ ${id} — ${e.message}`, 'err'); }
        done++; upd();
        if (delay) await new Promise(r=>setTimeout(r, delay));
      }
    }
    const ws = [];
    for (let i=0; i<conc; i++) ws.push(worker());
    await Promise.all(ws);
    log(`완료: 성공 ${ok} / 실패 ${fail} / 스킵 ${skip}`, 'info');
    running = false;
    $('kkc-start').disabled = false; $('kkc-stop').disabled = true;
  };

  $('kkc-stop').onclick = () => { stopFlag = true; log('중단 요청', 'warn'); };

  $('kkc-dl').onclick = () => {
    if (!workingData) return;
    const blob = new Blob([JSON.stringify(workingData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g,'-').substring(0,19);
    a.href = URL.createObjectURL(blob); a.download = `placemap_enriched_${ts}.json`; a.click();
    log('다운로드 시작', 'info');
  };

  log('준비 완료. JSON 업로드 → 샘플 테스트 → 수집 시작 → 다운로드', 'info');
  log('현재 origin: ' + location.origin, 'info');
  if (!location.host.endsWith('kakao.com')) {
    log('⚠ 카카오 도메인이 아닙니다! place.map.kakao.com 페이지에서 실행하세요.', 'err');
  }
})();
