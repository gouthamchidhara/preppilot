# PrepPilot Cost & Pricing Analysis

## Azure AI Unit Costs (Nov 2026 list prices)

### Text chat — `gpt-4.1-mini`
| Token type | Price per 1M tokens | Avg tokens / message | Cost / message |
|---|---|---|---|
| Input | $0.40 | ~1,500 | $0.0006 |
| Output | $1.60 | ~400 | $0.00064 |
| **Total** | | | **~$0.0013** |

### Voice — `gpt-realtime-mini` + `gpt-4o-mini-transcribe`
| Component | Price | Rate / minute | Cost / minute |
|---|---|---|---|
| Audio input | $10 / 1M tokens | ~600 tokens | $0.006 |
| Audio output | $20 / 1M tokens | ~600 tokens | $0.012 |
| Transcription | $0.003 / minute | — | $0.003 |
| **Total** | | | **~$0.021–0.040** |

The range reflects conversation dynamics (talking vs. silence, interruptions, model output length).

---

## 1-Hour Continuous Interview Cost

| Scenario | Messages / minutes | Azure cost |
|---|---|---|
| **Text only** (1 msg / 30 sec) | 120 messages | **$0.16** |
| **Voice only** (continuous) | 60 minutes | **$1.26–$2.40** |
| **Mixed** (40 min voice + 40 text) | 60 min + 40 msg | **$0.89–$1.65** |

Voice is **~8–15× more expensive** than text for the same interview time.

---

## Revenue After Apple's Commission

| Price tier | Gross / month | Apple 15% (SBP) | Apple 30% (standard) |
|---|---|---|---|
| $4.99 | $4.99 | $4.24 net | $3.49 net |
| **$7.99** | **$7.99** | **$6.79 net** | **$5.59 net** |

*Apple Small Business Program (SBP) gives 15% if annual App Store revenue < $1M. Enroll.*

---

## Profitability at $7.99/month (SBP 15% → $6.79 net)

| Usage profile | Azure cost | Profit | Margin |
|---|---|---|---|
| Light (100 msgs, 5 min voice) | $0.24–0.33 | $6.46–6.55 | **95–96%** |
| Moderate (300 msgs, 15 min voice) | $0.71–0.99 | $5.80–6.08 | **85–90%** |
| Heavy (500 msgs, 45 min voice) | $1.60–2.45 | $4.34–5.19 | **64–76%** |
| Worst case (500 msgs, 45 min voice) | $2.45 | $4.34 | **64%** |

At the recommended limits below, **every Pro user is profitable**.

---

## Live coach session margin

A 60-minute Live coach session costs $1.26–$2.40 in voice ($0.021–$0.040/min). Hints add about ten short completions, roughly $0.01–$0.03. Against the $10.99 one-time price:

| | Gross | Apple 15% net | Apple 30% net |
|---|---|---|---|
| Session revenue | $10.99 | $9.34 | $7.69 |
| Worst-case AI cost | $2.43 | $2.43 | $2.43 |
| **Profit** | | **$6.91** | **$5.26** |

The session is comfortably profitable even at the 30% commission, and it is billed separately from Pro, so heavy practice-test use never eats the subscription margin.

---

## Recommended Monthly Limits

### Free tier (lifetime)
| Resource | Limit | Max Azure cost / user |
|---|---|---|
| AI messages | 15 | $0.02 |
| Voice minutes | 2 | $0.08 |
| **Total** | | **$0.10** |

Global free pool: 200 msgs + 10 voice min/day → max $0.65/day across all free users.

### Pro tier — $7.99/month
| Resource | Limit | Max Azure cost |
|---|---|---|
| AI messages | 500 / month | $0.65 |
| Voice minutes | 45 / month | $1.80 |
| Max per voice call | 10 min | — |
| Prompt length | 2,000 chars | — |
| Response length | 500 tokens (200 for voice) | — |
| **Worst-case total** | | **$2.45/month** |

**Net revenue after Apple 15%: $6.79. Worst-case cost: $2.45. Profit: $4.34 (64% margin).**

---

## Controls That Protect Margins

