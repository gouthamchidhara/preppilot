# Content brief: lesson flow and diagram meaning

You are writing two data files per content pack. Do not edit any other file. Do not commit or push.

## Inputs (read only)
- `web/content/packs/<pack>.json`: `topics[]`, each with `id`, `name`, `concepts[]` (`t` title, `what`, `why`, `ex`, `tip`) and `qa[]`.
- `web/js/diagram-data.js`: `SPECS[topicId]` is the animated diagram for a topic: `title`, `caption`, node/box labels, and `steps` (one caption per animation stage, shown one at a time as the picture builds).

## Purpose (owner rule)
This is not a course. Users already know the material; each card puts it back on the tip of their tongue in one or two lines, so they remember it on the interview call. Cards follow the workflow an engineer in that technology already uses (Java: write the code, build, test, package, deploy, run and debug), so the next card is the one they would expect.

## Output 1: `web/content/flow/<pack>.json`
```json
{ "<topicId>": { "order": [3, 0, 1, 2], "hooks": ["...", "...", "..."], "upNext": "...", "basics": [0] } }
```
- **order**: the concept indexes in the order a learner should meet them. Every index exactly once. Build a story, not a reference manual: start with the thing that happens first or matters first in real life, and let each card set up the next. Example for Linux: power on and boot → the services that start → where files live (disks, mounts, storage) → who may touch them (users, permissions) → talking to the network → putting a real application on the box (service unit, logs, ports) → keeping it healthy (performance, patching). Group related cards; do not interleave unrelated ones.
- **hooks**: exactly `concepts.length - 1` strings. `hooks[i]` is shown at the bottom of the card at position `i` of `order`, pointing at the card at position `i + 1`. It must make the reader want to tap Next: name the next card's idea as a question or a consequence of what they just learned. 15 to 140 characters. Examples: "The kernel is up. But who starts your web server, and restarts it at 3 a.m. when it dies?" / "Services are running. Where do they keep their data when the disk fills up?"
- **upNext**: 15 to 160 characters shown when the topic is finished, teasing what to learn after this topic (the next topic in a real job, not a summary of this one).
- **basics**: indexes of cards an experienced (7+ years) engineer already knows cold. Keep it honest; usually 1 to 3 cards, can be empty.

## Output 2: analogies (owner rule, do not regenerate per topic)
Analogies live in `scripts/analogies.mjs`, which writes `web/content/meaning/<pack>.json`. Add one only where a real, widely used everyday picture genuinely helps someone remember the idea in an interview (the shipping container for Docker, the coat check for a HashMap). Most topics should have none. Never reuse a picture, never force one, and keep the diagram's steps technical: the analogy is a single line above the diagram, not a rewrite of it. This is interview prep, not a course.

## Style
Plain English, short sentences, no emoji, no exclamation marks, no marketing words. Second person is fine. Do not invent commands or facts; if unsure, keep the original wording's facts.

## Check before you finish
```bash
node scripts/validate-flow.mjs <pack>
```
It must print `ok`. Fix every error it reports. Run it for each of your packs. Finish with one line per pack: number of topics written, and any topic you were unsure about.
