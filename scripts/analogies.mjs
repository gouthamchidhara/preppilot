// Source of truth for diagram analogies. Run: node scripts/analogies.mjs  (writes web/content/meaning/<pack>.json)
// Only topics where an everyday picture genuinely helps someone remember the idea in an interview.
// Everything else keeps its plain technical diagram. One line each; the diagram steps stay technical.
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';

const A = {
  linux: ['Opening a restaurant for the day', 'The landlord unlocks the building (firmware), the manager picks the plan (GRUB), staff arrive (kernel), jobs are handed out (systemd), the host seats you (login).'],
  'web-fundamentals': ['Calling someone from your contacts', 'You know the name, the contacts list gives the number (DNS), the call connects and both sides confirm who they are (TCP + TLS), then you talk (HTTP).'],
  network: ['Posting a letter', 'The letter (data) goes in an envelope with a street address (IP), a flat number picks who reads it (port), and the post office only cares about the envelope, not the letter.'],
  lb: ['Supermarket checkout lanes', 'One person waves you to an open till. A closed till (failed health check) gets no customers, and you never need to know which till you used.'],
  docker: ['A shipping container', 'Same sealed box on a ship, a train or a truck. The image is the packed container, a container is one of them actually in transit.'],
  k8s: ['An air traffic control tower', 'The tower (control plane) decides where each plane goes, ground crew at each gate (kubelet) handle it, and the gate number (Service) stays the same whichever plane is parked there.'],
  windows: ['A festival wristband', 'Show ID once at the gate (the domain controller), get a wristband (Kerberos ticket), then every stage lets you in by the wristband without asking for ID again.'],
  monitoring: ['A car dashboard', 'Sensors in the engine (instrumentation) feed the gauges (metrics), a warning light comes on at a threshold (alert), and someone has to pull over (respond).'],
  troubleshoot: ['A doctor\'s diagnosis', 'Reproduce the symptom, rule things out one at a time, form one theory, treat it, then check the patient is actually better.'],
  virt: ['Undo history vs a copy in a safe', 'A snapshot is undo history on the same disk: lose the disk, lose it. A backup is a copy kept somewhere else.'],
  security: ['Badge doors in a hospital', 'Getting through the front entrance does not open every ward. Each door checks your badge again, which is zero trust.'],
  git: ['Email: drafts, outbox, sent', 'Working tree is your drafts, staging is the outbox, a commit is in your sent folder, and push delivers it to everyone else\'s inbox (the remote).'],
  dsa: ['Finding a word in a dictionary', 'Knowing the exact page is O(1). Opening the middle and halving is O(log n). Reading every word is O(n). Comparing every word with every other is O(n²).'],
  testing: ['Building a car', 'Test each part on the bench (unit), then the engine with the gearbox (integration), then one test drive (end to end). Lots of bench tests, few test drives.'],
  'html-css': ['A framed picture on a wall', 'The picture is the content, the mount around it is padding, the frame is the border, and the gap to the next frame is the margin.'],
  'java-core': ['A coat check', 'The ticket number (hash) tells the attendant which hook to go to. If two coats share a hook, they check the name tag (equals) to hand you yours.'],
  jvm: ['Desk, filing cabinet, archive', 'New papers land on the desk (Eden) and most are binned quickly. What survives a few clear-outs gets filed (survivor), then archived (old generation), which is cleaned rarely and slowly.'],
  'js-core': ['A barista with a buzzer', 'One barista takes orders one at a time (call stack). The coffee machine works in the background (Web APIs) and your buzzer goes off when it is ready (callback queue).'],
  'python-async': ['A chess simultaneous exhibition', 'One master walks between many boards, makes a move, and moves on while each opponent thinks. One thread, many games, as long as nobody holds the master up.'],
  'python-core': ['A tap vs a filled bucket', 'A list fills the whole bucket before you drink. A generator is a tap: you get the next glass only when you ask, so memory stays small.'],
  'csharp-core': ['A photocopy vs a shared doc link', 'Passing a value type hands over a photocopy; edits stay with the copy. Passing a reference shares the link; everyone edits the same document.'],
  typescript: ['Spell check that vanishes when you print', 'Types are checked while you write, then erased in the JavaScript that ships. Nothing checks them at runtime.'],
  'express-nest': ['Airport security lanes', 'Each checkpoint (middleware) inspects you and either passes you on with next() or stops you. The gate (handler) only sees passengers who got through all of them.'],
  'llm-apps': ['An open-book exam', 'The model answers better when you hand it the right pages first. RAG is finding those pages (retrieve) and putting them in front of it (prompt).'],
  'ml-fundamentals': ['Practice papers vs the real exam', 'Train on practice papers, tune on mock exams (validation), and open the real exam paper (test set) once. Peeking at it early means your score lies.'],
  statistics: ['A clinical drug trial', 'Patients are randomly split into the drug group and the placebo group, the length of the trial is fixed in advance, and nobody stops early because one week looked good.'],
};

const packs = JSON.parse(readFileSync('web/content/packs/index.json')).packs;
const dir = 'web/content/meaning/';
for (const f of readdirSync(dir)) unlinkSync(dir + f);
let n = 0;
for (const p of packs) {
  const out = {};
  for (const t of p.topics) if (A[t.id]) { out[t.id] = { analogy: { name: A[t.id][0], line: A[t.id][1] } }; n++; }
  if (Object.keys(out).length) writeFileSync(`${dir}${p.id}.json`, JSON.stringify(out, null, 1) + '\n');
}
console.log(`${n} analogies written`);
