// Local-only persistence. Nothing personal leaves the device except what the user sends to the AI.
const K = {
  profile: 'pp.profile', progress: 'pp.progress', custom: 'pp.customTopics',
  privatePacks: 'pp.privatePacks', chat: 'pp.chat', clientId: 'pp.clientId', access: 'pp.accessCode', speak: 'pp.speak',
  session: 'pp.session', account: 'pp.account', liveSettings: 'pp.liveSettings',
  suggestAsked: 'pp.suggestAsked', lastProvider: 'pp.lastProvider',
  nudgeIndex: 'pp.nudgeIndex', nudgeDay: 'pp.nudgeDay', notifAsked: 'pp.notifAsked',
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
  session: () => read(K.session, ''),
  setSession: t => write(K.session, t),
  account: () => read(K.account, null),
  setAccount: a => write(K.account, a),
  liveSettings: () => read(K.liveSettings, null),
  setLiveSettings: s => write(K.liveSettings, s),
  suggestAsked: () => read(K.suggestAsked, false),
  setSuggestAsked: v => write(K.suggestAsked, v),
  lastProvider: () => read(K.lastProvider, ''),
  setLastProvider: p => write(K.lastProvider, p),
  nudgeIndex: () => read(K.nudgeIndex, 0),
  setNudgeIndex: i => write(K.nudgeIndex, i),
  nudgeDay: () => read(K.nudgeDay, ''),
  setNudgeDay: d => write(K.nudgeDay, d),
  notifAsked: () => read(K.notifAsked, false),
  setNotifAsked: v => write(K.notifAsked, v),
  clientId() {
    let id = read(K.clientId, null);
    if (!id) { id = crypto.randomUUID(); write(K.clientId, id); }
    return id;
  },
  resetAll() { Object.values(K).forEach(k => localStorage.removeItem(k)); },
};
