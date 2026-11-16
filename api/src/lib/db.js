// Storage for users, the daily free-tier pool and voice calls.
// Prod: Azure Table Storage (STORAGE_CONNECTION_STRING). Tests/local dev: in-memory.
// Each entity stores its JSON in one `data` column; updates use ETags with retry so
// concurrent requests can't double-spend quota.
const TABLES = { users: 'ppusers', daily: 'ppdaily', calls: 'ppcalls', roles: 'pproles' };

function memoryDb() {
  const t = { users: new Map(), daily: new Map(), calls: new Map(), roles: new Map() };
  const clone = v => (v === undefined ? null : structuredClone(v));
  return {
    kind: 'memory',
    async get(table, key) { return clone(t[table].get(key)); },
    async update(table, key, fn) {
      const next = await fn(clone(t[table].get(key)));
      if (next === undefined) return clone(t[table].get(key));
      t[table].set(key, structuredClone(next));
      return clone(next);
    },
    async list(table, filter = () => true) { return [...t[table].values()].filter(filter).map(clone); },
    reset() { Object.values(t).forEach(m => m.clear()); },
  };
}

async function tableDb(conn) {
  const { TableClient } = await import('@azure/data-tables');
  const clients = Object.fromEntries(Object.entries(TABLES).map(([k, name]) => [k, TableClient.fromConnectionString(conn, name)]));
  const PK = 'p';
  const read = async (table, key) => {
    try {
      const e = await clients[table].getEntity(PK, key);
      return { value: JSON.parse(e.data), etag: e.etag };
    } catch (err) {
      if (err.statusCode === 404) return { value: null, etag: null };
      throw err;
    }
  };
  return {
    kind: 'table',
    async get(table, key) { return (await read(table, key)).value; },
    async update(table, key, fn) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const { value, etag } = await read(table, key);
        const next = await fn(value === null ? null : structuredClone(value));
        if (next === undefined) return value;
        const entity = { partitionKey: PK, rowKey: key, data: JSON.stringify(next) };
        try {
          if (etag) await clients[table].updateEntity(entity, 'Replace', { etag });
          else await clients[table].createEntity(entity);
          return next;
        } catch (err) {
          if (err.statusCode === 412 || err.statusCode === 409) continue; // someone else wrote first: retry
          throw err;
        }
      }
      throw new Error('Too much contention, try again.');
    },
    async list(table, filter = () => true) {
      const out = [];
      for await (const e of clients[table].listEntities()) {
        const v = JSON.parse(e.data);
        if (filter(v)) out.push(v);
      }
      return out;
    },
  };
}

let dbPromise;
export function getDb() {
  dbPromise ||= process.env.STORAGE_CONNECTION_STRING ? tableDb(process.env.STORAGE_CONNECTION_STRING) : Promise.resolve(memoryDb());
  return dbPromise;
}

export function useMemoryDb() { dbPromise = Promise.resolve(memoryDb()); return dbPromise; }
export { TABLES };
