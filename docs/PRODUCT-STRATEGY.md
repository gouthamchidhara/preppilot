# PrepPilot: product and monetization strategy

Written November 2026, alongside the UI redesign. Prices and conversion effects below are hypotheses to test, not measurements. Cost figures come from `docs/COST-AND-PRICING.md`.

## The short version

1. **Pro currently sells quota** (500 messages, 30 voice minutes). Quota of a general AI is exactly what ChatGPT and Claude sell, for more uses, at a similar price. Nobody should pay us for that, and the plans screen has been telling them that is what they get.
2. **What a general chatbot does not give you** is structure and memory: a plan tied to your date, a record of what you got wrong, a realistic interview with a score, and a clear answer to "am I ready?". That is the product. The AI is a component.
3. **Interview prep is episodic.** People search for one to three months, get hired and leave. A monthly subscription fights that. A time-boxed pass fits it.
4. **The scored mock interview should come back**, as the centre of the paid offer. It was removed in this round at your request. As a bare 60-minute voice call it was not worth $10.99. With a rubric, a written report and history, it is the one thing here that is hard to get from a prompt.

## 1. Audit: what was wrong with the interface

| Problem | Why it hurt | Status |
|---|---|---|
| Loud accent on black, glow effects, gradients | Tiring for an app people read in for 20 minutes at a time | Fixed in this redesign |
| Everything in an identical rounded box | No hierarchy: today's task looked as important as a settings row | Fixed: one card object, the rest is type and rules |
| Several competing calls to action per screen | Unclear what to do next | Fixed: one primary action per screen |
| 31 topics dumped on the home screen | The plan looked like homework, not guidance | Fixed: top 8, rest on request |
| Plans screen sold message counts | Invites the ChatGPT comparison and loses it | Copy fixed; offer itself still needs the changes below |
| Progress is one percentage | Does not answer "am I ready?" or "what is my weakest area?" | Open |
| Progress lives on one device | A paying user who opens the web app after the phone sees nothing | Open |
| No reason to come back tomorrow | No reminder, no daily target | Open |

## 2. Design direction (shipped)

A quiet desk. Neutral paper-and-ink surfaces in light and dark, a serif for anything you read or answer, a sans for controls, ink-coloured buttons, and one muted green reserved for progress. The single memorable object is the index card: today's task and every flashcard sit on a small stack of cards, and a graded card leaves the stack to the side you graded it. Motion appears only in response to an action.

The intent is that it reads like a well-set technical book, which is what the content is, and unlike the gradient-and-glow look of most AI products.

## 3. Why someone would pay us and not a general AI

| A general chatbot | PrepPilot |
|---|---|
| Answers what you ask | Decides what you should study today, from your role, level, date and misses |
| Forgets last week | Remembers every card you missed and brings it back on schedule |
| Quizzes you if you write a good prompt | Runs an interview with no prompt, at your level, and scores it the same way each time |
| Says "great answer" | Grades against a fixed rubric and shows the trend across sessions |
| Knows nothing about the job | Works from the actual job description and your résumé (proposed) |
| Cannot tell you if you are ready | Gives a readiness figure per topic and for speaking (proposed) |

The defensible parts are the ones built on accumulated data about one person's preparation. Build those; do not build more chat.

## 4. Features, ranked

Effort assumes the current codebase. Cost is ongoing AI spend per active user.

| # | Feature | User value | Effort | AI cost | Revenue effect |
|---|---|---|---|---|---|
| 1 | **Scored mock interview with a written report.** 20 to 30 minutes of voice, then a text pass over the transcript: score per question on accuracy, structure, depth and delivery; what a strong answer would have added; history and trend | Very high | Medium: voice exists; add transcript grading and a report screen | About $0.60 to $1.20 per session | The main reason to pay |
| 2 | **Job-description targeting.** Paste the posting and your résumé; the plan, cards and mock questions re-weight to it, with a list of gaps between the two | High | Medium | Cents | Strong: makes the plan feel made for this job |
| 3 | **Readiness that means something.** Per-topic and speaking readiness, weakest three areas, "on track for your date" | High | Low: the data exists | None | Supports conversion and daily use |
| 4 | **A short free mock as the first paid-feature experience.** Ten minutes, with part of the report locked | High | Low once #1 exists | About $0.30 per new user | Likely the best conversion lever |
| 5 | **Daily target and reminders.** A small daily goal and one push notification; a calm streak, no cartoon badges | Medium | Low to medium (push needs a native build) | None | Retention during the search |
| 6 | **Story bank.** Build STAR stories from your résumé, rehearse them, get flagged when a story is vague or inconsistent | Medium to high | Medium | Low | Differentiates behavioural prep |
| 7 | **Interview debrief.** After a real interview, log the questions asked; they feed your next plan | Medium | Low | None | Over time, an owned question bank by role |
| 8 | **Sync across devices** | Medium | Medium to high | None | Removes a reason for refunds |
| 9 | **Web checkout** through RevenueCat Web Billing or Stripe | None directly | Medium | None | Web visitors can currently buy nothing; also avoids the store commission |

