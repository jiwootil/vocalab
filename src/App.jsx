import { useState, useEffect, useMemo, useRef } from "react";

import {
  Home,
  BookOpen,
  XCircle,
  PenLine,
  ArrowLeft,
  Play,
  ChevronRight,
  Plus,
  Trash2,
  Check,
  X as CloseIcon,
  Volume2,
  RefreshCw,
  Eye,
  Save,
  ListChecks,
  Loader2,
  Keyboard,
  Languages,
  Type,
  BarChart3,
  Clock,
} from "lucide-react";

const QUIZ_MODES = [
  {
    id: "en-choice",
    title: "영어 4지선다",
    desc: "뜻을 보고 알맞은 영어 단어를 골라요",
    icon: ListChecks,
  },
  {
    id: "ko-choice",
    title: "한국어 4지선다",
    desc: "영어 단어를 보고 알맞은 뜻을 골라요",
    icon: Languages,
  },
  {
    id: "en-input",
    title: "영어 직접 입력",
    desc: "뜻을 보고 영어 단어를 직접 입력해요",
    icon: Keyboard,
  },
  {
    id: "ko-input",
    title: "한국어로 입력",
    desc: "영어 단어를 보고 뜻을 직접 입력해요",
    icon: Type,
  },
];
function isChoiceMode(mode) {
  return mode === "en-choice" || mode === "ko-choice";
}
function answerLangOf(mode) {
  return mode === "en-choice" || mode === "en-input" ? "en" : "ko";
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}
function speak(text) {
  try {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 0.92;
      window.speechSynthesis.speak(u);
    }
  } catch (e) {}
}
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function listKeys(prefix) {
  try {
    const keys = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      if (key && key.startsWith(prefix)) {
        keys.push(key);
      }
    }

    return keys;
  } catch (e) {
    console.error("storage list failed:", e);
    return [];
  }
}

async function getJSON(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (e) {
    console.error("storage get failed:", e);
    return null;
  }
}

async function setJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error("storage set failed:", e);
    return false;
  }
}

async function deleteKey(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    console.error("storage delete failed:", e);
    return false;
  }
}

const SEEDED_DEFAULTS_KEY = "meta:seededDefaultPacks";

async function getSeededDefaultKeys() {
  return (await getJSON(SEEDED_DEFAULTS_KEY)) || [];
}

function buildDefaultPackObject(defaultPack) {
  return {
    id: uid(),
    name: defaultPack.name,
    sourceKey: defaultPack.key,
    words: defaultPack.words.map((w) => ({
      id: uid(),
      en: w.en,
      ko: w.ko,
      meanings: splitMeanings(w.ko),
      ...(w.related ? { related: w.related } : {}),
    })),
    createdAt: Date.now(),
  };
}

// 기본 단어팩은 앱을 처음 열었을 때 자동으로 내 단어팩에 들어가도록 합니다.
// 현재 저장된 단어팩의 sourceKey를 확인해서 없는 기본팩만 추가합니다.
async function seedDefaultPacks() {
  const existingPacks = await loadAllPacks();
  const existingSourceKeys = new Set(
    existingPacks.map((pack) => pack.sourceKey).filter(Boolean)
  );

  const missingDefaults = DEFAULT_PACKS.filter(
    (defaultPack) => !existingSourceKeys.has(defaultPack.key)
  );

  for (const defaultPack of missingDefaults) {
    const pack = buildDefaultPackObject(defaultPack);
    await setJSON("pack:" + pack.id, pack);
  }
}

async function loadAllPacks() {
  const keys = await listKeys("pack:");
  const packs = [];
  for (const k of keys) {
    const p = await getJSON(k);
    if (p) packs.push(p);
  }
  packs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return packs;
}
async function loadWrongMap() {
  const keys = await listKeys("wrongnote:");
  const map = {};
  for (const k of keys) {
    const packId = k.slice("wrongnote:".length);
    const words = await getJSON(k);
    if (words && words.length) map[packId] = words;
  }
  return map;
}
async function loadHistory() {
  const keys = await listKeys("history:");
  const items = [];
  for (const k of keys) {
    const h = await getJSON(k);
    if (h) items.push(h);
  }
  items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return items;
}

