# Brief: field cards (terminology, troubleshooting, real scenarios)

Write `web/content/field/<pack>.json` for your packs. Edit no other file. Do not commit.

Read `web/content/packs/<pack>.json` (topics with `id`, `name`, `concepts`, `qa`) so you do not repeat existing questions.

```json
{ "<topicId>": {
  "terms":     [ { "q": "...", "a": "..." } ],
  "trouble":   [ { "q": "...", "a": "..." } ],
  "scenarios": [ { "q": "...", "a": "..." } ]
} }
```
Every topic in the pack needs an entry.

- **terms** (4 to 6): the words an engineer meets while doing the work, in the order of the real workflow. Git: init/clone, working tree, staging, commit, branch, merge vs rebase, remote, push/pull. Java: JDK, classpath, Maven/Gradle build, JUnit, JAR, JVM flags. q: "What is <term>?" or "<term> vs <term>?". a: one or two lines, exact and technical.
- **trouble** (3 to 5): problems people really hit and how to fix them. Git: "detached HEAD", "push rejected (non-fast-forward)", "merge conflict", "committed a secret". q names the symptom or error message; a gives the cause and the fix with the actual command or setting.
- **scenarios** (2 to 4): what an interviewer asks about real work. "A release went out with a bug and you need to undo it on main without rewriting history. What do you do?" a: the steps a strong candidate gives, briefly, with commands where they matter.

Rules: interview recall, not a course. Each answer at most 420 characters, usually much less. Plain text, backticks for commands are fine, no markdown lists, no emoji, no exclamation marks. Be accurate; if unsure of a detail, leave it out. Do not copy questions already in the pack's `qa`.

Check: `node scripts/validate-field.mjs <pack>` must print ok. Finish with one line per pack: topics and cards written.
