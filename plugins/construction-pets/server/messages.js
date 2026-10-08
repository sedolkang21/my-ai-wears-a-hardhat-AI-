'use strict';
// 서버가 내보내는 짧은 안내문(한국어/영어). 화면 글자는 viewer/js/i18n.js에 있다.

const TEXT = {
  ko: {
    announce: "공사현장 뷰어: {url} ('공사현장'이라고 입력하면 열려요)",
    opened: '공사현장 뷰어를 열었어요. 주소: {url}',
    print: '공사현장 뷰어: {url}',
    lanDenied: '주소가 맞지 않아요. PC에서 뷰어의 폰 버튼을 눌러 QR을 다시 찍어 주세요.',
  },
  en: {
    announce: 'Construction site viewer: {url} (type "construction site" to open it)',
    opened: 'Opened the construction site viewer: {url}',
    print: 'Construction site viewer: {url}',
    lanDenied: 'This address is not valid. Press the Phone button in the viewer on your PC and scan the QR code again.',
  },
};

// 설정에 언어가 없으면 PC의 언어를 따른다.
function systemLang(env) {
  const e = env || process.env;
  const fromEnv = e.LC_ALL || e.LC_MESSAGES || e.LANG || e.LANGUAGE || '';
  if (/^[a-z]{2}/i.test(fromEnv) && !/^(C|POSIX)\b/i.test(fromEnv)) return /^ko/i.test(fromEnv) ? 'ko' : 'en';
  let locale = '';
  try { locale = Intl.DateTimeFormat().resolvedOptions().locale || ''; } catch { /* 없으면 영어 */ }
  return /^ko/i.test(locale) ? 'ko' : 'en';
}

function langOf(settings, env) {
  const set = settings && settings.lang;
  return set === 'ko' || set === 'en' ? set : systemLang(env);
}

function msg(lang, key, vars) {
  const table = TEXT[lang === 'en' ? 'en' : 'ko'];
  return String(table[key] || TEXT.ko[key] || key).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? String(vars[k]) : m));
}

// '공사현장', '공사현장 보기', '/공사현장', 'construction site', 'open construction site'처럼 그 말만 입력했을 때만 반응한다.
const OPEN_WORDS = [
  /^\/?\s*공사\s*현장(\s*(보기|열기|열어줘|켜줘|보여줘))?\s*[.!]?$/,
  /^\/?\s*((open|show|view)\s+)?(the\s+)?construction[\s-]*(site|pets)(\s+(open|show|view|viewer))?\s*[.!]?$/i,
];
function isOpenWord(text) {
  const s = String(text || '').trim();
  return s.length <= 60 && OPEN_WORDS.some((re) => re.test(s));
}

module.exports = { msg, langOf, systemLang, isOpenWord };
