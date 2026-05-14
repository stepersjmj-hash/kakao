// 공통 유틸리티: DOM 단축 / 로그 / 배열 추출 / 이스케이프

const $ = id => document.getElementById(id);

function log(msg, cls='') {
  const el = $('log');
  const span = document.createElement('div');
  if (cls) span.className = 'log-' + cls;
  const t = new Date().toLocaleTimeString();
  span.textContent = `[${t}] ${msg}`;
  el.appendChild(span);
  el.scrollTop = el.scrollHeight;
}

function getCafesArray(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.cafes)) return data.cafes;
  if (data && Array.isArray(data.places)) return data.places;
  if (data && Array.isArray(data.items)) return data.items;
  if (data && Array.isArray(data.data)) return data.data;
  for (const k in data) if (Array.isArray(data[k])) return data[k];
  return null;
}

function esc(s) { if (s==null) return ''; return String(s).replace(/[<>&"]/g, c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c])); }
function truncate(s, n) { if (!s) return ''; s = String(s); return s.length>n? s.substring(0,n)+'…': s; }