1. **Per-message cap**: 2,000 chars prompt, 500 tokens response → predictable cost per message.
2. **Monthly hard limits**: Messages and voice minutes are deducted before each call; refunded on failure.
3. **Per-call voice cap**: 10 minutes max, enforced server-side with Azure hangup. A single monthly-plan call runs at most 10 minutes, then the user starts a new one. (Live coach sessions are separate: up to 60 minutes, no silence cut-off.)
4. **Rate limits**: 40 chat, 15 voice, 6 generate per user per hour.
5. **Global daily cap**: 3,000 AI calls/day across all users (safety brake).
6. **Free pool**: 200 msgs + 10 voice min/day shared across all free users.
7. **Budget alert**: $20/month Azure budget alert (warning only — not a hard stop).

---

## Pricing Recommendation

**Set Pro at $7.99/month.** Rationale:

- Voice is the dominant cost driver. 45 min/month keeps worst-case cost at $2.45.
- $7.99 undercuts general-AI subscriptions while the product sells structure and memory, not quota.
- Even at 30% Apple commission ($5.59 net), the worst case is 56% margin.
- Enroll in Apple's Small Business Program for 15% commission to boost margins further.
- Free tier (15 msgs + 2 min voice) is enough to demonstrate value, not enough to abuse.


## Live AI and Pro, November 2026 (plain-language estimate)

Estimates from Azure list prices for `gpt-realtime-mini`; check the real bill after the first 20 to 30 sessions (Cost Management, filter on the AI resource).

**Why long calls cost more per minute than short ones:** in a voice call the AI re-reads the conversation so far before each reply. Early in a call that is cheap; after 40 minutes it is re-reading a lot. Cached re-reads are billed at a small fraction of the normal price, which keeps it in check.

| What | Our Azure cost |
| --- | --- |
| One AI text message | about 0.1 to 0.2 cents |
| 30-minute voice call | about $0.80 to $1.80 |
| 60-minute voice call | about $2 to $4 |
| 60 minutes, "during your interview" mode (AI writes, does not speak) | about $1 to $2 |

Apple keeps 15% under the Small Business Program (under $1M a year), 30% otherwise. Figures below use 15%.

| Product | User pays | We receive | Our AI cost | We keep |
| --- | --- | --- | --- | --- |
| Live AI, 60 minutes | $10.99 | $9.34 | $2 to $4 | $5.30 to $7.30 |
| Pro, light user (100 messages, 10 voice min) | $7.99 | $6.79 | about $0.50 | about $6.30 |
| Pro, heavy user (500 messages, all 45 voice min incl. a 30-min Live AI) | $7.99 | $6.79 | $2 to $3.40 | $3.40 to $4.80 |
| Free user, maximum | $0 | $0 | about $0.10 | -$0.10 |

Recommendation: raise Live AI to $14.99 (we keep about $9 to $11) and Pro to $9.99 once there are reviews (we keep about $5 to $8 even for heavy users). Grandfather existing subscribers. Prices are set in App Store Connect and RevenueCat; the app shows `PRO_PRICE_LABEL` and `LIVE_PRICE_LABEL`.


### Prices set by the owner (November 2026): Pro $10.99/month with two 30-minute Live AI sessions; Live AI hour $15.99

| Product | User pays | We receive (85%) | Our AI cost | We keep |
| --- | --- | --- | --- | --- |
| Live AI, 60 minutes | $15.99 | $13.59 | $2 to $4 | $9.60 to $11.60 |
| Pro, light user | $10.99 | $9.34 | about $0.50 | about $8.80 |
| Pro, heaviest user (500 messages, 45 voice min, both 30-min Live AI sessions) | $10.99 | $9.34 | $3.30 to $6 | $3.30 to $6 |

### Unlimited Pro messages (owner decision) and how they are kept in check

- Sold as unlimited. Hidden fair-use ceilings: 150 a day and 2,000 a month (`PRO_MSGS_PER_DAY`, `PRO_MSGS`), plus 40 an hour.
- Scope: AI only helps with interview prep in the user's technologies. Clear off-topic asks ("build me an app", "write a cover letter", "do my homework") get a fixed reply with no model call and no message used. Everything else is held to scope by the system prompt.
- Cost per reply is capped: 8 messages of history, 1,500 characters per message, 450 output tokens, code snippets of about 25 lines.
- Worst case at the ceiling: 2,000 messages × about $0.0012 = about $2.40 a month. A realistic heavy user (30 a day) is about $1.
- Pro at $10.99 (we receive $9.34): heaviest possible user, everything used, costs about $5.70 to $8.40, so still a small profit. Typical users cost $1 to $3. $10.99 is enough; do not go lower.