### Things I would not build

- **A résumé builder.** It is a crowded commodity and a general chatbot does it well. Do only the part tied to our strength: résumé against job description, as part of #2.
- **A "career companion" for after you are hired.** I disagree with this goal for now. Post-hire retention is a different product with a different buyer, and a small team will do it badly while neglecting the prep product. The cheap version is enough: keep the account and history, and make it one tap to restart for the next search.
- **Help during a live interview.** It risks App Store rejection, it is detectable, and it changes the brand from "prepared" to "cheating".
- **Badges, levels and leaderboards.** Adults preparing for a job interview are motivated by the date. Show honest progress.

## 5. Monetization models compared

| Model | Fit with how people use this | Risk | Verdict |
|---|---|---|---|
| Monthly subscription (today, $11.99) | Poor: the need lasts weeks; people subscribe, finish and cancel, or avoid subscribing at all | High churn, direct comparison with general AI subscriptions | Keep working, stop leading with it |
| Credits or pay per use | Fair: maps to cost | People ration credits and practise less, which defeats the product | Use only for top-ups |
| **Time-boxed pass** (30 or 90 days, does not renew) | Good: matches a job search; no fear of a forgotten renewal | Lower lifetime value per user unless priced for the whole episode | **Recommended core** |
| Lifetime purchase | Poor: ongoing voice cost against a one-off payment | Margin | No |
| Free guide plus paid coach (freemium) | Good as acquisition | Free users cost little as long as AI stays capped | Keep |

### Recommended offer (to test)

- **Free:** the plan, every lesson and flashcard, a small AI trial, and one short scored mock with part of the report locked.
- **Interview Pass, 30 days, about $24.99; 90 days, about $49.99.** Unlimited coach chat within a fair-use cap, a generous voice allowance, four scored mock interviews in the 30-day pass, job-description targeting.
- **Extra mock interviews, about $6.99 each,** for pass holders who run out and for free users who want one.
- **Monthly subscription** stays available for now so nothing breaks; revisit after the pass has data.

Margin check for the 30-day pass: about $21 after a 15% store commission. Worst-case AI cost with four 30-minute mocks, 120 other voice minutes and heavy chat is roughly $6 to $8. Voice is the cost to watch; cap it per day as well as per pass.

On the "why not ChatGPT" question: at $25 for the whole search, the comparison stops being "this or ChatGPT for a month" and becomes "is being better prepared for this interview worth $25?". For someone about to negotiate a salary, it is.

## 6. Roadmap

Each phase leaves the existing app working. Sign-in, RevenueCat and the current Pro entitlement are untouched until phase 3.

| Phase | Scope | Why this order |
|---|---|---|
| 0, done | Redesign, purchase and voice fixes, release workflow | Trust and usability first |
| 1, about two weeks | Scored mock interview with report (#1), free short mock (#4), readiness per topic (#3); Pro includes mocks; plans screen sells the report, not quotas | Gives the current subscription something worth buying |
| 2, two to four weeks | Job-description targeting (#2), story bank (#6), debrief log (#7), daily target and reminders (#5) | Personal data that a chatbot does not have |
| 3 | Interview Pass and mock top-ups as new products, tested against the monthly plan; web checkout (#9); sync (#8) | Pricing change once the value is in place |
| 4 | Question bank built from debriefs; referral ("give a friend a free mock"); seats for bootcamps and university placement offices | Growth and steadier revenue than individual job seekers |

## 7. What to measure

- Activation: share of new users who finish onboarding and complete a first session.
- Day-7 return rate during an active search.
- Free to paid, split by whether the user tried the free mock.
- Voice minutes and AI cost per paying user.
- Refund rate, and the reason given.

If only one number is tracked, track the share of new users who complete a mock interview. Everything in this document assumes that is the moment people see the value.
