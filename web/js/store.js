// Local-only persistence. Nothing personal leaves the device except what the user sends to the AI.
const K = {
  profile: 'pp.profile', progress: 'pp.progress', custom: 'pp.customTopics',
  privatePacks: 'pp.privatePacks', chat: 'pp.chat', clientId: 'pp.clientId', access: 'pp.accessCode', speak: 'pp.speak',
};

const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { alert('Storage is full: ' + e.message); } };

export const store = {
  profile: () => read(K.profile, null),
  setProfile: p => write(K.profile, p),
  progress: () => read(K.progress, {}),
  setProgress: p => write(K.progress, p),
  customTopics: () => read(K.custom, []),
  setCustomTopics: t => write(K.custom, t),
  privatePacks: () => read(K.privatePacks, []),
  setPrivatePacks: p => write(K.privatePacks, p),
  chat: () => read(K.chat, []),
  setChat: c => write(K.chat, c.slice(-40)),
  accessCode: () => read(K.access, ''),
  setAccessCode: c => write(K.access, c),
  speak: () => read(K.speak, false),
  setSpeak: v => write(K.speak, v),
  clientId() {
    let id = read(K.clientId, null);
    if (!id) { id = crypto.randomUUID(); write(K.clientId, id); }
    return id;
  },
  resetAll() { Object.values(K).forEach(k => localStorage.removeItem(k)); },
};
