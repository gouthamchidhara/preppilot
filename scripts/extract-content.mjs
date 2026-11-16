// Builds content packs from the source study guide (an HTML file with a `const TOPICS = [...]` array).
//   node scripts/extract-content.mjs "<path to Infra Interview Prep.html>"
// Writes:
//   web/content/packs/infra.json      public, sanitized (shipped to every user)
//   private/packs/personal.json       personal topics (git-ignored, import manually in the app)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) { console.error('usage: node scripts/extract-content.mjs <guide.html>'); process.exit(1); }

const html = readFileSync(src, 'utf8');
const start = html.indexOf('const TOPICS');
const end = html.indexOf('/* ================= APP =');
if (start < 0 || end < 0) throw new Error('TOPICS block not found');
const code = html.slice(start, end).replace('const TOPICS =', 'TOPICS =');
const ctx = {};
vm.runInNewContext(code, ctx);
const TOPICS = ctx.TOPICS;

const PERSONAL = new Set(['reality', 'story', 'myproject']);

// Personal rewrite rules and leak patterns live in git-ignored private/sanitize.json:
//   { "rewrites": [["personal phrase", "generic phrase"], ...], "leak": "regex (case-insensitive)", "leakCased": "regex" }
// They name employers and projects, so they must never be committed to a public repo.
const sanitizeFile = resolve(root, 'private/sanitize.json');
if (!existsSync(sanitizeFile)) throw new Error('private/sanitize.json missing: refusing to build a public pack without leak rules.');
const SAN = JSON.parse(readFileSync(sanitizeFile, 'utf8'));
const REWRITES = SAN.rewrites || [];
const LEAK = new RegExp(SAN.leak, 'i');
const LEAK_CASED = SAN.leakCased ? new RegExp(SAN.leakCased) : /$^/;

const ROLE_WEIGHTS = {
  linux:        { infra: 3, sre: 3, cloud: 2, devops: 2, network: 1, support: 2 },
  scripting:    { infra: 2, sre: 3, cloud: 2, devops: 3, network: 1, support: 1 },
  windows:      { infra: 3, sre: 1, cloud: 1, devops: 1, network: 1, support: 3 },
  network:      { infra: 3, sre: 2, cloud: 2, devops: 1, network: 3, support: 2 },
  lb:           { infra: 3, sre: 2, cloud: 2, devops: 1, network: 3, support: 1 },
  docker:       { infra: 2, sre: 3, cloud: 2, devops: 3, network: 1, support: 1 },
  k8s:          { infra: 2, sre: 3, cloud: 3, devops: 3, network: 1, support: 1 },
  cicd:         { infra: 2, sre: 2, cloud: 2, devops: 3, network: 1, support: 1 },
  monitoring:   { infra: 2, sre: 3, cloud: 2, devops: 2, network: 2, support: 2 },
  cloud:        { infra: 2, sre: 2, cloud: 3, devops: 2, network: 2, support: 1 },
  onboarding:   { infra: 3, sre: 2, cloud: 3, devops: 2, network: 2, support: 2 },
  troubleshoot: { infra: 3, sre: 3, cloud: 3, devops: 2, network: 3, support: 3 },
  virt:         { infra: 3, sre: 1, cloud: 1, devops: 1, network: 1, support: 2 },
  security:     { infra: 2, sre: 2, cloud: 2, devops: 2, network: 2, support: 2 },
  scenarios:    { infra: 2, sre: 2, cloud: 2, devops: 2, network: 2, support: 1 },
  behavioral:   { infra: 2, sre: 2, cloud: 2, devops: 2, network: 2, support: 2 },
};

