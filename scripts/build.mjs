// Real Estate News Dashboard - daily build script (Node 18+ ESM)
// Crawls Naver Search API + RSS, computes insights, generates index.html
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const CID = process.env.NAVER_CLIENT_ID;
const SECRET = process.env.NAVER_CLIENT_SECRET;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;
const SITE_URL = process.env.SITE_URL || 'https://friscomike94.github.io/realestate-news-dashboard/';

// ---------------- config ----------------
const RSS_FEEDS = [
  { name: '한국경제', url: 'https://www.hankyung.com/feed/realestate', re: true },
  { name: '매일경제', url: 'https://www.mk.co.kr/rss/50300009/', re: true },
  { name: '조선비즈', url: 'https://biz.chosun.com/arc/outboundfeeds/rss/category/real_estate/?outputType=xml', re: true },
  { name: '연합뉴스', url: 'https://www.yna.co.kr/rss/economy.xml', re: false },
  { name: '뉴시스', url: 'https://newsis.com/RSS/economy.xml', re: false },
];
const NAVER_QUERIES = ['아파트 분양','재건축 재개발','부동산 시장','전세 월세','부동산 규제 정책','청약 경쟁률','집값 전셋값','신도시 공급대책','공공주택 LH','부동산 대출 DSR','오피스텔 상가','실거래가 아파트'];
const CAP = 450;           // max articles kept
const DAYS = 2;            // keep most recent N days

const CORE_RE = ['부동산','아파트','분양','청약','재건축','재개발','전셋값','전세사기','임대차','집값','주택','공공주택','정비사업','분양가','매매가','실거래','신도시','GTX','오피스텔','재정비','리모델링','택지','LH','종부세','양도세','전세대출','주담대','월세','공시가','미분양','입주','시행사','조합','역세권','그린벨트','꼬마빌딩','리츠','용적률','전세','매매'];
const NOISE = [/발효미생물/,/AI인재/,/\[인사\]/,/오늘의 주요일정/,/안전교육 지원/,/추미애/,/정점식/,/ETF/,/김용범/,/삼전/,/닉스/,/SMR/,/납-비스무트/,/잠재성장/,/혁신제품/,/등대/,/향토기업/,/현장점검/,/폭염/,/기후위기/,/월러/,/연준/,/인플레/,/조달청/,/ICT 수출/,/원전/];

