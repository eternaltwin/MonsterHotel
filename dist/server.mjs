import { createServer as httpServer } from 'node:http';
import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { open } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { resolve, extname, sep } from 'node:path';
import { CONTRACT_VERSION, DATA_VERSION } from './version.mjs';
const scrypt = promisify(scryptCallback);
const token = () => randomBytes(32).toString('base64url');
const hash = s => createHash('sha256').update(s).digest('hex');
const fail = (status, error) => Object.assign(new Error(error), {status});
async function passwordHash(password) { const salt = randomBytes(16).toString('hex'); return salt + ':' + (await scrypt(password, salt, 64)).toString('hex'); }
async function passwordMatches(password, stored) { const [salt, value] = stored.split(':'); const candidate = await scrypt(password, salt, 64); const expected = Buffer.from(value, 'hex'); return candidate.length === expected.length && timingSafeEqual(candidate, expected); }
function validCredentials(x) { return typeof x.name === 'string' && /^[A-Za-z0-9_]{3,32}$/.test(x.name) && typeof x.password === 'string' && x.password.length >= 10 && x.password.length <= 128; }
async function body(req) {
  let bytes = 0, chunks=[];
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 65536) throw fail(413,'body_too_large'); chunks.push(chunk); }
  try {
    const v=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw 0;
    const pending=[[v,0]];
    while (pending.length) {
      const [value,depth]=pending.pop();
      if (depth>32) throw 0;
      for (const key of Object.keys(value)) {
        if (key==='__proto__' || key==='prototype' || key==='constructor') throw 0;
        if (value[key] && typeof value[key] === 'object') pending.push([value[key],depth+1]);
      }
    }
    return v;
  } catch { throw fail(400,'invalid_json'); }
}
function reply(res,status,data,headers={}) { res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}); res.end(JSON.stringify({...data,contractVersion:CONTRACT_VERSION,dataVersion:DATA_VERSION})); }
export function createServer(config, repo, core) {
  if (!config.origin || !/^https?:\/\//.test(config.origin)) throw new Error('origin required');
  const authAttempts = new Map();
  function limitAuth(address) {
    const now = Date.now(), windowMs = 15 * 60 * 1000;
    let entry = authAttempts.get(address);
    if (!entry || entry.expires <= now) {
      if (authAttempts.size >= 10000) {
        for (const [key, value] of authAttempts) if (value.expires <= now) authAttempts.delete(key);
        if (authAttempts.size >= 10000 && !entry) throw fail(429,'rate_limited');
      }
      entry = {count:0, expires:now + windowMs};
      authAttempts.set(address,entry);
    }
    if (++entry.count > 10) throw fail(429,'rate_limited');
  }
  return httpServer(async (req,res) => {
    try {
      const url = new URL(req.url, config.origin), path = url.pathname;
      if (req.method !== 'GET' && req.headers.origin !== config.origin) throw fail(403,'origin');
      if (req.method === 'GET' && path === '/api/health') return reply(res,200,{ok:true});
      const rawCookie = (req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('mh_session='))?.slice(11);
      const session = rawCookie ? await repo.session(hash(rawCookie), Date.now()) : null;
      if (req.method === 'POST' && (path === '/api/auth/register' || path === '/api/auth/login')) {
        limitAuth(req.socket.remoteAddress || 'unknown');
        const input = await body(req); if (!validCredentials(input)) throw fail(400,'invalid_credentials');
        let player;
        if (path.endsWith('register')) { player = await repo.register(input.name, await passwordHash(input.password), core.newHotel(Date.now())); }
        else { player = await repo.findPlayer(input.name); if (!player || !await passwordMatches(input.password, player.password_hash)) throw fail(401,'invalid_credentials'); }
        const value=token(), csrf=token(); await repo.createSession(hash(value),player.id,csrf,Date.now()+86400000*30);
        return reply(res,200,{player:{id:String(player.id),name:player.name},csrf}, {'set-cookie':`mh_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${config.secureCookies ? '; Secure' : ''}`});
      }
      if (path.startsWith('/api/')) {
        if (!session) throw fail(401,'authentication_required');
        if (req.method !== 'GET' && req.headers['x-csrf-token'] !== session.csrf) throw fail(403,'csrf');
        const player={id:String(session.player_id), name:session.name};
        if (req.method === 'GET' && path === '/api/session') return reply(res,200,{player,csrf:session.csrf});
        if (req.method === 'POST' && path === '/api/auth/logout') { await repo.deleteSession(hash(rawCookie)); return reply(res,200,{ok:true},{'set-cookie':'mh_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'}); }
        if (req.method === 'GET' && path === '/api/hotel') return reply(res,200,await repo.hotel(player.id,core));
        if (req.method === 'POST' && path === '/api/commands') { const input=await body(req); return reply(res,200,await repo.command(player.id,input,core)); }
        if (req.method === 'GET' && path === '/api/friends') return reply(res,200,await repo.friends(player.id));
        if (req.method === 'POST' && path === '/api/friends/request') { const x=await body(req); return reply(res,200,await repo.friendRequest(player.id,x.playerId)); }
        if (req.method === 'POST' && path === '/api/friends/accept') { const x=await body(req); return reply(res,200,await repo.friendAccept(player.id,x.playerId)); }
        const love=path.match(/^\/api\/friends\/(\d+)\/love$/);
        if (req.method === 'POST' && love) return reply(res,200,await repo.visitLove(player.id,love[1],await body(req),core));
        const visit=path.match(/^\/api\/friends\/(\d+)\/hotel$/);
        if (req.method === 'GET' && visit) return reply(res,200,await repo.visit(player.id,visit[1],core));
        if (req.method === 'GET' && path === '/api/gifts') return reply(res,200,await repo.gifts(player.id));
        if (req.method === 'POST' && path === '/api/gifts') return reply(res,200,await repo.sendGift(player.id,await body(req)));
        const claim=path.match(/^\/api\/gifts\/(\d+)\/claim$/);
        if (req.method === 'POST' && claim) return reply(res,200,await repo.claimGift(player.id,claim[1],await body(req),core));
        throw fail(404,'not_found');
      }
      if (req.method === 'GET' && config.webRoot) {
        const root=resolve(config.webRoot), target=resolve(root, '.' + (path === '/' ? '/index.html' : decodeURIComponent(path)));
        if (!target.startsWith(root+sep)) throw fail(404,'not_found');
        const file=await open(target,'r');
        try {
          const stat=await file.stat();
          if (!stat.isFile()) throw fail(404,'not_found');
          const etag='W/"'+stat.size+'-'+stat.mtimeMs+'"';
          res.setHeader('etag',etag);
          res.setHeader('cache-control','no-cache');
          if (req.headers['if-none-match']===etag) { res.writeHead(304); return res.end(); }
          const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.cdb':'application/json','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'}[extname(target)] || 'application/octet-stream';
          res.writeHead(200,{'content-type':type,'content-length':stat.size,'x-content-type-options':'nosniff'});
          await pipeline(file.createReadStream(),res);
          return;
        } finally { await file.close(); }
      }
      throw fail(404,'not_found');
    } catch (err) {
      if (res.headersSent || res.destroyed) return res.destroy();
      reply(res,err.status || (err.code === 'ENOENT' ? 404 : 500),{error:err.status ? err.message : 'server_error'});
    }
  });
}
