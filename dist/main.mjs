import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createRepository, postgresDatabase } from './repository.mjs';
import { createServer } from './server.mjs';
import { DATA_VERSION } from './version.mjs';
const {DATABASE_URL, MH_ORIGIN, MH_HOST='127.0.0.1', MH_PORT='3000', NODE_ENV} = process.env;
if (!DATABASE_URL || !MH_ORIGIN) throw new Error('DATABASE_URL and MH_ORIGIN are required');
const origin = new URL(MH_ORIGIN);
if (origin.origin !== MH_ORIGIN || !['http:','https:'].includes(origin.protocol)) throw new Error('MH_ORIGIN must be an HTTP(S) origin');
if (NODE_ENV === 'production' && origin.protocol !== 'https:') throw new Error('production requires HTTPS origin and Secure cookies');
const port=Number(MH_PORT); if (!Number.isInteger(port) || port<1 || port>65535) throw new Error('invalid MH_PORT');
const packaged = process.argv.includes('--packaged');
const corePath = packaged ? './core.cjs' : '../out/server/core.cjs';
const dataPath = packaged ? './data.cdb' : '../res/data/data.cdb';
const migrationsRoot = new URL(packaged ? './db/' : '../db/', import.meta.url);
const webRoot = fileURLToPath(new URL(packaged ? '../public/' : '../out/web/', import.meta.url));
const pool=new pg.Pool({connectionString:DATABASE_URL});
const db=postgresDatabase(pool);
try {
  const core=createRequire(import.meta.url)(corePath).MonsterHotelCore;
  core.init(await readFile(new URL(dataPath,import.meta.url),'utf8'));
  if(core.dataVersion() !== DATA_VERSION) throw new Error('backend and core data versions differ');
  const migrations=await Promise.all(['001_initial.sql','002_data_version.sql'].map(async (name,index)=>{
    const sql=await readFile(new URL(name,migrationsRoot),'utf8');
    return {version:index+1,sql,checksum:createHash('sha256').update(sql).digest('hex')};
  }));
  await db.transaction(async tx=>{
    await tx.query('SELECT pg_advisory_xact_lock($1)',[124615741]);
    await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL)');
    const applied=(await tx.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows;
    for(const [index,row] of applied.entries()) {
      const migration=migrations.find(m=>m.version===row.version);
      if(row.version!==index+1 || !migration || migration.checksum!==row.checksum) throw new Error('unknown, missing or changed migration '+row.version);
    }
    for(const migration of migrations) if(!applied.some(row=>row.version===migration.version)) {
      await tx.query(migration.sql);
      await tx.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[migration.version,migration.checksum]);
    }
  });
  const server=createServer({origin:MH_ORIGIN,secureCookies:origin.protocol==='https:',webRoot},createRepository(db),core);
  server.listen(port,MH_HOST,()=>console.log(`MonsterHotel standalone listening on ${MH_HOST}:${port}`));
  let stopping=false;
  async function stop(){ if(stopping)return; stopping=true; server.close(async()=>{await pool.end();}); }
  process.on('SIGINT',stop); process.on('SIGTERM',stop);
} catch (error) { await pool.end(); throw error; }