const CAT_RULES = [
  ['정책·규제', ['규제','대책','정책','국토부','종부세','양도세','취득세','세제','LTV','DSR','공급대책','그린벨트','개발제한','완화','제도','법안','국회','공시가','오세훈','공공기여']],
  ['재건축·재개발', ['재건축','재개발','정비사업','조합','리모델링','재정비','추진위','안전진단','신탁방식','도시정비','수주']],
  ['분양·청약', ['분양','청약','입주','분양가','견본주택','모델하우스','당첨','청약통장','일반분양','줍줍','특공','경쟁률']],
  ['금리·대출', ['금리','대출','DSR','주담대','이자','기준금리','전세대출','대출규제','금융보증']],
  ['전세·임대', ['전세','월세','임대차','전셋값','임대','보증금','갱신','세입자','역전세','전세사기','공공임대']],
  ['공급·개발', ['신도시','공공주택','GTX','택지','LH','3기','교통','역세권','도시개발','보상','지구지정','데이터센터']],
  ['시장·시세', ['집값','매매가','시세','거래량','상승','하락','매물','호가','실거래','경매','낙찰','시장동향','전망','아파트값','빅딜','거래']],
  ['상업용·기타', ['오피스','상가','물류','공유오피스','리츠','빌딩','꼬마빌딩','상업용','호텔','상권','갤러리','창고']],
];
const REGION_MAP = {
  '서울': ['서울','강남','서초','송파','강동','마포','용산','성동','영등포','노원','은평','광진','동작','양천','구로','금천','관악','동대문','성북','중랑','도봉','강북','서대문','종로','여의도','목동','반포','압구정','잠실','한남','청담','개포','신사동','도산','태평'],
  '경기': ['경기','수원','광명','시흥','화성','동탄','판교','분당','성남','과천','하남','용인','고양','남양주','의정부','안양','부천','김포','파주','평택','오산','군포','의왕','위례','일산','가재울'],
  '인천': ['인천','송도','청라','영종','계양','검단','루원'],
  '지방': ['부산','대구','광주','대전','울산','세종','강원','충청','전라','경상','제주','창원','청주','천안','전주','포항','문현동','혁신도시'],
};
const PRESS_MAP = {'chosun.com':'조선일보','biz.chosun.com':'조선비즈','joongang.co.kr':'중앙일보','donga.com':'동아일보','hankyung.com':'한국경제','mk.co.kr':'매일경제','mt.co.kr':'머니투데이','edaily.co.kr':'이데일리','sedaily.com':'서울경제','fnnews.com':'파이낸셜뉴스','hankookilbo.com':'한국일보','khan.co.kr':'경향신문','hani.co.kr':'한겨레','seoul.co.kr':'서울신문','kmib.co.kr':'국민일보','segye.com':'세계일보','munhwa.com':'문화일보','asiae.co.kr':'아시아경제','heraldcorp.com':'헤럴드경제','dt.co.kr':'디지털타임스','etnews.com':'전자신문','yna.co.kr':'연합뉴스','newsis.com':'뉴시스','news1.kr':'뉴스1','dailian.co.kr':'데일리안','ajunews.com':'아주경제','newspim.com':'뉴스핌','wowtv.co.kr':'한국경제TV','ytn.co.kr':'YTN','imaeil.com':'매일신문','nocutnews.co.kr':'노컷뉴스','etoday.co.kr':'이투데이','inews24.com':'아이뉴스24','businesspost.co.kr':'비즈니스포스트','thebell.co.kr':'더벨','fntimes.com':'한국금융신문','ddaily.co.kr':'디지털데일리','g-enews.com':'글로벌이코노믹','ikld.kr':'국토일보'};

const BULL = ['상승','급등','신고가','최고가','전고점','강세','훈풍','반등','활황','완판','흥행','껑충','급등세','상승세','뛰었','뛴다','뛴','올랐','오른','치솟','상향','호재','온기','들썩','과열','불붙','고공','매수세','회복세','오름세','웃돈','프리미엄','수요 몰','경쟁률','금리 인하','규제 완화','규제완화'];
const BEAR = ['하락','급락','약세','침체','위축','미분양','관망','둔화','역전세','전세사기','유찰','폭락','하락세','거래절벽','한파','빙하기','경색','미달','내림','떨어','꺾','위기','하향','급매','적체','약보합','금리 인상','빅스텝','대출 규제','대출규제','규제 강화','규제강화','자금 경색','한숨'];

const BUILDERS = {'삼성물산':['삼성물산','래미안'],'GS건설':['GS건설','자이'],'현대건설':['현대건설','힐스테이트','디에이치'],'현대엔지니어링':['현대엔지니어링'],'대우건설':['대우건설','푸르지오'],'DL이앤씨':['DL이앤씨','e편한세상','아크로'],'롯데건설':['롯데건설','롯데캐슬'],'포스코이앤씨':['포스코이앤씨','더샵'],'HDC현대산업개발':['HDC현대','아이파크'],'호반건설':['호반'],'중흥건설':['중흥'],'SK에코플랜트':['SK에코'],'코오롱글로벌':['코오롱','하늘채'],'계룡건설':['계룡건설'],'반도건설':['반도건설','유보라'],'한화':['포레나'],'금호건설':['금호건설','어울림'],'두산건설':['위브'],'대방건설':['대방','디에트르'],'LH':['LH','한국토지주택'],'SH공사':['SH공사','서울주택'],'HUG':['HUG','주택도시보증']};
const ORGS = {'국토교통부':['국토부','국토교통부'],'기획재정부':['기재부','기획재정부'],'한국은행':['한국은행','한은'],'오세훈':['오세훈'],'이재명':['이재명','이 대통령','李대통령','李 대통령'],'주택산업연구원':['주택산업연구','주산연'],'금융위':['금융위'],'국회':['국회']};
const ENT_REGIONS = {'광명시흥':['광명시흥'],'동탄':['동탄'],'강남':['강남'],'서초':['서초'],'송파':['송파'],'용산':['용산'],'반포':['반포'],'여의도':['여의도'],'수도권':['수도권'],'3기 신도시':['3기 신도시','3기신도시'],'위례':['위례'],'판교':['판교'],'검단':['검단'],'송도':['송도'],'인천':['인천'],'부산':['부산']};

