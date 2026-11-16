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
| **$11.99** | **$11.99** | **$10.19 net** | **$8.39 net** |

*Apple Small Business Program (SBP) gives 15% if annual App Store revenue < $1M. Enroll.*

---

## Profitability at $11.99/month (SBP 15% → $10.19 net)

| Usage profile | Azure cost | Profit | Margin |
|---|---|---|---|
| Light (100 msgs, 5 min voice) | $0.23 | $9.96 | **98%** |
| Moderate (300 msgs, 15 min voice) | $0.71 | $9.48 | **93%** |
| Heavy (500 msgs, 30 min voice) | $1.28 | $8.91 | **87%** |
| Worst case (500 msgs, 30 min voice) | $1.85 | $8.34 | **82%** |

At the recommended limits below, **every Pro user is profitable**.

---

## Recommended Monthly Limits

### Free tier (lifetime)
| Resource | Limit | Max Azure cost / user |
|---|---|---|
| AI messages | 15 | $0.02 |
| Voice minutes | 2 | $0.08 |
| **Total** | | **$0.10** |

Global free pool: 200 msgs + 10 voice min/day → max $0.65/day across all free users.

### Pro tier — $11.99/month
| Resource | Limit | Max Azure cost |
|---|---|---|
| AI messages | 500 / month | $0.65 |
| Voice minutes | 30 / month | $1.20 |
| Max per voice call | 15 min | — |
| Prompt length | 2,000 chars | — |
| Response length | 500 tokens (200 for voice) | — |
| **Worst-case total** | | **$1.85/month** |

**Net revenue after Apple 15%: $10.19. Worst-case cost: $1.85. Profit: $8.34 (82% margin).**

---

## Controls That Protect Margins

1. **Per-message cap**: 2,000 chars prompt, 500 tokens response → predictable cost per message.
2. **Monthly hard limits**: Messages and voice minutes are deducted before each call; refunded on failure.
3. **Per-call voice cap**: 15 minutes max, enforced server-side with Azure hangup.
4. **Rate limits**: 40 chat, 15 voice, 6 generate per user per hour.
5. **Global daily cap**: 3,000 AI calls/day across all users (safety brake).
6. **Free pool**: 200 msgs + 10 voice min/day shared across all free users.
7. **Budget alert**: $20/month Azure budget alert (warning only — not a hard stop).

---

## Pricing Recommendation

**Set Pro at $11.99/month.** Rationale:

- Voice is the dominant cost driver. 30 min/month keeps worst-case cost at $1.85.
- $11.99 is within the standard range for AI-powered interview prep tools ($9.99–$29.99).
- Even at 30% Apple commission ($8.39 net), the worst case is 78% margin.
- Enroll in Apple's Small Business Program for 15% commission to boost margins further.
- Free tier (15 msgs + 2 min voice) is enough to demonstrate value, not enough to abuse.