const BEHAVIORAL = {
  id: 'behavioral', name: 'Behavioral & Your Story', tag: 'STAR', blurb: 'Intro, STAR stories, questions to ask, habits that cost offers',
  concepts: [
    { t: 'Your 60-second intro', what: 'Answer to "Tell me about yourself": present role and years, two things you own today with one number each, one past role in a sentence, what you want next.', why: 'First question in every interview; it sets the frame for everything after.', ex: '"I\'m a [role] with [N] years in [areas].\nToday I own [thing 1, with a number] and [thing 2, with a number].\nBefore that I [one line].\nI\'m looking for a role where I can [what this job offers]."', tip: 'Rewrite the last sentence for each job posting. Practice until it\'s 55-65 seconds without notes.' },
    { t: 'STAR stories', what: 'Situation, Task, Action, Result. Prepare five stories of about 90 seconds. Say "I" for your part.', why: 'Most behavioral questions can be answered with one of five good stories.', ex: '1. Something you automated (with time saved)\n2. A project you delivered end to end\n3. A production incident you handled\n4. A disagreement you resolved with data\n5. Something you learned fast\n\nEach: situation (1 line), task (1 line), actions (3-4 lines, "I"), result (a number)', tip: 'Numbers make stories believable: hours saved, machines, % fewer tickets, minutes of downtime.' },
    { t: 'When the honest answer is "only a little"', what: 'Say what you have done, what you have not, and how you would approach it.', why: 'Bluffing gets caught on the second follow-up; a clear honest answer scores well.', ex: '"I\'ve worked alongside it: [specific thing].\nI haven\'t owned it end to end, but here\'s how I\'d approach it: [two sentences]."', tip: 'Interviewers hire people who know their limits and can reason past them.' },
    { t: 'Questions to ask them', what: 'Have three ready that show you are thinking about the actual job.', why: '"Any questions for us?" always comes, and "no" is a weak ending.', ex: 'What does on-call look like, and how often does it page?\nHow much is automated vs manual today?\nWhat\'s the biggest infrastructure problem you want solved this year?\nHow are changes approved?', tip: 'Leave salary and benefits questions until there is an offer.' },
    { t: 'Habits that cost offers', what: 'Patterns that make strong people look weak.', why: 'Easy to fix once you hear them in a recording.', ex: '"We" for everything        -> "I" for your part\nTool lists with no context  -> what you did with one tool\nNo numbers                  -> add one per story\nBlaming other teams         -> describe the fix, not the fault\nRambling past 2 minutes     -> stop and offer more detail', tip: 'Record one answer per day on your phone and listen back.' },
  ],
  qa: [
    { l: 1, q: 'Tell me about yourself.', a: 'Use your 60-second intro: current role and years, two things you own today with numbers, one line on earlier experience, and what you want next tied to this job.' },
    { l: 1, q: 'Why are you looking for a new role?', a: 'Forward-looking and positive: what you want to do more of, and why this role offers it. Never criticize your current employer.' },
    { l: 2, q: 'What is your biggest weakness?', a: 'A real, job-relevant gap plus what you are actively doing about it (a lab, a course, a certification, a project). Avoid fake weaknesses like "I work too hard".' },
    { l: 2, q: 'Tell me about a time something went wrong.', a: 'A real incident or failed change: what happened, how you restored service, the root cause, and what you changed so it doesn\'t repeat. Own your part.' },
    { l: 2, q: 'Tell me about a disagreement with another team.', a: 'Show that you gathered data, shared it calmly, focused on the fix rather than blame, and kept the relationship good.' },
    { l: 2, q: 'Tell me about something you automated.', a: 'What was manual and how often, what you built and how it runs, how you tested and rolled it out, and the result in hours saved or errors removed.' },
    { l: 2, q: 'Why should we hire you?', a: 'Map three of your strengths to three needs in their posting, each with a short example, and close with what you would do in the first months.' },
    { l: 3, q: 'What\'s the hardest technical problem you solved recently?', a: 'Pick one where you did the diagnosis. Be ready for three levels of "why": evidence collected, what you ruled out, the real root cause, and what you changed to prevent it.' },
  ],
};

function rewriteAll(obj) {
  let s = JSON.stringify(obj);
  for (const [from, to] of REWRITES) s = s.split(JSON.stringify(from).slice(1, -1)).join(JSON.stringify(to).slice(1, -1));
  return JSON.parse(s);
}

const publicTopics = TOPICS.filter(t => !PERSONAL.has(t.id)).map(rewriteAll);
publicTopics.push(BEHAVIORAL);
for (const t of publicTopics) {
  t.roles = ROLE_WEIGHTS[t.id] || { infra: 2, sre: 2, cloud: 2, devops: 2, network: 2, support: 2 };
  const m = JSON.stringify(t).match(LEAK) || JSON.stringify(t).match(LEAK_CASED);
  if (m) throw new Error(`Personal reference "${m[0]}" left in public topic "${t.id}". Add a rewrite.`);
}

const pub = { id: 'infra', name: 'Infrastructure Engineering', version: 1, topics: publicTopics };
const personal = { id: 'personal', name: 'My personal pack', version: 1, private: true, topics: TOPICS.filter(t => PERSONAL.has(t.id)) };

mkdirSync(resolve(root, 'web/content/packs'), { recursive: true });
mkdirSync(resolve(root, 'private/packs'), { recursive: true });
writeFileSync(resolve(root, 'web/content/packs/infra.json'), JSON.stringify(pub));
writeFileSync(resolve(root, 'private/packs/personal.json'), JSON.stringify(personal, null, 1));

const count = p => p.topics.reduce((a, t) => [a[0] + t.concepts.length, a[1] + t.qa.length], [0, 0]);
console.log('public  :', pub.topics.length, 'topics', count(pub));
console.log('personal:', personal.topics.length, 'topics', count(personal));