const TREND = ['재건축','재개발','분양','청약','전세','월세','매매','집값','금리','대출','규제','공급','신도시','GTX','공공주택','오피스','상가','리츠','전셋값','입주','정비사업','조합','분양가','실거래','경매','매물','종부세','양도세','DSR','임대','전세사기','택지','LH','보상','역세권','동탄','강남','서초','용산','반포','수도권','미분양','상승','대책','수주','경쟁률','줍줍','데이터센터','용적률','반도체','토허제'];

// ---------------- helpers ----------------
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const strip = s => (s||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,' ').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&apos;/g,"'").replace(/&#x3D;/g,'=').replace(/\s+/g,' ').trim();

function pressFromUrl(url){
  try { let h = new URL(url).hostname.replace(/^www\./,'');
    if (PRESS_MAP[h]) return PRESS_MAP[h];
    const base = h.split('.').slice(-2).join('.');
    if (PRESS_MAP[base]) return PRESS_MAP[base];
    const parts = h.split('.').filter(x => !['www','news','view','biz','m','post'].includes(x));
    return parts[0] || h;
  } catch { return '뉴스'; }
}

async function fetchNaver(query){
  const u = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=100&start=1&sort=date`;
  const r = await fetch(u, { headers: { 'X-Naver-Client-Id': CID, 'X-Naver-Client-Secret': SECRET } });
  if (!r.ok) { console.error(`Naver API ${query}: ${r.status}`); return []; }
  const j = await r.json();
  return (j.items||[]).map(it => ({ title: strip(it.title), desc: strip(it.description), link: it.originallink||it.link, pub: it.pubDate, press: pressFromUrl(it.originallink||it.link) }));
}

function parseRss(xml, source, reSpecific){
  const items = []; const blocks = xml.split(/<item[ >]/).slice(1);
  for (const b of blocks) {
    const end = b.indexOf('</item>'); const chunk = end>=0 ? b.slice(0,end) : b;
    const g = tag => { const m = chunk.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return m ? strip(m[1]) : ''; };
    const title = g('title'); let link = g('link');
    if (!link) { const m = chunk.match(/<link[^>]*>([\s\S]*?)<\/link>/); link = m ? m[1].trim() : ''; }
    if (title) items.push({ title, desc: g('description').slice(0,300), link, pub: g('pubDate')||g('dc:date'), press: source, reSpecific });
  }
  return items;
}
async function fetchRss(feed){
  try { const r = await fetch(feed.url, { headers: { 'User-Agent': UA } });
    if (!r.ok) { console.error(`RSS ${feed.name}: ${r.status}`); return []; }
    return parseRss(await r.text(), feed.name, feed.re);
  } catch (e) { console.error(`RSS ${feed.name}: ${e.message}`); return []; }
}

const isRE = a => { const t = a.title+' '+(a.desc||''); return CORE_RE.some(k => t.includes(k)); };
const isNoise = a => NOISE.some(p => p.test(a.title));
function categorize(a){ const t = a.title+' '+(a.desc||''); for (const [c,ks] of CAT_RULES) if (ks.some(k => t.includes(k))) return c; return '시장·시세'; }
function regionsOf(a){ const t = a.title+' '+(a.desc||''); const f=[]; for (const [r,ks] of Object.entries(REGION_MAP)) if (ks.some(k=>t.includes(k))) f.push(r); return f.length?f:['전국']; }
function sentimentOf(a){ const t=a.title+' '+(a.desc||''); let b=0,r=0; BULL.forEach(p=>{if(t.includes(p))b++;}); BEAR.forEach(p=>{if(t.includes(p))r++;}); if(t.includes('규제')&&!t.includes('완화')&&!t.includes('규제 강화')&&!t.includes('규제강화'))r+=0.5; return b>r?'강세':r>b?'약세':'중립'; }
const norm = t => t.replace(/[\s"'""''·…\[\]]/g,'').slice(0,26);

// ---------------- main ----------------
async function main(){
  if (!CID || !SECRET) { console.error('Missing NAVER_CLIENT_ID / NAVER_CLIENT_SECRET env'); process.exit(1); }
  console.log('Crawling...');
  const naver = (await Promise.all(NAVER_QUERIES.map(fetchNaver))).flat();
  const rss = (await Promise.all(RSS_FEEDS.map(fetchRss))).flat();
  let all = [...naver, ...rss];
  console.log(`raw: ${all.length} (naver ${naver.length}, rss ${rss.length})`);

  // filter
  all = all.filter(a => (a.reSpecific || isRE(a)) && !isNoise(a));
  // dedup
  const seen = new Set(); const dedup = [];
  for (const a of all) { const k = norm(a.title); if (!a.title || seen.has(k)) continue; seen.add(k); dedup.push(a); }
  // enrich
  dedup.forEach(a => { a.cat = categorize(a); a.regions = regionsOf(a); a.sent = sentimentOf(a); a.date = a.pub ? new Date(a.pub) : null; });
  let arts = dedup.filter(a => a.date && !isNaN(a.date)).sort((x,y) => y.date - x.date);
  // keep recent DAYS days, cap
  const latest = arts[0].date; const cutoff = new Date(latest.getTime() - DAYS*86400000);
  arts = arts.filter(a => a.date >= cutoff).slice(0, CAP);
  console.log(`kept: ${arts.length}`);

  // day split for deltas
  const dstr = a => a.date.toISOString().slice(0,10);
  const days = [...new Set(arts.map(dstr))].sort().reverse();
  const today = days[0], yest = days[1] || days[0];
  const todayA = arts.filter(a => dstr(a)===today);
  const yestA = arts.filter(a => dstr(a)===yest);

  const shareDelta = (keyFn) => {
    const cnt = (list) => { const c={}; list.forEach(a=>{const ks=keyFn(a);(Array.isArray(ks)?ks:[ks]).forEach(k=>c[k]=(c[k]||0)+1);}); return c; };
    const tc=cnt(todayA), yc=cnt(yestA), tn=todayA.length||1, yn=yestA.length||1;
    const keys=[...new Set([...Object.keys(tc),...Object.keys(yc)])];
    return keys.map(k => ({ k, today: tc[k]||0, dpp: +(((tc[k]||0)/tn - (yc[k]||0)/yn)*100).toFixed(1) }));
  };
  const themeDeltaArr = shareDelta(a=>a.cat).sort((a,b)=>b.today-a.today);
  const themeDelta = Object.fromEntries(themeDeltaArr.map(d=>[d.k,d.dpp]));
  const kwDeltaArr = shareDelta(a => TREND.filter(k => (a.title+' '+(a.desc||'')).includes(k))).filter(d=>d.today>=3).sort((a,b)=>b.dpp-a.dpp);
  const surge = kwDeltaArr[0] || { k:'-', dpp:0 };
  const keywords = kwDeltaArr.slice().sort((a,b)=>b.today-a.today).slice(0,24).map(d=>({k:d.k,v:d.today,dpp:d.dpp}));

  // buzz / top5 (coverage via token overlap)
  const STOP = new Set(['그리고','위해','대한','관련','오늘','내일','올해','지난','최대','최고','가구','단지','이번','까지','부터','에서','했다','한다','있다','넘어','우리','서울','경기','전국','억원','만에']);
  const toks = t => (t.match(/[가-힣A-Za-z0-9]{2,}/g)||[]).filter(w => !STOP.has(w));
  const wt = arts.map((a,i)=>({a,i,tk:new Set(toks(a.title))}));
  const same = (A,B) => { let n=0; for (const x of A) if (B.has(x)) { if (x.length>=4) return true; if (++n>=2) return true; } return false; };
  wt.forEach(o => { let bz=0; for (const p of wt) { if (p.i===o.i) continue; if (same(o.tk,p.tk)) bz++; } o.buzz=bz; });
  const surgeKw = ['분양','보상','수도권','택지','신도시','반도체','실거래','공공주택','LH'];
  wt.forEach(o => { const rec = dstr(o.a)===today?3:0; const sk = surgeKw.filter(k=>o.a.title.includes(k)).length; o.score = o.buzz*2+rec+sk; });
  const rk = [...wt].sort((x,y)=>y.score-x.score||y.buzz-x.buzz);
  const top5 = []; const used = new Set();
  for (const o of rk) { if (top5.length>=5) break; if (used.has(o.i)) continue; if (top5.some(p=>same(p.tk,o.tk))) continue;
    const cov = rk.filter(b=>same(o.tk,b.tk)).length+1; top5.push({ ...o, cov }); rk.forEach(b=>{ if (same(o.tk,b.tk)) used.add(b.i); }); used.add(o.i); }
  const top5F = top5.map(o => ({ t:o.a.title, s:o.a.press, u:o.a.link, c:o.a.cat, cov:o.cov, why:`${o.cov}개 매체가 동시 보도한 오늘의 핵심 이슈입니다.` }));

  // sentiment (today)
  const sd = { 강세:0, 약세:0, 중립:0 }; todayA.forEach(a=>sd[a.sent]++);
  const net = +(((sd.강세-sd.약세)/(todayA.length||1))*100).toFixed(1);
  const labFn = n => n>=15?['강세 우위','매수 심리 우세']:n>=5?['완만한 강세','시장에 온기']:n>-5?['보합·혼조','방향성 탐색']:n>-15?['약세 우위','관망·부담 확대']:['냉각','위축 신호'];
  const [slabel,sdesc] = labFn(net);
  const sentiment = { ...sd, net, label:slabel, desc:sdesc, n:todayA.length };

  // hot entities (today)
  const countEnt = dict => { const c={}; todayA.forEach(a=>{const t=a.title+' '+(a.desc||''); for(const[name,ks]of Object.entries(dict)) if(ks.some(k=>t.includes(k))) c[name]=(c[name]||0)+1;}); return c; };
  const eb = countEnt(BUILDERS), eo = countEnt(ORGS), er = countEnt(ENT_REGIONS);
  const catOf = {}; Object.keys(er).forEach(n=>catOf[n]='지역·단지'); Object.keys(eb).forEach(n=>catOf[n]=(n==='LH'||n==='SH공사'||n==='HUG')?'기관':'건설사'); Object.keys(eo).forEach(n=>catOf[n]='정책주체');
  const mg = {}; [er,eb,eo].forEach(o=>Object.entries(o).forEach(([n,c])=>{ mg[n]=Math.max(mg[n]||0,c); }));
  const entities = Object.entries(mg).map(([n,c])=>({n,c,cat:catOf[n]})).sort((a,b)=>b.c-a.c).slice(0,14);

  // TL;DR
  const topStory = top5F[0];
  const rising = themeDeltaArr.filter(d=>d.dpp>0).sort((a,b)=>b.dpp-a.dpp).slice(0,2);
  const falling = themeDeltaArr.slice().sort((a,b)=>a.dpp-b.dpp)[0];
  const tldr = [
    `오늘 부동산 뉴스의 최대 이슈는 <b>${topStory ? topStory.t : '-'}</b>(${topStory?topStory.cov:0}개 매체 보도)입니다.`,
    `테마 흐름은 ${rising.map(r=>`<b>${r.k}(${r.dpp>0?'+':''}${r.dpp}%p)</b>`).join('·')}가 부상하고 <b>${falling?falling.k:'-'}(${falling?falling.dpp:0}%p)</b> 비중은 축소됐습니다.`,
    `시장 심리는 <b>${slabel}</b>(순심리 ${net>0?'+':''}${net}%p), 급등 키워드는 <b>${surge.k}</b>(+${surge.dpp}%p)입니다.`,
  ];

  // payload
  const sources = [...new Set(arts.map(a=>a.press))];
  const payload = {
    articles: arts.map(a=>({ s:a.press, t:a.title, u:a.link, c:a.cat, r:a.regions, d:a.date.toISOString(), sn:a.sent })),
    keywords, top5: top5F, tldr,
    surge: { k: surge.k, dpp: surge.dpp },
    themeDelta, sentiment, entities,
    meta: { generated: new Date().toISOString(), total: arts.length, sources, method: 'Naver Search API + RSS', today, compareDay: yest },
  };

  // render
  const tmpl = await readFile(join(__dirname, 'template.html'), 'utf8');
  const html = tmpl.replace(/(<script id="data" type="application\/json">)[\s\S]*?(<\/script>)/, `$1${JSON.stringify(payload).replace(/</g,'\\u003c')}$2`);
  await writeFile(join(ROOT, 'index.html'), html);

  // snapshots (for future historical trends)
  await mkdir(join(ROOT, 'data', 'snapshots'), { recursive: true });
  const snap = { date: today, generated: payload.meta.generated, total: arts.length, themeDelta, sentiment, surge: payload.surge, top5: top5F.map(t=>({t:t.t,cov:t.cov})), entities };
  await writeFile(join(ROOT, 'data', 'snapshots', `${today}.json`), JSON.stringify(snap, null, 2));
  await writeFile(join(ROOT, 'data', 'latest.json'), JSON.stringify(snap, null, 2));

  console.log(`Done. ${arts.length} articles, ${sources.length} sources. Sentiment ${slabel} (${net}%p). Surge: ${surge.k}.`);

  // ---- Telegram daily briefing ----
  if (TG_TOKEN && TG_CHAT) {
    const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const dateLabel = new Date(payload.meta.generated).toLocaleString('ko-KR', { timeZone:'Asia/Seoul', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
    const lines = [];
    lines.push(`\uD83C\uDFE0 <b>\uBD80\uB3D9\uC0B0 \uB274\uC2A4 \uBE0C\uB9AC\uD551</b> \u00B7 ${esc(dateLabel)}`);
    lines.push('');
    lines.push(`\uD83D\uDCCA \uC2DC\uC7A5\uC2EC\uB9AC: <b>${esc(slabel)}</b> (\uC21C\uC2EC\uB9AC ${net>0?'+':''}${net}%p)`);
    lines.push(`\uD83D\uDD3A \uAE09\uB4F1 \uC2DC\uADF8\uB110: <b>${esc(surge.k)}</b> +${surge.dpp}%p`);
    lines.push(`\uD83D\uDCF0 ${arts.length}\uAC74 \u00B7 ${sources.length}\uAC1C \uB9E4\uCCB4 \uC218\uC9D1`);
    lines.push('');
    lines.push('<b>\uD83D\uDCCC \uC624\uB298 \uAF2D \uBCFC 5\uAC74</b>');
    top5F.forEach((t,i) => { lines.push(`${i+1}. (${t.cov}\uAC1C \uB9E4\uCCB4) ${esc(t.t)}`); });
    lines.push('');
    lines.push(`\uD83D\uDD17 <a href="${SITE_URL}">\uB300\uC2DC\uBCF4\uB4DC \uC5F4\uAE30</a>`);
    const text = lines.join('\n');
    try {
      const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode:'HTML', disable_web_page_preview:false })
      });
      const j = await r.json();
      console.log('Telegram:', j.ok ? 'sent' : 'FAILED ' + j.description);
    } catch (e) { console.error('Telegram error:', e.message); }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
