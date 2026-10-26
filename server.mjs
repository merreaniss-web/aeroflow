import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
const UPSTREAM_TIMEOUT_MS = 18000;
const cache = new Map();

const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
const UPSTREAMS = {
  airports: 'https://davidmegginson.github.io/ourairports-data/airports.csv',
  runways: 'https://davidmegginson.github.io/ourairports-data/runways.csv',
  frequencies: 'https://davidmegginson.github.io/ourairports-data/airport-frequencies.csv'
};

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(body);
}
function fail(res, status, message) { json(res, status, {ok:false,error:message}); }
async function fetchWithTimeout(url, options={}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try { return await fetch(url, {...options, signal:controller.signal, headers:{'User-Agent':'FlightDeck/3.0 (personal aviation data workspace)','Accept':options.accept || '*/*',...(options.headers||{})}}); }
  finally { clearTimeout(timer); }
}
async function cachedResponse(key, url, ttlMs, accept='text/csv,*/*') {
  const existing=cache.get(key);
  if(existing && Date.now()-existing.time<ttlMs) return existing;
  const response=await fetchWithTimeout(url,{headers:{Accept:accept}});
  if(!response.ok) throw new Error(`La source a répondu HTTP ${response.status}`);
  const body=await response.text();
  const record={time:Date.now(),body,contentType:response.headers.get('content-type')||'text/plain; charset=utf-8'};
  cache.set(key,record); return record;
}
async function sendProxy(res, record, cacheSeconds=60) {
  res.writeHead(200,{'Content-Type':record.contentType,'Cache-Control':`public, max-age=${cacheSeconds}`,'X-Content-Type-Options':'nosniff'});
  res.end(record.body);
}
function validCoord(v,min,max){const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null;}
function getIcaoList(raw){const ids=String(raw||'').toUpperCase().split(',').map(x=>x.trim()).filter(Boolean);if(!ids.length||ids.length>10||ids.some(x=>!/^[A-Z0-9]{4}$/.test(x)))return null;return ids.join(',');}
async function proxyWeather(reqUrl,res){
  const lat=validCoord(reqUrl.searchParams.get('latitude')??reqUrl.searchParams.get('lat'),-90,90);
  const lon=validCoord(reqUrl.searchParams.get('longitude')??reqUrl.searchParams.get('lon'),-180,180);
  if(lat===null||lon===null)return fail(res,400,'Coordonnées invalides.');
  const u=new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude',String(lat));u.searchParams.set('longitude',String(lon));
  const allowed=['current','hourly','daily','forecast_days','timezone','wind_speed_unit','temperature_unit','precipitation_unit'];
  for(const k of allowed){const v=reqUrl.searchParams.get(k);if(v)u.searchParams.set(k,v)}
  const r=await fetchWithTimeout(u,{headers:{Accept:'application/json'}});
  if(!r.ok)return fail(res,502,`Open-Meteo a répondu HTTP ${r.status}`);
  res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=120','X-Content-Type-Options':'nosniff'});res.end(await r.text());
}
async function proxyAviationReport(kind,reqUrl,res){
  const ids=getIcaoList(reqUrl.searchParams.get('ids'));
  if(!ids)return fail(res,400,'Renseignez un ou plusieurs codes OACI à quatre caractères.');
  const u=new URL(`https://aviationweather.gov/api/data/${kind}`);u.searchParams.set('ids',ids);u.searchParams.set('format','json');
  const key=`awc:${kind}:${ids}`;const prior=cache.get(key);
  if(prior&&Date.now()-prior.time<45000){return sendProxy(res,prior,30)}
  const r=await fetchWithTimeout(u,{headers:{Accept:'application/json'}});
  if(!r.ok)return fail(res,502,`Aviation Weather Center a répondu HTTP ${r.status}`);
  const body=await r.text();let ct=r.headers.get('content-type')||'application/json; charset=utf-8';
  const rec={time:Date.now(),body,contentType:ct};cache.set(key,rec);res.writeHead(200,{'Content-Type':ct,'Cache-Control':'public, max-age=30','X-Content-Type-Options':'nosniff'});res.end(body);
}
function officialSourceCatalog(icao=''){
  const code=String(icao||'').toUpperCase();
  const isFrance=/^LF[A-Z0-9]{2}$/.test(code);
  const isUs=/^[KNP][A-Z0-9]{3}$/.test(code);
  return {icao:code,sources:[
    ...(isFrance?[{name:'SIA France — eAIP',coverage:'AIP, cartes et procédures France',url:'https://www.sia.aviation-civile.gouv.fr/produits-numeriques-en-libre-disposition/eaip.html'},{name:'SOFIA-Briefing',coverage:'Briefing, météo et NOTAM via portail officiel',url:'https://sofia-briefing.aviation-civile.gouv.fr/sofia/pages/homepage.html'}]:[]),
    ...(isUs?[{name:'FAA Digital Terminal Procedures Publication',coverage:'Cartes de procédures des États-Unis',url:'https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp'}]:[]),
    {name:'EUROCONTROL EAD Basic',coverage:'AIS / AIP européens selon les produits disponibles',url:'https://www.eurocontrol.int/service/european-ais-database'},
    ]};
}
async function handle(req,res){
  const parsed=new URL(req.url,'http://127.0.0.1');
  const pathname=decodeURIComponent(parsed.pathname);
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','geolocation=(self)');
  if(req.method!=='GET'&&req.method!=='HEAD'){return fail(res,405,'Méthode non prise en charge.');}
  try{
    if(pathname==='/api/health')return json(res,200,{ok:true,service:'FlightDeck Local API',version:'4.0.0',features:['OurAirports','Open-Meteo','Aviation Weather Center METAR/TAF proxy','local flight calculations','official public chart source directory'],note:'Une source est testée lors de son utilisation. Les services sous licence nécessitent leurs propres identifiants et autorisations.'});
    if(pathname==='/api/airports.csv'||pathname==='/api/runways.csv'||pathname==='/api/frequencies.csv'){
      const k=pathname.includes('airports')?'airports':pathname.includes('runways')?'runways':'frequencies';
      const alt=k==='airports'?'https://ourairports.com/data/airports.csv':k==='runways'?'https://ourairports.com/data/runways.csv':'https://ourairports.com/data/airport-frequencies.csv';
      let record;
      try{record=await cachedResponse(k,UPSTREAMS[k],60*60*1000)}catch{record=await cachedResponse(k,alt,60*60*1000)}
      return sendProxy(res,record,3600);
    }
    if(pathname==='/api/weather')return await proxyWeather(parsed,res);
    if(pathname==='/api/metar'||pathname==='/api/taf')return await proxyAviationReport(pathname.endsWith('/metar')?'metar':'taf',parsed,res);
    if(pathname==='/api/chart-sources')return json(res,200,{ok:true,...officialSourceCatalog(parsed.searchParams.get('icao'))});
    if(pathname.startsWith('/api/'))return fail(res,404,'Endpoint API non trouvé.');
    let rel=pathname==='/'?'index.html':pathname.slice(1);
    const normalized=path.normalize(rel);
    if(normalized.startsWith('..')||path.isAbsolute(normalized))return fail(res,403,'Chemin interdit.');
    const file=path.join(ROOT,normalized);
    const info=await stat(file).catch(()=>null);
    if(!info?.isFile())return fail(res,404,'Fichier introuvable.');
    const ext=path.extname(file).toLowerCase();
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream','Cache-Control':ext==='.html'?'no-cache':'public, max-age=300','Content-Length':body.length});
    return res.end(body);
  }catch(e){return fail(res,502,e.name==='AbortError'?'La source a dépassé le délai autorisé.':`Connexion à la source impossible : ${e.message}`)}
}
const server=http.createServer((req,res)=>{handle(req,res)});
server.listen(PORT,HOST,()=>{console.log(`\nFlightDeck 4.0 prêt : http://${HOST}:${PORT}`);console.log('API locale : /api/health');console.log('Arrêt : Ctrl+C\n');});