function splitMeanings(ko) {
  return String(ko || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBulkLines(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const parsed = [];
  for (const line of lines) {
    if (parsed.length >= 60) break;
    let en = "";
    let ko = "";
    let related = "";
    if (line.includes("|")) {
      const parts = line.split("|").map((p) => p.trim());
      en = parts[0] || "";
      ko = parts[1] || "";
      related = parts[2] || "";
    } else {
      const idx = line.indexOf(",");
      if (idx === -1) continue;
      en = line.slice(0, idx).trim();
      ko = line.slice(idx + 1).trim();
    }
    if (en && ko) {
      parsed.push({ id: uid(), en, ko, related, meanings: splitMeanings(ko) });
    }
  }
  return parsed;
}

const DEFAULT_PACKS = [
  {
    key: "toeic-day6",
    name: "토익단어DAY6",
    words: [
      { en: "pleased", ko: "기쁜" },
      { en: "pleasure", ko: "기쁨", related: "파생어: pleased" },
      { en: "attach", ko: "붙이다, 부착하다", related: "반의어: detach" },
      { en: "detach", ko: "분리하다", related: "반의어: attach" },
      { en: "fluent", ko: "유창한" },
      { en: "limit", ko: "제한, 제한하다", related: "파생어: limited" },
      { en: "limited", ko: "제한된", related: "파생어: limit" },
      { en: "due", ko: "만기가 된, ~하기로 되어 있는", related: "파생어: due to, overdue" },
      { en: "due to", ko: "~때문에, ~덕분에, ~탓에" },
      { en: "overdue", ko: "기한이 지난", related: "파생어: due" },
      { en: "launch", ko: "출시, 출시하다" },
      { en: "flood", ko: "홍수, 물에 잠기다" },
      { en: "base", ko: "기반, 근거하다", related: "파생어: basis" },
      { en: "basis", ko: "근거", related: "파생어: base" },
      { en: "revise", ko: "수정하다" },
      { en: "resource", ko: "자원" },
      { en: "skilled", ko: "노련한, 숙련된" },
      { en: "possible", ko: "가능한", related: "파생어: possibly" },
      { en: "possibly", ko: "아마도, 가능하게도", related: "파생어: possible" },
      { en: "represent", ko: "대표하다", related: "파생어: representative" },
      { en: "representative", ko: "담당자, 대표자", related: "파생어: represent" },
      { en: "fix", ko: "수리하다", related: "파생어: fixture" },
      { en: "fixture", ko: "설비", related: "파생어: fix" },
      { en: "record", ko: "기록, 기록하다" },
      { en: "forward", ko: "앞으로, 보내다" },
      { en: "pass", ko: "지나가다, 건네다, 통행권", related: "파생어: passenger, surpass" },
      { en: "passenger", ko: "승객", related: "파생어: pass" },
      { en: "surpass", ko: "뛰어넘다", related: "파생어: pass" },
      { en: "sample", ko: "시식하다, 견본, 표본" },
      { en: "extra", ko: "추가의, 추가로" },
      { en: "advise", ko: "충고하다", related: "파생어: advisory" },
      { en: "advisory", ko: "자문의, 기상 주의보, 충고하는", related: "파생어: advise" },
      { en: "party", ko: "당사자, 단체" },
      { en: "solve", ko: "해결하다", related: "유의어: resolve" },
      { en: "resolve", ko: "해결하다", related: "유의어: solve" },
      { en: "text", ko: "글자, 글, 문자 메시지를 보내다" },
      { en: "context", ko: "맥락" },
      { en: "point", ko: "가리키다, 지적하다, 의견" },
      { en: "supervise", ko: "감독하다" },
      { en: "expense", ko: "경비" },
      { en: "upcoming", ko: "다가오는" },
      { en: "own", ko: "소유하다" },
      { en: "celebrate", ko: "축하하다", related: "파생어: celebrity" },
      { en: "celebrity", ko: "유명 인사", related: "파생어: celebrate" },
      { en: "specific", ko: "구체적인", related: "파생어: specify, specification" },
      { en: "specify", ko: "특정하다", related: "파생어: specific, specification" },
      { en: "specification", ko: "명세서, 사양", related: "파생어: specific, specify" },
      { en: "encourage", ko: "권장하다", related: "반의어: discourage" },
      { en: "discourage", ko: "좌절시키다", related: "반의어: encourage" },
      { en: "facility", ko: "시설" },
      { en: "view", ko: "전망, 보다", related: "파생어: overview, preview" },
      { en: "overview", ko: "개요", related: "파생어: view, preview" },
      { en: "preview", ko: "시사회", related: "파생어: view, overview" },
      { en: "benefit", ko: "이익" },
      { en: "medical", ko: "의료의", related: "파생어: medication, medicine" },
      { en: "medication", ko: "약", related: "파생어: medical, medicine" },
      { en: "medicine", ko: "약, 의학", related: "파생어: medical, medication" },
      { en: "safe", ko: "금고, 안전한" },
      { en: "load", ko: "짐, 짐을 싣다" },
      { en: "download", ko: "다운로드하다, 내려받다" },
    ],
  },
  {
    key: "toeic-day7",
    name: "토익단어DAY7",
    words: [
      { en: "assign", ko: "할당하다" },
      { en: "host", ko: "주최자, 주최하다" },
      { en: "file", ko: "서류, 보관하다, 제출하다" },
      { en: "retire", ko: "은퇴하다" },
      { en: "edit", ko: "편집하다", related: "파생어: edition" },
      { en: "edition", ko: "판, 에디션", related: "파생어: edit" },
      { en: "donate", ko: "기부하다" },
      { en: "patient", ko: "환자" },
      { en: "expert", ko: "전문가", related: "파생어: expertise" },
      { en: "expertise", ko: "전문 지식", related: "파생어: expert" },
      { en: "corporate", ko: "법인의", related: "파생어: incorporate" },
      { en: "incorporate", ko: "포함하다", related: "파생어: corporate" },
      { en: "media", ko: "대중 매체", related: "파생어: medium" },
      { en: "medium", ko: "중간의", related: "파생어: media" },
      { en: "rate", ko: "요금, 비율, 평가하다" },
      { en: "credit", ko: "신용, 적립금", related: "파생어: accredited" },
      { en: "accredited", ko: "승인된", related: "파생어: credit" },
      { en: "deadline", ko: "마감" },
      { en: "commit", ko: "헌신하다", related: "파생어: committee, commission" },
      { en: "committee", ko: "위원회", related: "파생어: commit, commission" },
      { en: "commission", ko: "위원회, 수수료, 의뢰하다", related: "파생어: commit, committee" },
      { en: "fair", ko: "박람회, 공정한, 괜찮은", related: "파생어: fairly" },
      { en: "fairly", ko: "상당히, 꽤", related: "파생어: fair" },
      { en: "convenience", ko: "편의", related: "반의어: inconvenience" },
      { en: "inconvenience", ko: "불편", related: "반의어: convenience" },
      { en: "invest", ko: "투자하다" },
      { en: "conduct", ko: "수행하다" },
      { en: "exhibit", ko: "전시하다" },
      { en: "code", ko: "암호, 규정, 코드" },
      { en: "miss", ko: "놓치다, 그리워하다", related: "파생어: missing" },
      { en: "missing", ko: "잃어버린", related: "파생어: miss" },
      { en: "partner", ko: "파트너, 제휴하다" },
      { en: "express", ko: "표현하다, 신속한" },
      { en: "complain", ko: "불평하다" },
      { en: "distribute", ko: "배포하다" },
      { en: "belong", ko: "~에 속하다", related: "파생어: belongings" },
      { en: "belongings", ko: "소지품", related: "파생어: belong" },
      { en: "personal", ko: "개인의", related: "파생어: personalize" },
      { en: "personalize", ko: "개인의 필요에 맞추다", related: "파생어: personal" },
      { en: "original", ko: "원래의, 독창적인, 원본", related: "파생어: origin, originate" },
      { en: "origin", ko: "기원", related: "파생어: original, originate" },
      { en: "originate", ko: "유래되다", related: "파생어: original, origin" },
      { en: "volunteer", ko: "자원하다, 자원봉사자", related: "파생어: voluntary" },
      { en: "voluntary", ko: "자발적인", related: "파생어: volunteer" },
      { en: "previous", ko: "이전의" },
      { en: "identify", ko: "확인하다", related: "파생어: identity" },
      { en: "identity", ko: "신원", related: "파생어: identify" },
      { en: "hall", ko: "홀, 넓은 방, 복도" },
      { en: "bill", ko: "청구서" },
      { en: "quarter", ko: "분기" },
      { en: "effect", ko: "영향", related: "파생어: effective" },
      { en: "effective", ko: "효과적인", related: "파생어: effect" },
      { en: "appreciate", ko: "감사하다" },
      { en: "society", ko: "협회, 사회", related: "파생어: social, socialize" },
      { en: "social", ko: "사회의", related: "파생어: society, socialize" },
      { en: "socialize", ko: "교제하다", related: "파생어: society, social" },
      { en: "special", ko: "특별한", related: "파생어: specialize, specialty" },
      { en: "specialize", ko: "전문으로 하다", related: "파생어: special, specialty" },
      { en: "specialty", ko: "특산품, 전문 분야", related: "파생어: special, specialize" },
      { en: "opening", ko: "개장, 공석" },
    ],
  },
  {
    key: "toeic-day8",
    name: "토익단어DAY8",
    words: [
      { en: "certificate", ko: "증명서", related: "파생어: certify" },
      { en: "certify", ko: "증명하다", related: "파생어: certificate" },
      { en: "contain", ko: "포함하다" },
      { en: "manual", ko: "매뉴얼, 사용 설명서", related: "파생어: manually" },
      { en: "manually", ko: "손으로, 수동으로", related: "파생어: manual" },
      { en: "focus", ko: "초점" },
      { en: "reach", ko: "도달하다, 연락하다, 뻗다", related: "파생어: outreach" },
      { en: "outreach", ko: "봉사 활동", related: "파생어: reach" },
      { en: "permit", ko: "허용하다" },
      { en: "press", ko: "언론, 누르다" },
      { en: "estimate", ko: "추정, 추정하다", related: "파생어: underestimate" },
      { en: "underestimate", ko: "과소평가하다", related: "파생어: estimate" },
      { en: "instead", ko: "대신에", related: "파생어: instead of" },
      { en: "instead of", ko: "~대신에", related: "파생어: instead" },
      { en: "branch", ko: "지점, 나뭇가지" },
      { en: "route", ko: "노선", related: "파생어: routine" },
      { en: "routine", ko: "일상적인, 루틴", related: "파생어: route" },
      { en: "respond", ko: "응답하다" },
      { en: "remind", ko: "상기시키다" },
      { en: "electric", ko: "전기의" },
      { en: "advance", ko: "발전, 향상시키다, 사전의", related: "파생어: advanced" },
      { en: "advanced", ko: "진보한, 고급의", related: "파생어: advance" },
      { en: "reduce", ko: "줄이다" },
      { en: "strategy", ko: "전략" },
      { en: "connect", ko: "연결하다", related: "파생어: connection, disconnect" },
      { en: "connection", ko: "연결, 인맥", related: "파생어: connect, disconnect" },
      { en: "disconnect", ko: "연결을 끊다", related: "파생어: connect, connection" },
      { en: "associate", ko: "동료, 관련시키다" },
      { en: "apologize", ko: "사과하다" },
      { en: "clear", ko: "분명한", related: "파생어: clearance, clarify" },
      { en: "clearance", ko: "정리, 허가", related: "파생어: clear, clarify" },
      { en: "clarify", ko: "명확하게 하다", related: "파생어: clear, clearance" },
      { en: "author", ko: "저자" },
      { en: "authorize", ko: "승인하다", related: "파생어: authority" },
      { en: "authority", ko: "당국, 권위자", related: "파생어: authorize" },
      { en: "commercial", ko: "상업의, 광고", related: "파생어: commerce" },
      { en: "commerce", ko: "상업", related: "파생어: commercial" },
      { en: "region", ko: "지역" },
      { en: "attract", ko: "(마음을) 끌다, 유인하다", related: "파생어: attractive" },
      { en: "attractive", ko: "매력적인", related: "파생어: attract" },
      { en: "reasonable", ko: "합리적인, 비싸지 않은" },
      { en: "architect", ko: "건축가" },
      { en: "state", ko: "미국의 주, 상태, 말하다" },
      { en: "step", ko: "단계, 걸음, 계단, 걸음을 내딛다", related: "파생어: step-by-step, footstep" },
      { en: "step-by-step", ko: "단계적인", related: "파생어: step, footstep" },
      { en: "footstep", ko: "발자국", related: "파생어: step, step-by-step" },
      { en: "broadcast", ko: "방송하다, 방송" },
      { en: "forecast", ko: "예보, 예상하다" },
      { en: "regard", ko: "여기다", related: "파생어: regardless of, regarding" },
      { en: "regardless of", ko: "~에 관계없이", related: "파생어: regard, regarding" },
      { en: "regarding", ko: "~에 관하여", related: "파생어: regard, regardless of" },
      { en: "follow", ko: "따라가다, 지시를 따르다", related: "파생어: following, follow-up" },
      { en: "following", ko: "다음의, ~후에", related: "파생어: follow, follow-up" },
      { en: "follow-up", ko: "후속 조치, 후속의", related: "파생어: follow, following" },
      { en: "convention", ko: "대회" },
      { en: "regular", ko: "정기적인" },
      { en: "official", ko: "공무원, 공식적인" },
      { en: "trade", ko: "무역, 교환하다" },
      { en: "upgrade", ko: "업그레이드하다, 개선", related: "파생어: grade" },
      { en: "grade", ko: "등급, 성적", related: "파생어: upgrade" },
    ],
  },
  {
    key: "toeic-day9",
    name: "토익단어DAY9",
    words: [
      { en: "impressive", ko: "인상적인", related: "파생어: impression, impressed" },
      { en: "impression", ko: "인상", related: "파생어: impressive, impressed" },
      { en: "impressed", ko: "감명을 받은", related: "파생어: impressive, impression" },
      { en: "shelf", ko: "선반" },
      { en: "retail", ko: "소매의" },
      { en: "section", ko: "부분", related: "파생어: sector, intersection" },
      { en: "sector", ko: "분야", related: "파생어: section, intersection" },
      { en: "intersection", ko: "교차로", related: "파생어: section, sector" },
      { en: "communicate", ko: "의사소통하다, 알리다" },
      { en: "candidate", ko: "후보자" },
      { en: "satisfy", ko: "만족시키다", related: "파생어: satisfaction, satisfactory" },
      { en: "satisfaction", ko: "만족", related: "파생어: satisfy, satisfactory" },
      { en: "satisfactory", ko: "만족스러운", related: "파생어: satisfy, satisfaction" },
      { en: "condition", ko: "상태, 조건" },
      { en: "initial", ko: "초기의", related: "파생어: initiative, initiate" },
      { en: "initiative", ko: "주도권, 새로운 계획", related: "파생어: initial, initiate" },
      { en: "initiate", ko: "시작하다", related: "파생어: initial, initiative" },
      { en: "short", ko: "짧은, 부족한" },
      { en: "stand", ko: "서다, 정류장, 노점", related: "파생어: outstanding" },
      { en: "outstanding", ko: "뛰어난", related: "파생어: stand" },
      { en: "damage", ko: "피해, 피해를 입히다" },
      { en: "demonstrate", ko: "입증하다, 시연하다" },
      { en: "screen", ko: "화면, 심사하다" },
      { en: "brochure", ko: "소책자" },
      { en: "agenda", ko: "안건" },
      { en: "stock", ko: "재고" },
      { en: "release", ko: "출시, 발표하다" },
      { en: "real estate", ko: "부동산" },
      { en: "chef", ko: "요리사" },
      { en: "responsible", ko: "책임이 있는" },
      { en: "deal", ko: "거래, 처리하다" },
      { en: "practice", ko: "연습, 관행, 연습하다", related: "파생어: practical" },
      { en: "practical", ko: "실용적인", related: "파생어: practice" },
      { en: "suit", ko: "정장, 적합하다", related: "파생어: suitable, suitcase" },
      { en: "suitable", ko: "적합한", related: "파생어: suit, suitcase" },
      { en: "suitcase", ko: "여행 가방", related: "파생어: suit, suitable" },
      { en: "salary", ko: "급여" },
      { en: "intend", ko: "~할 작정이다, 의도하다", related: "파생어: intent" },
      { en: "intent", ko: "의도, 집중하는", related: "파생어: intend" },
      { en: "surprisingly", ko: "놀랍게도" },
      { en: "cater", ko: "출장 뷔페를 제공하다" },
      { en: "join", ko: "합류하다", related: "파생어: joint" },
      { en: "joint", ko: "합동의", related: "파생어: join" },
      { en: "degree", ko: "학위, 온도, 정도" },
      { en: "qualify", ko: "자격을 주다", related: "파생어: qualification" },
      { en: "qualification", ko: "자격", related: "파생어: qualify" },
      { en: "attention", ko: "주의", related: "파생어: attentive" },
      { en: "attentive", ko: "주의를 기울이는", related: "파생어: attention" },
      { en: "found", ko: "설립하다", related: "파생어: foundation" },
      { en: "foundation", ko: "토대", related: "파생어: found" },
      { en: "prior to", ko: "~에 앞서", related: "파생어: priority, prior" },
      { en: "priority", ko: "우선권", related: "파생어: prior to, prior" },
      { en: "prior", ko: "이전의", related: "파생어: prior to, priority" },
      { en: "reference", ko: "추천서, 참고", related: "파생어: refer, referral" },
      { en: "refer", ko: "참고하다, 언급하다", related: "파생어: reference, referral" },
      { en: "referral", ko: "추천", related: "파생어: reference, refer" },
      { en: "environment", ko: "환경" },
      { en: "potential", ko: "잠재적인, 잠재력" },
      { en: "less", ko: "더 적은", related: "파생어: lessen" },
      { en: "lessen", ko: "줄이다", related: "파생어: less" },
    ],
  },
];

function Turtle({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <ellipse cx="20" cy="22" rx="13" ry="10" fill="#4FB3A9" />
      <circle cx="13" cy="19" r="1.6" fill="#2E8880" />
      <circle cx="20" cy="15" r="1.6" fill="#2E8880" />
      <circle cx="27" cy="19" r="1.6" fill="#2E8880" />
      <circle cx="20" cy="26" r="1.6" fill="#2E8880" />
      <circle cx="30" cy="16" r="3.4" fill="#66C4BA" />
      <ellipse cx="8" cy="27" rx="3.2" ry="2.2" fill="#66C4BA" />
      <ellipse cx="32" cy="27" rx="3.2" ry="2.2" fill="#66C4BA" />
      <ellipse cx="13" cy="31" rx="2.6" ry="2" fill="#66C4BA" />
    </svg>
  );
}
function Shell({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M20 8C11 8 6 16 6 24c0 5 5 8 14 8s14-3 14-8c0-8-5-16-14-16z" fill="#FF8A65" />
      <path d="M20 14v18M14 16c2 5 2 11 0 15M26 16c-2 5-2 11 0 15" stroke="#E8663F" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function StarFish({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path
        d="M20 4l4.4 10.6L35 17l-8.4 7.4L29 35l-9-6-9 6 2.4-10.6L5 17l10.6-2.4z"
        fill="#FFB74D"
      />
      <circle cx="20" cy="21" r="2.4" fill="#F08C2A" />
    </svg>
  );
}
function Fish({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <ellipse cx="18" cy="20" rx="12" ry="8" fill="#2E6FBE" />
      <path d="M30 20l7-6v12z" fill="#2E6FBE" />
      <circle cx="12" cy="18" r="1.8" fill="#fff" />
      <path d="M8 20c-2 1-3 3-3 5" stroke="#1B4F91" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function Jellyfish({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M8 16a12 10 0 0124 0c0 4-5 6-12 6S8 20 8 16z" fill="#8FA0E6" />
      <path
        d="M13 22c0 4-2 5-2 9M20 23c0 4 1 6 1 10M27 22c0 4 2 5 2 9"
        stroke="#6C82D6"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
function Whale({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path
        d="M8 34c0-10 10-18 24-18 12 0 22 6 24 14-2 6-8 10-16 11l-2 5-4-4c-10 1-26-2-26-8z"
        fill="#2E6FBE"
      />
      <circle cx="20" cy="30" r="2" fill="#fff" />
      <path d="M30 12c0-4 2-6 2-6s2 2 2 6" stroke="#8FB4E8" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function Coral({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path
        d="M10 36V22c0-4 4-6 4-10M14 36V26c0-3 3-4 3-8M20 36V20c0-5 5-7 5-12M26 36V24c0-3 3-4 3-8M30 36V26c0-3 2-4 2-7"
        stroke="#FF8A65"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
function PackIcon({ size = 40, className = "" }) {
  return (
    <img
      src="/icon1.png"
      alt=""
      width={size}
      height={size}
      className={`object-contain shrink-0 ${className}`}
    />
  );
}

const PACK_ICONS = [PackIcon];

function TrophyIllustration() {
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
      <path
        d="M30 18h28v14c0 9-6 16-14 16s-14-7-14-16V18z"
        fill="#FFB74D"
      />
      <rect x="38" y="48" width="12" height="10" fill="#F08C2A" />
      <rect x="30" y="58" width="28" height="6" rx="2" fill="#F08C2A" />
      <path d="M30 22h-8c0 8 3 13 8 14" stroke="#F08C2A" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M58 22h8c0 8-3 13-8 14" stroke="#F08C2A" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M14 14l2.4 5.6L22 22l-5.6 2.4L14 30l-2.4-5.6L6 22l5.6-2.4z" fill="#FF8A65" />
      <path d="M72 30l1.8 4.2L78 36l-4.2 1.8L72 42l-1.8-4.2L66 36l4.2-1.8z" fill="#8FA0E6" />
    </svg>
  );
}
function ConfettiFish() {
  return (
    <svg width="96" height="88" viewBox="0 0 96 88" fill="none">
      <ellipse cx="48" cy="50" rx="20" ry="14" fill="#FF8A65" />
      <path d="M68 50l12-10v20z" fill="#FF8A65" />
      <circle cx="40" cy="46" r="2.6" fill="#fff" />
      <circle cx="10" cy="10" r="3" fill="#FFB74D" />
      <circle cx="86" cy="14" r="2.4" fill="#4FB3A9" />
      <circle cx="16" cy="30" r="2" fill="#2E6FBE" />
      <circle cx="80" cy="34" r="2.6" fill="#8FA0E6" />
      <rect x="24" y="8" width="4" height="4" rx="1" fill="#8FA0E6" transform="rotate(20 24 8)" />
      <rect x="68" y="6" width="4" height="4" rx="1" fill="#FF8A65" transform="rotate(-15 68 6)" />
    </svg>
  );
}

function TopBar({ title, onBack, right }) {
  return (
    <div className="flex items-center gap-2 px-5 pt-6 pb-3">
      {onBack && (
        <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-full hover:bg-[#DDEBFA] text-[#1E2A3A] transition-colors">
          <ArrowLeft size={20} />
        </button>
      )}
      <h1 className="text-[21px] text-[#1E2A3A] font-bold flex-1">{title}</h1>
      {right}
    </div>
  );
}
function PillButton({ children, onClick, variant = "primary", disabled, className = "", type = "button" }) {
  const styles = {
    primary: "bg-[#2E6FBE] text-white",
    outline: "bg-white border border-[#2E6FBE] text-[#2E6FBE]",
    soft: "bg-[#DDEBFA] text-[#1E2A3A]",
    ghost: "text-[#7A879C]",
    danger: "bg-white border border-[#F3C9C3] text-[#E2574A]",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl px-4 py-3 font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
function EmptyState({ Icon, title, body }) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-16 px-8">
      <div className="w-16 h-16 rounded-full bg-[#DDEBFA] flex items-center justify-center">
        <Icon size={36} />
      </div>
      <p className="text-[#1E2A3A] font-semibold">{title}</p>
      <p className="text-[#7A879C] text-sm leading-relaxed max-w-[240px]">{body}</p>
    </div>
  );
}

function NavBar({ view, setView, wrongCount }) {
  const items = [
    { key: "home", label: "메인", icon: Home },
    { key: "packs", label: "단어팩", icon: BookOpen },
    { key: "wrongnote", label: "오답노트", icon: XCircle, badge: wrongCount },
    { key: "stats", label: "통계", icon: BarChart3 },
  ];

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-[#E3EDF7] min-h-screen flex flex-col">
      
      <div className="px-8 py-8">
        <img
          src="/textlogo.png"
          alt="단어 학습"
          className="w-auto h-14 object-contain"
        />
      </div>
      
      <nav className="px-4 flex flex-col gap-2">
        {items.map((it) => {
          const active = view === it.key;
          const Icon = it.icon;

          return (
            <button
              key={it.key}
              onClick={() => setView(it.key)}
              className={`
                w-full flex items-center gap-3 px-4 py-3.5 rounded-xl
                transition-colors text-left
                ${
                  active
                    ? "bg-[#EAF3FB] text-[#2E6FBE]"
                    : "text-[#7A879C] hover:bg-[#F5F8FC]"
                }
              `}
            >
              <div className="relative">
                <Icon
                  size={21}
                  strokeWidth={active ? 2.4 : 1.8}
                />

                {it.badge > 0 && (
                  <span className="absolute -top-2 -right-3 min-w-[17px] h-[17px] px-1 rounded-full bg-[#E2574A] text-white text-[10px] font-semibold flex items-center justify-center">
                    {it.badge > 99 ? "99+" : it.badge}
                  </span>
                )}
              </div>

              <span className={`text-[14px] ${
                active ? "font-semibold" : "font-medium"
              }`}>
                {it.label}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function HomeScreen({ packs, loading, wrongMap, onStart, onGoPacks, onGoWrongnote }) {
  const totalWrong = Object.values(wrongMap).reduce((s, arr) => s + arr.length, 0);
  return (
    <div>
      <div className="flex items-start justify-between px-5 pt-6">
        <div>
          <h1 className="text-[28px] text-[#1E2A3A] font-bold leading-snug mt-4">
            오늘은 어떤 단어를
            <br />
            외워볼까요?
          </h1>
        </div>
      </div>

      <div className="px-5 flex gap-5 mt-8 mb-8">
        <button onClick={onGoPacks} className="flex-1 bg-white rounded-2xl px-4 py-3.5 shadow-sm text-left active:scale-[0.98] transition-transform">
          <p className="text-[22px] font-bold text-[#1E2A3A]">{packs.length}개</p>
          <p className="text-[12px] text-[#7A879C]">보유 단어팩</p>
        </button>
        <button onClick={onGoWrongnote} className="flex-1 bg-white rounded-2xl px-4 py-3.5 shadow-sm text-left active:scale-[0.98] transition-transform">
          <p className="text-[22px] font-bold text-[#1E2A3A]">{totalWrong}개</p>
          <p className="text-[12px] text-[#7A879C]">오답노트 단어</p>
        </button>
      </div>

      <div className="px-5 flex items-center justify-between mb-3">
        <p className="text-[15px] font-bold text-[#1E2A3A]">내 단어팩</p>
        <button onClick={onGoPacks} className="text-[13px] text-[#2E6FBE] font-semibold flex items-center gap-0.5">
          전체 보기 <ChevronRight size={14} />
        </button>
      </div>

      <div className="px-5 flex flex-col gap-3">
        {loading && (
          <div className="flex items-center gap-2 text-[#7A879C] text-sm py-8 justify-center">
            <Loader2 size={16} className="animate-spin" /> 불러오는 중...
          </div>
        )}
        {!loading && packs.length === 0 && (
          <EmptyState Icon={PackIcon} title="아직 단어팩이 없어요" body="주제를 입력하면 AI가 단어를 추천해주거나, 직접 입력해서 나만의 팩을 만들 수 있어요." />
        )}
        {packs.slice(0, 5).map((p, i) => {
          const Icon = PACK_ICONS[i % PACK_ICONS.length];
          return (
            <div key={p.id} className="w-full bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm">
              <Icon size={34} />
              <div className="flex-1 min-w-0">
                <p className="text-[#1E2A3A] font-semibold truncate">{p.name}</p>
                <p className="text-[12px] text-[#7A879C]">{p.words.length}개 단어</p>
              </div>
              <button onClick={() => onStart(p)} className="shrink-0 bg-[#2E6FBE] text-white text-[13px] font-semibold px-4 py-2 rounded-full active:scale-[0.96] transition-transform">
                학습하기
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PacksListScreen({ packs, loading, onStart, onGoManual, onEdit, onDelete, onAddDefault }) {
  const addedKeys = new Set(packs.map((p) => p.sourceKey).filter(Boolean));
  const availableDefaults = DEFAULT_PACKS.filter((dp) => !addedKeys.has(dp.key));

  return (
    <div>
      <div className="flex items-center justify-between px-5 pt-6 pb-1">
        <h1 className="text-[21px] text-[#1E2A3A] font-bold">단어팩</h1>
        <Jellyfish size={34} />
      </div>

      <div className="px-5 flex flex-col gap-3 mt-3 mb-6">
        <button onClick={onGoManual} className="w-full bg-white rounded-2xl px-5 py-5 flex items-center justify-between shadow-sm text-left active:scale-[0.98] transition-transform">
          <div>
            <p className="text-[17px] font-bold text-[#1E2A3A] mb-1">직접 입력하기</p>
            <p className="text-[13px] text-[#7A879C] leading-relaxed">직접 단어를 입력하고
              <br />
              나만의 단어팩을 만들어요.</p>
          </div>
          <div className="flex items-end gap-1">
          </div>
        </button>
      </div>

      {availableDefaults.length > 0 && (
        <div className="px-5 mb-6">
          <p className="text-[15px] font-bold text-[#1E2A3A] mb-3">기본 단어팩</p>
          <div className="flex flex-col gap-3">
            {availableDefaults.map((dp) => (
              <div key={dp.key} className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm">
                <PackIcon size={30} />
                <div className="flex-1 min-w-0">
                  <p className="text-[#1E2A3A] font-semibold truncate">{dp.name}</p>
                  <p className="text-[12px] text-[#7A879C]">{dp.words.length}개 단어 · 기본 제공</p>
                </div>
                <button
                  onClick={() => onAddDefault(dp)}
                  className="shrink-0 bg-[#DDEBFA] text-[#2E6FBE] text-[13px] font-semibold px-4 py-2 rounded-full flex items-center gap-1 active:scale-[0.96] transition-transform"
                >
                  <Plus size={14} /> 추가하기
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-5 flex flex-col gap-3">
        {loading && (
          <div className="flex items-center gap-2 text-[#7A879C] text-sm py-8 justify-center">
            <Loader2 size={16} className="animate-spin" /> 불러오는 중...
          </div>
        )}
        {packs.map((p, i) => {
          const Icon = PACK_ICONS[i % PACK_ICONS.length];
          return (
            <div key={p.id} className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm">
              <Icon size={30} />
              <div className="flex-1 min-w-0" onClick={() => onStart(p)}>
                <p className="text-[#1E2A3A] font-semibold truncate">{p.name}</p>
                <p className="text-[12px] text-[#7A879C]">{p.words.length}개 단어</p>
              </div>
              <button onClick={() => onStart(p)} className="w-8 h-8 rounded-full bg-[#2E6FBE] flex items-center justify-center text-white shrink-0">
                <Play size={12} fill="currentColor" />
              </button>
              <button onClick={() => onEdit(p)} className="text-[#B7C4D6] hover:text-[#2E6FBE] shrink-0">
                <PenLine size={16} />
              </button>
              <button onClick={() => onDelete(p.id)} className="text-[#B7C4D6] hover:text-[#E2574A] shrink-0">
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const BULK_EXAMPLE =
  "apple,사과\nbook,책\nhappy,행복한\neffect | 결과, 영향, 효과 | \nattach | 붙이다, 부착하다 | 반의어: detach";

function ManualInputScreen({ onBack, onParsed }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const count = useMemo(() => parseBulkLines(text).length, [text]);

  function handlePreview() {
    const parsed = parseBulkLines(text);
    if (parsed.length === 0) {
      setError('형식을 확인해주세요. 예: apple,사과');
      return;
    }
    setError("");
    onParsed(parsed);
  }

  return (
    <div>
      <div className="flex items-center px-5 pt-6">
        <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-full hover:bg-[#DDEBFA] text-[#1E2A3A]">
          <ArrowLeft size={20} />
        </button>
      </div>
      <div className="px-5 pt-2 pb-8">
        <h1 className="text-[22px] font-bold text-[#1E2A3A] mb-3">직접 입력하기</h1>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] text-[#7A879C] leading-relaxed">
            영어,뜻 형식으로 입력해주세요. 뜻은 콤마로 여러 개 적을 수 있어요.
            <br />
            영어 | 뜻1, 뜻2, 뜻3 | 유의어·반의어(선택) 형식도 가능해요.
            <br />
            (최대 60개)
          </p>
          <button onClick={() => setText(BULK_EXAMPLE)} className="text-[12px] text-[#2E6FBE] font-semibold shrink-0 flex items-center gap-1">
            <Eye size={13} /> 입력 예시
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={BULK_EXAMPLE}
          rows={10}
          className="w-full bg-white rounded-2xl px-4 py-3.5 text-[#1E2A3A] placeholder-[#B7C4D6] outline-none shadow-sm mb-1.5 font-mono text-[14px] leading-relaxed"
        />
        <p className="text-right text-[12px] text-[#B7C4D6] mb-5">{count}/60</p>

        {error && <p className="text-[13px] text-[#E2574A] mb-3">{error}</p>}

        <PillButton onClick={handlePreview} className="w-full py-3.5">
          <Eye size={17} /> 미리보기
        </PillButton>
      </div>
    </div>
  );
}

function PreviewScreen({ initialName, initialWords, onBack, onSave, saving }) {
  const [name, setName] = useState(initialName || "");
  const [words, setWords] = useState(initialWords);
  const [error, setError] = useState("");

  function update(id, field, value) {
    setWords((w) => w.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
  }
  function remove(id) {
    setWords((w) => w.filter((x) => x.id !== id));
  }
  function addRow() {
    if (words.length >= 60) return;
    setWords((w) => [...w, { id: uid(), en: "", ko: "" }]);
  }
  function clearAll() {
    setWords([]);
  }
  function handleSave() {
    if (!name.trim()) {
      setError("팩 이름을 입력해주세요.");
      return;
    }
    const clean = words
      .filter((w) => w.en.trim() && w.ko.trim())
      .map((w) => ({ ...w, meanings: splitMeanings(w.ko) }));
    if (clean.length === 0) {
      setError("단어를 1개 이상 입력해주세요.");
      return;
    }
    setError("");
    onSave(name.trim(), clean.slice(0, 60));
  }

  return (
    <div>
      <div className="flex items-center justify-between px-5 pt-6">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-full hover:bg-[#DDEBFA] text-[#1E2A3A]">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-[19px] font-bold text-[#1E2A3A]">미리보기 ({words.length}/60)</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#2E6FBE] text-white text-[13px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 disabled:opacity-60"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          저장
        </button>
      </div>

      <div className="px-5 pt-1 pb-8">
        <p className="text-[13px] text-[#7A879C] mb-3">내용을 확인하고 수정할 수 있어요.</p>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="팩 이름을 입력하세요"
          className="w-full bg-white rounded-xl px-4 py-2.5 text-[#1E2A3A] placeholder-[#B7C4D6] outline-none shadow-sm mb-4 font-semibold"
        />

        {error && <p className="text-[13px] text-[#E2574A] mb-3">{error}</p>}

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
          <div className="flex flex-col divide-y divide-[#EEF3FA] max-h-[380px] overflow-y-auto">
            {words.map((w, i) => (
              <div key={w.id} className="flex items-center gap-2 px-4 py-2.5">
                <span className="text-[12px] text-[#B7C4D6] w-5 shrink-0 text-right">{i + 1}</span>
                <input
                  value={w.en}
                  onChange={(e) => update(w.id, "en", e.target.value)}
                  placeholder="영어"
                  className="flex-1 min-w-0 bg-transparent outline-none text-[#1E2A3A] text-sm font-medium"
                />
                <input
                  value={w.ko}
                  onChange={(e) => update(w.id, "ko", e.target.value)}
                  placeholder="뜻 (콤마로 여러개)"
                  className="flex-[1.4] min-w-0 bg-transparent outline-none text-[#7A879C] text-sm"
                />
                <input
                  value={w.related || ""}
                  onChange={(e) => update(w.id, "related", e.target.value)}
                  placeholder="유의어/반의어(선택)"
                  className="flex-1 min-w-0 bg-transparent outline-none text-[#B7C4D6] text-xs"
                />
                <button onClick={() => remove(w.id)} className="text-[#B7C4D6] hover:text-[#E2574A] shrink-0">
                  <CloseIcon size={15} />
                </button>
              </div>
            ))}
            {words.length === 0 && <p className="text-center text-[#B7C4D6] text-sm py-8">단어가 없어요.</p>}
          </div>
        </div>

        <div className="flex gap-3">
          <PillButton onClick={addRow} variant="soft" className="flex-1" disabled={words.length >= 60}>
            <Plus size={16} /> 단어 추가
          </PillButton>
          <PillButton onClick={clearAll} variant="danger" className="flex-1">
            <Trash2 size={15} /> 전체 삭제
          </PillButton>
        </div>
      </div>
    </div>
  );
}

function SuccessScreen({ pack, onEdit, onStart }) {
  const Icon = Fish;
  return (
    <div className="px-5 pt-14 pb-8 flex flex-col items-center text-center">
      <ConfettiFish />
      <p className="text-[19px] font-bold text-[#1E2A3A] mt-4 mb-6">단어팩이 저장되었어요!</p>

      <div className="w-full bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm mb-8">
        <Icon size={34} />
        <div className="text-left">
          <p className="text-[#1E2A3A] font-semibold">{pack.name}</p>
          <p className="text-[12px] text-[#7A879C]">{pack.words.length}개 단어</p>
        </div>
      </div>

      <div className="w-full flex gap-3">
        <PillButton onClick={onEdit} variant="outline" className="flex-1">
          팩 수정
        </PillButton>
        <PillButton onClick={() => onStart(pack)} className="flex-1">
          <Play size={15} fill="currentColor" /> 학습 시작하기
        </PillButton>
      </div>
    </div>
  );
}

function ModeSelectScreen({ title, count, onBack, onSelect }) {
  return (
    <div>
      <TopBar title="학습 방식 선택" onBack={onBack} />
      {title && (
        <p className="px-5 text-[13px] text-[#7A879C] -mt-1 mb-4 truncate">
          {title} · {count}개 단어
        </p>
      )}
      <div className="px-5 flex flex-col gap-3 pb-8">
        {QUIZ_MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              className="w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-3.5 shadow-sm text-left active:scale-[0.98] transition-transform"
            >
              <span className="w-10 h-10 rounded-full bg-[#EAF3FB] text-[#2E6FBE] flex items-center justify-center shrink-0">
                <Icon size={19} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[#1E2A3A] font-semibold">{m.title}</p>
                <p className="text-[12px] text-[#7A879C]">{m.desc}</p>
              </div>
              <ChevronRight size={18} className="text-[#B7C4D6] shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QuizScreen({ words, label, mode, onFinish, onExit }) {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [wrong, setWrong] = useState([]);
  const [selected, setSelected] = useState(null);
  const [locked, setLocked] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [wasCorrect, setWasCorrect] = useState(false);
  const startRef = useRef(Date.now());
  const inputRef = useRef(null);

  const choice = isChoiceMode(mode);
  const answerLang = answerLangOf(mode);
  const current = words[idx];
  const meaningsList = current
    ? (current.meanings && current.meanings.length ? current.meanings : splitMeanings(current.ko))
    : [];
  const koChoiceAnswer = useMemo(() => {
    if (!meaningsList.length) return current ? current.ko : "";
    return meaningsList[Math.floor(Math.random() * meaningsList.length)];
  }, [idx]);
  const correctAnswer = current
    ? answerLang === "en"
      ? current.en
      : choice
      ? koChoiceAnswer
      : current.ko
    : "";
  const promptText = current ? (answerLang === "en" ? current.ko : current.en) : "";
  const promptIsEnglish = answerLang === "ko";

  const options = useMemo(() => {
    if (!current || !choice) return [];
    const pool =
      answerLang === "en"
        ? (current.distractorsEn || [])
        : (current.distractors || current.distractorsKo || []);
    return shuffle([correctAnswer, ...pool.slice(0, 3)]);
  }, [idx, koChoiceAnswer]);

  useEffect(() => {
    if (current && promptIsEnglish) speak(current.en);
  }, [idx]);

  useEffect(() => {
    setInputValue("");
    if (!choice && inputRef.current) {
      inputRef.current.focus();
    }
  }, [idx]);

  if (!current) return null;

  function advance(correct, wrongEntry) {
    const finalScore = correct ? score + 1 : score;
    const finalWrong = correct ? wrong : [...wrong, wrongEntry];
    setTimeout(() => {
      if (idx + 1 < words.length) {
        setScore(finalScore);
        setWrong(finalWrong);
        setIdx((i) => i + 1);
        setSelected(null);
        setLocked(false);
        setWasCorrect(false);
      } else {
        const elapsed = Math.round((Date.now() - startRef.current) / 1000);
        onFinish(finalScore, finalWrong, words, elapsed);
      }
    }, choice ? 850 : 1100);
  }

  function handleSelect(opt) {
    if (locked) return;
    setSelected(opt);
    setLocked(true);
    const correct = opt === correctAnswer;
    setWasCorrect(correct);
    advance(correct, current);
  }

  function normalize(v) {
    return v.trim().replace(/\s+/g, " ");
  }

  function handleSubmitInput(e) {
    e.preventDefault();
    if (locked) return;
    const cleanInput = normalize(inputValue);
    if (!cleanInput) return;
    const correct =
      answerLang === "en"
        ? cleanInput.toLowerCase() === normalize(correctAnswer).toLowerCase()
        : meaningsList.some((m) => normalize(m) === cleanInput);
    setLocked(true);
    setWasCorrect(correct);
    advance(correct, current);
  }

  function rowClass(opt) {
    if (!locked) return "bg-white text-[#1E2A3A] active:scale-[0.98]";
    if (opt === correctAnswer) return "bg-[#E1F5EA] text-[#1E8A56] ring-2 ring-[#3FA66B]";
    if (opt === selected) return "bg-[#FBE4E1] text-[#C13E32] ring-2 ring-[#E2574A]";
    return "bg-white text-[#B7C4D6] opacity-60";
  }

  function badgeClass(opt) {
    if (!locked) return "bg-[#EAF3FB] text-[#7A879C]";
    if (opt === correctAnswer) return "bg-[#3FA66B] text-white";
    if (opt === selected) return "bg-[#E2574A] text-white";
    return "bg-[#EAF3FB] text-[#B7C4D6]";
  }

  const progressPct = Math.round(((idx + (locked ? 1 : 0)) / words.length) * 100);
  const modeInfo = QUIZ_MODES.find((m) => m.id === mode);

  return (
    <div>
      <div className="flex items-center gap-3 px-5 pt-6 pb-1">
        <button onClick={onExit} className="p-1.5 -ml-1.5 rounded-full hover:bg-[#DDEBFA] text-[#1E2A3A]">
          <ArrowLeft size={20} />
        </button>
        <p className="text-[15px] font-bold text-[#1E2A3A]">학습 중</p>
        <span className="text-[13px] text-[#7A879C]">
          {idx + 1} / {words.length}
        </span>
      </div>
      <p className="px-5 text-[12px] text-[#7A879C] mb-2 truncate">
        {label}
        {label && modeInfo ? " · " : ""}
        {modeInfo?.title}
      </p>
      <div className="px-5 mb-6">
        <div className="h-1.5 bg-[#DDEBFA] rounded-full overflow-hidden">
          <div className="h-full bg-[#2E6FBE] transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="px-5">
        <div className="bg-white rounded-2xl px-6 py-8 flex flex-col items-center gap-2 shadow-sm mb-6">
          <div className="flex items-center gap-2">
            <p className="text-[30px] font-bold text-[#1E2A3A]">{promptText}</p>
            {promptIsEnglish && (
              <button onClick={() => speak(current.en)} className="text-[#2E6FBE] shrink-0">
                <Volume2 size={20} />
              </button>
            )}
          </div>
          <p className="text-[14px] text-[#7A879C]">
            {answerLang === "en" ? "이 뜻에 맞는 영어 단어는?" : "이 단어의 뜻은?"}
          </p>
        </div>

        {locked && current.related && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#FFF3E0] text-[#8A5A1E] text-[13px] mb-4">
            💡 {current.related}
          </div>
        )}

        {choice ? (
          <div className="flex flex-col gap-2.5">
            {options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleSelect(opt)}
                disabled={locked}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[15px] font-medium shadow-sm transition-colors ${rowClass(opt)}`}
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 ${badgeClass(opt)}`}
                >
                  {!locked && i + 1}
                  {locked && opt === correctAnswer && <Check size={13} />}
                  {locked && opt !== correctAnswer && opt === selected && <CloseIcon size={13} />}
                </span>
                <span className="text-left">{opt}</span>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmitInput} className="flex flex-col gap-3">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={locked}
              placeholder={answerLang === "en" ? "영어 단어를 입력하세요" : "한국어 뜻을 입력하세요"}
              className={`w-full px-4 py-3.5 rounded-2xl text-[16px] font-medium shadow-sm outline-none border-2 transition-colors ${
                !locked
                  ? "bg-white border-transparent text-[#1E2A3A] focus:border-[#2E6FBE]"
                  : wasCorrect
                  ? "bg-[#E1F5EA] border-[#3FA66B] text-[#1E8A56]"
                  : "bg-[#FBE4E1] border-[#E2574A] text-[#C13E32]"
              }`}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {locked && !wasCorrect && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#EAF3FB] text-[#1E2A3A] text-[14px]">
                <Check size={15} className="text-[#3FA66B] shrink-0" />
                정답: <span className="font-bold">{correctAnswer}</span>
              </div>
            )}
            {!locked && (
              <PillButton onClick={handleSubmitInput} disabled={!normalize(inputValue)}>
                확인
              </PillButton>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function ResultScreen({ result, onGoWrongnote, onRetry, onHome }) {
  const pct = result.total > 0
    ? Math.round((result.score / result.total) * 100)
    : 0;

  return (
    <div className="w-full px-6 py-10 flex flex-col items-center text-center">
      <TrophyIllustration />

      <p className="text-[13px] text-[#7A879C] mb-1">
        점수
      </p>

      <p className="text-[40px] font-bold text-[#1E2A3A] leading-none">
        {result.score}
        <span className="text-[20px] font-medium text-[#7A879C]">
          {" "} / {result.total}
        </span>
      </p>

      <div className="mt-3 mb-6 px-4 py-1.5 rounded-full bg-[#EAF3FB] text-[#2E6FBE] text-[11px] font-semibold">
        정답률 {pct}%
      </div>

      <div className="w-full max-w-2xl bg-white rounded-2xl px-4 py-5 flex items-stretch shadow-sm mb-8">

        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <p className="text-[20px] font-bold text-[#3FA66B]">
            {result.score}
          </p>
          <p className="text-[12px] text-[#7A879C] mt-1">
            정답
          </p>
        </div>

        <div className="w-px bg-[#EEF3FA]" />

        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <p className="text-[20px] font-bold text-[#E2574A]">
            {result.wrong.length}
          </p>
          <p className="text-[12px] text-[#7A879C] mt-1">
            오답
          </p>
        </div>

        <div className="w-px bg-[#EEF3FA]" />

        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <p className="text-[20px] font-bold text-[#1E2A3A]">
            {formatTime(result.elapsed || 0)}
          </p>
          <p className="text-[12px] text-[#7A879C] mt-1">
            학습 시간
          </p>
        </div>
      </div>

      <div className="w-full max-w-2xl flex flex-col gap-3">
        {result.wrong.length > 0 && (
          <PillButton
            onClick={onGoWrongnote}
            variant="outline"
            className="w-full"
          >
            틀린 문제 확인하기
          </PillButton>
        )}

        <PillButton
          onClick={onRetry}
          className="w-full"
        >
          <RefreshCw size={16} />
          다시 학습하기
        </PillButton>

        <button
          onClick={onHome}
          className="text-[#7A879C] text-[14px] font-medium py-2"
        >
          메인으로
        </button>
      </div>
    </div>
  );
}

function WrongNoteScreen({ packs, wrongMap, loading, onRetest, onRemoveWord }) {
  const packNames = useMemo(() => {
    const m = {};
    packs.forEach((p) => (m[p.id] = p.name));
    return m;
  }, [packs]);

  const entries = Object.entries(wrongMap).filter(([, words]) => words.length > 0);
  const total = entries.reduce((s, [, w]) => s + w.length, 0);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);

  const visible = filter === "all" ? entries : entries.filter(([id]) => id === filter);

  return (
    <div>
      <div className="flex items-center justify-between px-5 pt-6">
        <h1 className="text-[21px] font-bold text-[#1E2A3A]">오답노트</h1>
        <Jellyfish size={34} />
      </div>
      <p className="px-5 text-[13px] text-[#7A879C] mt-1 mb-4">틀린 단어를 복습하고 완벽하게 기억해요!</p>

      {entries.length > 0 && (
        <div className="px-5 flex gap-2 mb-4 overflow-x-auto">
          <button
            onClick={() => setFilter("all")}
            className={`px-3.5 py-2 rounded-full text-[13px] font-semibold shrink-0 ${filter === "all" ? "bg-[#2E6FBE] text-white" : "bg-white text-[#1E2A3A] shadow-sm"}`}
          >
            전체 {total}
          </button>
          {entries.map(([id, words]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`px-3.5 py-2 rounded-full text-[13px] font-semibold shrink-0 ${filter === id ? "bg-[#2E6FBE] text-white" : "bg-white text-[#1E2A3A] shadow-sm"}`}
            >
              {packNames[id] || "삭제된 팩"} {words.length}
            </button>
          ))}
        </div>
      )}

      <div className="px-5 flex flex-col gap-3 pb-8">
        {loading && (
          <div className="flex items-center gap-2 text-[#7A879C] text-sm py-8 justify-center">
            <Loader2 size={16} className="animate-spin" /> 불러오는 중...
          </div>
        )}
        {!loading && entries.length === 0 && (
          <EmptyState Icon={XCircle} title="오답노트가 비어있어요" body="퀴즈를 풀다가 틀린 단어가 여기에 자동으로 쌓여요." />
        )}
        {visible.map(([packId, words]) => (
          <div key={packId} className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={() => setExpanded(expanded === packId ? null : packId)}
              className="w-full flex items-center justify-between px-4 py-3.5"
            >
              <div className="text-left">
                <p className="text-[#1E2A3A] font-semibold">{packNames[packId] || "삭제된 팩"}</p>
                <p className="text-[12px] text-[#7A879C]">{words.length}개</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRetest(packId, packNames[packId] || "오답노트", words);
                }}
                className="bg-[#2E6FBE] text-white rounded-full px-4 py-2 text-[13px] font-semibold flex items-center gap-1.5 shrink-0"
              >
                <Play size={11} fill="currentColor" /> 다시 테스트
              </button>
            </button>
            {expanded === packId && (
              <div className="flex flex-col divide-y divide-[#EEF3FA] border-t border-[#EEF3FA]">
                {words.map((w) => (
                  <div key={w.id || w.en} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <span className="text-[#1E2A3A] font-medium text-sm">{w.en}</span>
                      <span className="text-[#7A879C] text-sm ml-2">{w.ko}</span>
                    </div>
                    <button onClick={() => onRemoveWord(packId, w)} className="text-[#B7C4D6] hover:text-[#E2574A]">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatBar({ pct, tone = "blue" }) {
  const colors = {
    blue: "#2E6FBE",
    green: "#3FA66B",
    orange: "#F08C2A",
  };
  return (
    <div className="h-2 bg-[#EAF3FB] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: colors[tone] }}
      />
    </div>
  );
}

function StatsScreen({ packs, history, loading, onDeleteEntry, onClearAll, onGoPacks }) {
  const [filter, setFilter] = useState("all");

  const packNames = useMemo(() => {
    const m = {};
    packs.forEach((p) => (m[p.id] = p.name));
    return m;
  }, [packs]);

  const totalAttempts = history.length;
  const totalQuestions = history.reduce((s, h) => s + (h.total || 0), 0);
  const totalCorrect = history.reduce((s, h) => s + (h.score || 0), 0);
  const overallAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const totalTime = history.reduce((s, h) => s + (h.elapsed || 0), 0);

  const perPack = useMemo(() => {
    const map = {};
    history.forEach((h) => {
      const key = h.packId || "unknown";
      if (!map[key]) {
        map[key] = {
          packId: key,
          label: packNames[key] || h.label || "삭제된 팩",
          attempts: 0,
          correct: 0,
          total: 0,
          lastTs: 0,
        };
      }
      map[key].attempts += 1;
      map[key].correct += h.score || 0;
      map[key].total += h.total || 0;
      map[key].lastTs = Math.max(map[key].lastTs, h.ts || 0);
    });
    return Object.values(map).sort((a, b) => b.lastTs - a.lastTs);
  }, [history, packNames]);

  const filterOptions = [{ key: "all", label: "전체" }, ...perPack.map((p) => ({ key: p.packId, label: p.label }))];
  const visibleHistory = (filter === "all" ? history : history.filter((h) => (h.packId || "unknown") === filter)).slice(0, 30);

  function formatDate(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  return (
    <div>
      <div className="flex items-center justify-between px-5 pt-6">
        <h1 className="text-[21px] font-bold text-[#1E2A3A]">통계</h1>
        <Jellyfish size={34} />
      </div>
      <p className="px-5 text-[13px] text-[#7A879C] mt-1 mb-4">지금까지 풀이한 기록을 한눈에 확인해요.</p>

      {loading && (
        <div className="flex items-center gap-2 text-[#7A879C] text-sm py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> 불러오는 중...
        </div>
      )}

      {!loading && totalAttempts === 0 && (
        <EmptyState
          Icon={BarChart3}
          title="아직 풀이 기록이 없어요"
          body="단어팩을 학습하면 여기에 점수와 정답률이 자동으로 쌓여요."
        />
      )}

      {!loading && totalAttempts > 0 && (
        <>
          <div className="px-5 grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white rounded-2xl px-4 py-3.5 shadow-sm">
              <p className="text-[22px] font-bold text-[#1E2A3A]">{totalAttempts}회</p>
              <p className="text-[12px] text-[#7A879C]">총 학습 횟수</p>
            </div>
            <div className="bg-white rounded-2xl px-4 py-3.5 shadow-sm">
              <p className="text-[22px] font-bold text-[#1E2A3A]">{totalQuestions}개</p>
              <p className="text-[12px] text-[#7A879C]">총 푼 문제</p>
            </div>
            <div className="bg-white rounded-2xl px-4 py-3.5 shadow-sm">
              <p className="text-[22px] font-bold text-[#2E6FBE]">{overallAccuracy}%</p>
              <p className="text-[12px] text-[#7A879C]">평균 정답률</p>
            </div>
            <div className="bg-white rounded-2xl px-4 py-3.5 shadow-sm">
              <p className="text-[22px] font-bold text-[#1E2A3A]">{formatTime(totalTime)}</p>
              <p className="text-[12px] text-[#7A879C]">총 학습 시간</p>
            </div>
          </div>

          <div className="px-5 mb-2 flex items-center justify-between">
            <p className="text-[15px] font-bold text-[#1E2A3A]">단어팩별 정답률</p>
          </div>
          <div className="px-5 flex flex-col gap-3 mb-6">
            {perPack.map((p) => {
              const pct = p.total > 0 ? Math.round((p.correct / p.total) * 100) : 0;
              return (
                <div key={p.packId} className="bg-white rounded-2xl px-4 py-3.5 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[#1E2A3A] font-semibold text-[14px] truncate mr-2">{p.label}</p>
                    <span className="text-[13px] font-bold text-[#2E6FBE] shrink-0">{pct}%</span>
                  </div>
                  <StatBar pct={pct} tone={pct >= 80 ? "green" : pct >= 50 ? "blue" : "orange"} />
                  <p className="text-[11px] text-[#B7C4D6] mt-1.5">
                    {p.attempts}회 학습 · {p.correct}/{p.total}개 정답
                  </p>
                </div>
              );
            })}
          </div>

          <div className="px-5 flex items-center justify-between mb-3">
            <p className="text-[15px] font-bold text-[#1E2A3A]">최근 풀이 기록</p>
            <button onClick={onClearAll} className="text-[12px] text-[#B7C4D6] hover:text-[#E2574A] font-medium">
              전체 삭제
            </button>
          </div>

          {filterOptions.length > 1 && (
            <div className="px-5 flex gap-2 mb-3 overflow-x-auto">
              {filterOptions.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3.5 py-2 rounded-full text-[13px] font-semibold shrink-0 ${filter === f.key ? "bg-[#2E6FBE] text-white" : "bg-white text-[#1E2A3A] shadow-sm"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          <div className="px-5 flex flex-col gap-2 pb-8">
            {visibleHistory.map((h) => {
              const pct = h.total > 0 ? Math.round((h.score / h.total) * 100) : 0;
              const modeInfo = QUIZ_MODES.find((m) => m.id === h.mode);
              return (
                <div key={h.id} className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-[#1E2A3A] font-semibold text-[13px] truncate">
                      {packNames[h.packId] || h.label || "삭제된 팩"}
                    </p>
                    <p className="text-[11px] text-[#B7C4D6] flex items-center gap-1.5 mt-0.5">
                      {formatDate(h.ts)} · {modeInfo?.title || h.mode}
                      <span className="inline-flex items-center gap-0.5">
                        <Clock size={10} /> {formatTime(h.elapsed || 0)}
                      </span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[13px] font-bold text-[#1E2A3A]">
                      {h.score}/{h.total}
                    </p>
                    <p className={`text-[11px] font-semibold ${pct >= 80 ? "text-[#3FA66B]" : pct >= 50 ? "text-[#2E6FBE]" : "text-[#E2574A]"}`}>
                      {pct}%
                    </p>
                  </div>
                  <button onClick={() => onDeleteEntry(h.id)} className="text-[#B7C4D6] hover:text-[#E2574A] shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("home");
  const [packsStep, setPacksStep] = useState("list");
  const [draftName, setDraftName] = useState("");
  const [draftWords, setDraftWords] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [savedPack, setSavedPack] = useState(null);
  const [saving, setSaving] = useState(false);

  const [packs, setPacks] = useState([]);
  const [loadingPacks, setLoadingPacks] = useState(true);
  const [wrongMap, setWrongMap] = useState({});
  const [loadingWrong, setLoadingWrong] = useState(true);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [quizWords, setQuizWords] = useState([]);
  const [quizMeta, setQuizMeta] = useState(null);
  const [result, setResult] = useState(null);
  const [pendingQuiz, setPendingQuiz] = useState(null);

  useEffect(() => {
    (async () => {
      await seedDefaultPacks();
      refreshPacks();
      refreshWrong();
      refreshHistory();
    })();
  }, []);

  async function refreshPacks() {
    setLoadingPacks(true);
    setPacks(await loadAllPacks());
    setLoadingPacks(false);
  }
  async function refreshWrong() {
    setLoadingWrong(true);
    setWrongMap(await loadWrongMap());
    setLoadingWrong(false);
  }
  async function refreshHistory() {
    setLoadingHistory(true);
    setHistory(await loadHistory());
    setLoadingHistory(false);
  }

  function wordMeanings(w) {
    return w.meanings && w.meanings.length ? w.meanings : splitMeanings(w.ko);
  }

  function fillDistractors(words) {
    return words.map((w) => {
      const myMeanings = wordMeanings(w);
      const koPool = shuffle(
        words
          .filter((x) => x.id !== w.id)
          .map((x) => {
            const ms = wordMeanings(x);
            return ms[Math.floor(Math.random() * ms.length)];
          })
          .filter((k) => k && !myMeanings.includes(k))
      );
      const enPool = shuffle(words.map((x) => x.en).filter((e) => e !== w.en));
      return {
        ...w,
        meanings: myMeanings,
        distractors: koPool.slice(0, 3),
        distractorsEn: enPool.slice(0, 3),
      };
    });
  }

  function handleStartPack(pack) {
    setPendingQuiz({ type: "pack", pack });
    setView("modeSelect");
  }

  function handleRetest(packId, label, words) {
    setPendingQuiz({ type: "retest", packId, label, words });
    setView("modeSelect");
  }

  function beginQuizWithMode(mode) {
    if (!pendingQuiz) return;
    if (pendingQuiz.type === "pack") {
      const filled = fillDistractors(pendingQuiz.pack.words);
      setQuizWords(shuffle(filled));
      setQuizMeta({ packId: pendingQuiz.pack.id, label: pendingQuiz.pack.name, mode });
    } else {
      const filled = fillDistractors(pendingQuiz.words);
      setQuizWords(shuffle(filled));
      setQuizMeta({ packId: pendingQuiz.packId, label: `오답노트 · ${pendingQuiz.label}`, mode });
    }
    setPendingQuiz(null);
    setView("quiz");
  }

  function cancelModeSelect() {
    const returnView = pendingQuiz?.type === "retest" ? "wrongnote" : "packs";
    setPendingQuiz(null);
    setView(returnView);
  }

  async function handleQuizFinish(finalScore, finalWrong, attemptedWords, elapsed) {
    const { packId, label, mode } = quizMeta;
    try {
      const existing = (await getJSON("wrongnote:" + packId)) || [];
      const attemptedEn = new Set(attemptedWords.map((w) => w.en));
      const kept = existing.filter((w) => !attemptedEn.has(w.en));
      const merged = [...kept, ...finalWrong];
      if (merged.length > 0) await setJSON("wrongnote:" + packId, merged);
      else await deleteKey("wrongnote:" + packId);
      await refreshWrong();
    } catch (e) {
      console.error(e);
    }
    try {
      const entry = {
        id: uid(),
        packId,
        label,
        mode,
        score: finalScore,
        total: attemptedWords.length,
        wrongCount: finalWrong.length,
        elapsed,
        ts: Date.now(),
      };
      await setJSON("history:" + entry.id, entry);
      await refreshHistory();
    } catch (e) {
      console.error(e);
    }
    setResult({ score: finalScore, total: attemptedWords.length, wrong: finalWrong, packId, label, elapsed });
    setView("result");
  }

  async function handleDeleteHistoryEntry(id) {
    await deleteKey("history:" + id);
    refreshHistory();
  }

  async function handleClearHistory() {
    const keys = await listKeys("history:");
    for (const k of keys) await deleteKey(k);
    refreshHistory();
  }

  async function handleRemoveWrongWord(packId, word) {
    const existing = (await getJSON("wrongnote:" + packId)) || [];
    const filtered = existing.filter((w) => w.en !== word.en);
    if (filtered.length > 0) await setJSON("wrongnote:" + packId, filtered);
    else await deleteKey("wrongnote:" + packId);
    refreshWrong();
  }

  function goPacksList() {
    setPacksStep("list");
    setDraftName("");
    setDraftWords([]);
    setEditingId(null);
    setSavedPack(null);
    setView("packs");
  }

  async function handleSavePack(name, words) {
    setSaving(true);
    const pack = {
      id: editingId || uid(),
      name,
      words: words.map((w) => ({
        id: w.id || uid(),
        en: w.en.trim(),
        ko: w.ko.trim(),
        meanings: (w.meanings && w.meanings.length ? w.meanings : splitMeanings(w.ko)),
        ...(w.related && w.related.trim() ? { related: w.related.trim() } : {}),
      })),
      createdAt: Date.now(),
    };
    await setJSON("pack:" + pack.id, pack);
    setSaving(false);
    setSavedPack(pack);
    setPacksStep("success");
    await refreshPacks();
  }

  async function handleDeletePack(id) {
    await deleteKey("pack:" + id);
    await deleteKey("wrongnote:" + id);
    refreshPacks();
    refreshWrong();
  }

  async function handleAddDefaultPack(defaultPack) {
    const pack = buildDefaultPackObject(defaultPack);
    await setJSON("pack:" + pack.id, pack);
    const seeded = await getSeededDefaultKeys();
    if (!seeded.includes(defaultPack.key)) {
      await setJSON(SEEDED_DEFAULTS_KEY, [...seeded, defaultPack.key]);
    }
    await refreshPacks();
  }

  const totalWrongCount = Object.values(wrongMap).reduce((s, a) => s + a.length, 0);

  let body;
  if (view === "home") {
    body = (
      <HomeScreen
        packs={packs}
        loading={loadingPacks}
        wrongMap={wrongMap}
        onStart={handleStartPack}
        onGoPacks={goPacksList}
        onGoWrongnote={() => setView("wrongnote")}
      />
    );
  } else if (view === "packs") {
    if (packsStep === "list") {
      body = (
        <PacksListScreen
          packs={packs}
          loading={loadingPacks}
          onStart={handleStartPack}
          onGoManual={() => setPacksStep("manual")}
          onEdit={(p) => {
            setEditingId(p.id);
            setDraftName(p.name);
            setDraftWords(p.words.map((w) => ({ ...w })));
            setPacksStep("preview");
          }}
          onDelete={handleDeletePack}
          onAddDefault={handleAddDefaultPack}
        />
      );
    } else if (packsStep === "manual") {
      body = (
        <ManualInputScreen
          onBack={() => setPacksStep("list")}
          onParsed={(words) => {
            setDraftWords(words);
            setEditingId(null);
            setPacksStep("preview");
          }}
        />
      );
    } else if (packsStep === "preview") {
      body = (
        <PreviewScreen
          initialName={draftName}
          initialWords={draftWords}
          saving={saving}
          onBack={() => setPacksStep(editingId ? "list" : "manual")}
          onSave={handleSavePack}
        />
      );
    } else if (packsStep === "success") {
      body = (
        <SuccessScreen
          pack={savedPack}
          onEdit={() => {
            setDraftName(savedPack.name);
            setDraftWords(savedPack.words);
            setEditingId(savedPack.id);
            setPacksStep("preview");
          }}
          onStart={(p) => {
            goPacksList();
            handleStartPack(p);
          }}
        />
      );
    }
  } else if (view === "modeSelect" && pendingQuiz) {
    const title = pendingQuiz.type === "pack" ? pendingQuiz.pack.name : pendingQuiz.label;
    const count = pendingQuiz.type === "pack" ? pendingQuiz.pack.words.length : pendingQuiz.words.length;
    body = (
      <ModeSelectScreen
        title={title}
        count={count}
        onBack={cancelModeSelect}
        onSelect={beginQuizWithMode}
      />
    );
  } else if (view === "quiz" && quizMeta) {
    body = (
      <QuizScreen
        words={quizWords}
        label={quizMeta.label}
        mode={quizMeta.mode}
        onFinish={handleQuizFinish}
        onExit={() => setView("home")}
      />
    );
  } else if (view === "result" && result) {
    body = (
      <ResultScreen
        result={result}
        onGoWrongnote={() => setView("wrongnote")}
        onRetry={() => {
          setQuizWords(shuffle(quizWords));
          setView("quiz");
        }}
        onHome={() => setView("home")}
      />
    );
  } else if (view === "wrongnote") {
    body = (
      <WrongNoteScreen
        packs={packs}
        wrongMap={wrongMap}
        loading={loadingWrong}
        onRetest={handleRetest}
        onRemoveWord={handleRemoveWrongWord}
      />
    );
  } else if (view === "stats") {
    body = (
      <StatsScreen
        packs={packs}
        history={history}
        loading={loadingHistory}
        onDeleteEntry={handleDeleteHistoryEntry}
        onClearAll={handleClearHistory}
        onGoPacks={goPacksList}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#EAF3FB] flex">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');

        * {
          font-family: 'Noto Sans KR', sans-serif;
          box-sizing: border-box;
        }

        body {
          margin: 0;
        }
      `}</style>

      <NavBar
        view={view === "quiz" || view === "result" || view === "modeSelect" ? "home" : view}
        setView={(v) => {
          setPendingQuiz(null);
          if (v === "packs") {
            goPacksList();
          } else {
            setView(v);
          }
        }}
        wrongCount={totalWrongCount}
      />

      <main className="flex-1 min-w-0 min-h-screen overflow-y-auto">

        <div className="w-full max-w-7xl mx-auto px-6 md:px-10 py-6">
          {body}
        </div>
      </main>
    </div>
  );
}
