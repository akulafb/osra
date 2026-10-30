# What does one chat message cost?

Research for LIN-85, ticket "What does one chat message cost?". Prices checked 2026-10-30. Code read at `298bc94` (`origin/main`). No paid call was made and no database was read, so every token count below is an estimate from the prompts as written.

## Answer

- **One `family-chat` message costs about $0.003 to $0.014 in model calls; plan on about $0.007.** It is $0.0031 when the model answers in one call, $0.0072 with one tool round (two calls), and $0.0144 with two tool rounds (three calls). A message the code answers itself costs $0.00004 (one TypeSafe Jev call, no model call).
- **At 5 messages per account per day, 30 days, the planning case ($0.0072 a message) is:** 100 accounts $3.60 a day, $108 a month; 1,000 accounts $36 a day, $1,080 a month; 10,000 accounts $360 a day, $10,800 a month. The low case is 0.43 times that and the high case is 2 times that (tables below).
- **One `spelling-matches` call costs about $0.0004 for a Tree with 268 distinct given names and $0.0013 at the 1,000-name request limit.** It has no per-account limit today, so how often it is called is not established. At an assumed 10 calls per account per day it adds $106 to $394 a month at 1,000 accounts.
- **The biggest unknown is how many reasoning tokens Grok 4.3 spends per call.** They bill as output and are not held to the reply cap. The one measurement in the repo is 689 reasoning tokens on a call capped at 30 tokens. The range above assumes 200 to 700 per call.
- **The code's daily limit is 10, not the 5 in ADR 0021.** Costs here scale linearly: at 10 a day, double every figure.

## Prices

| Service | Item | Price | Source (checked 2026-10-30) |
|---|---|---|---|
| OpenRouter, `x-ai/grok-4.3` | input | $1.25 per million tokens | [OpenRouter models API](https://openrouter.ai/api/v1/models), `pricing.prompt` = `0.00000125` |
| | output (reasoning tokens bill as output) | $2.50 per million tokens | same, `pricing.completion` = `0.0000025` |
| | cached input | $0.20 per million tokens | same, `pricing.input_cache_read` = `0.0000002` |
| | long prompts | doubles at 200,000 prompt tokens or more | same, `pricing.overrides`; no chat request gets near it |
| TypeSafe, Jev | input | $0.042 per million tokens | [TypeSafe launch post](https://typesafe.ai/blog/introducing-system-one-models-and-jev): "Input tokens: $0.042 / MTok" |
| | output | free | same: "Output tokens: FREE" |

Notes on these:
- The model is `CHAT_MODEL = 'x-ai/grok-4.3'` in `supabase/functions/family-chat/openRouter.ts`. The Jev model is pinned as `jev-1.13.0` in `supabase/functions/family-chat/questionKind.ts` and `supabase/functions/spelling-matches/spellingMatches.ts`.
- TypeSafe has no pricing page (`typesafe.ai/pricing` returns 404) and its docs introduction has no price. The launch post is the only first-party source. The repo already uses the same figure: `JEV_PRICE_PER_MILLION_INPUT_TOKENS = 0.042`, dated 2026-09-30, in `src/lib/fixtures/chatTestHarness.ts`. The launch post's header date (15 Sep 2026) and its page metadata (28 Oct 2026) disagree; the price may have been edited since. Early access is waitlisted, so the price for a signed-up platform is not established.
- OpenRouter bills its own fee on credit purchases. That fee is not in the models API and was not looked up, so it is not in these figures.
- OpenRouter's `usage.cost` is the real per-call cost and the function already reads it (`cost` in `openRouter.ts`). The owner can replace every estimate here with measured numbers by reading it from a few real messages.

## What a message sends

The Tree never goes to the model. The system prompt holds only the rules and the speaker; every fact comes back as a tool result that the browser builds from the Working Record (`supabase/functions/family-chat/prompt.ts`, `src/lib/chatTools.ts`). So a request carries no Tree except what the tool results hold. A tool result is capped at 20,000 characters (`MAX_TOOL_RESULT_CHARS`, `request.ts`), about 5,700 tokens; the estimates below assume small results, about 300 tokens.

Fixed part of every model call, measured from the code (`buildSystemPrompt` and `CHAT_TOOLS`):

| Part | Characters |
|---|---|
| System prompt (rules, style, speaker) | 2,319 |
| Tool definitions (5 tools, JSON) | 3,799 |
| Total | 6,118 |

Assumption: 3.5 characters per token (English prose with JSON; Grok's tokenizer was not run). That gives about 1,750 tokens, plus a 30-token question, so **about 1,850 input tokens on a first call**. A final call adds a 201-character note (about 60 tokens), left out as small.

Limits that bound a message (`supabase/functions/family-chat/limits.ts`): 10 messages per account per UAE day (`DAILY_MESSAGE_LIMIT`), at most 6 model calls per message including the route, reply capped at 220 tokens (`MAX_REPLY_TOKENS`), the loop stops once a message has spent $0.01 (`MAX_MESSAGE_COST_USD`) and the next call is a no-tools answer.

The order of work for one message (`src/lib/familyChat.ts`, `supabase/functions/family-chat/handler.ts`):
1. A `route` call to Jev reads the question. This is counted as the message's first call.
2. If code can answer, it does, with no model call.
3. Otherwise Grok 4.3 is called, up to the call and cost limits.

## Cost of one message

### Jev route call (every message)

The request body is 3,539 characters with a 33-character question (`buildQuestionKindRequest`), about 1,000 tokens at 3.5 characters per token. 1,000 × $0.042 / 1,000,000 = **$0.000042**. Output is free.

Not established: whether Jev counts the shared `state` once or once per question. The five questions are in one request, so the estimate above counts the request text once. A per-question count would be at most 5 × the state, and the state is one short message, so the difference is under $0.00001.

### Grok 4.3 model calls

Per call: input tokens × $1.25 / 1M + output tokens × $2.50 / 1M. Output is the visible tokens plus reasoning tokens.

| Case | Calls | Input tokens | Output tokens | Arithmetic | Cost |
|---|---|---|---|---|---|
| Low: one call, a short answer, 200 reasoning tokens | 1 | 1,850 | 100 + 200 = 300 | 1,850 × 1.25e-6 = 0.002313; 300 × 2.5e-6 = 0.000750 | $0.0031 |
| Planning: one tool round, 300 reasoning tokens per call | 2 | 1,850 + 2,250 = 4,100 | (60 + 300) + (150 + 300) = 810 | 4,100 × 1.25e-6 = 0.005125; 810 × 2.5e-6 = 0.002025 | $0.0072 |
| High: two tool rounds, 700 reasoning tokens per call | 3 | 1,850 + 2,250 + 2,650 = 6,750 | (60 + 700) + (60 + 700) + (150 + 700) = 2,370 | 6,750 × 1.25e-6 = 0.008438; 2,370 × 2.5e-6 = 0.005925 | $0.0144 |

Assumptions behind the table:
- A tool call is 60 output tokens. The final answer is 150 output tokens (about 100 words; the prompt asks for at most 150 words, the cap is 220 tokens).
- Each tool round adds about 400 input tokens to the next call: the assistant's tool call (about 100) and a tool result (about 300).
- 300 reasoning tokens (planning) and 700 (high) are guesses around one measurement: the comment in `limits.ts` says `max_tokens: 30` still reasoned 689 tokens on 2026-10-01. Real reasoning varies by question and was not measured over a set of questions.
- No prompt caching is assumed. The fixed 1,850 tokens repeat on every call, so if OpenRouter caches them, input falls toward $0.20 per million for those tokens. Whether the OpenRouter route to xAI caches them was not established.
- Each case adds the Jev route call ($0.000042), which rounds away. The cases land on $0.0031, $0.0072 and $0.0144.
- The $0.01 cap per message (`MAX_MESSAGE_COST_USD`) is checked after each call, so a message can overshoot it by the cost of its next call. In the high case the third call starts at $0.00915 spent and ends at $0.0144. A practical ceiling is about $0.01 plus one or two calls, so roughly $0.015 to $0.02. The ceiling is an estimate, not a limit in the code.

### Messages the code answers

If the router sends a message to code (`routeMessage` in `src/lib/chatRouting.ts`), the cost is only the Jev call, $0.000042. What share of real questions this covers was not established: it needs the routing eval (`scripts/chat-routing-eval`) or real traffic, and both need paid calls. The table below does not count on it, so it is on the high side if code answers a share.

## A day and a month of `family-chat`

Messages: 5 per account per day, 30-day month, every message on the model path. Cost = accounts × 5 × cost per message.

| Accounts | Low ($0.0031) day / month | Planning ($0.0072) day / month | High ($0.0144) day / month |
|---|---|---|---|
| 100 | $1.55 / $46.50 | $3.60 / $108 | $7.20 / $216 |
| 1,000 | $15.50 / $465 | $36 / $1,080 | $72 / $2,160 |
| 10,000 | $155 / $4,650 | $360 / $10,800 | $720 / $21,600 |

"Active accounts" is taken to mean every account uses all 5 messages every day. Real use is lower, so these are an upper bound on the account count. They are a lower bound if the owner lifts the allowance for some accounts (ADR 0021).

## `spelling-matches`

Source: `supabase/functions/spelling-matches/spellingMatches.ts`. The function sends the typed name and one yes/no question per distinct given name in the Tree to Jev, and nothing to a language model. The code comment says "268 names is about 8,400 input tokens", which is about 31.3 tokens per name; that comment is the only token figure in the repo and was not re-measured. The request holds at most 1,000 names (`MAX_NAMES`).

| Request | Input tokens | Arithmetic | Cost per call |
|---|---|---|---|
| 268 names | 8,400 | 8,400 × $0.042 / 1M | $0.00035 |
| 1,000 names | 31,300 | 31,300 × $0.042 / 1M | $0.0013 |

Not established: how many calls an account makes. The browser calls it after a 300 ms pause in typing (`SPELLING_LOOKUP_DEBOUNCE_MS`, `src/lib/spellingMatchLookup.ts`) when someone types a name to match against the Tree, and the function counts nothing and limits nothing per account (`handler.ts` checks only the sign-in). ADR 0021 says the monthly cap covers this function, but today nothing counts its spend, so the cap would need a counter here. Also not established: how many distinct given names a Tree of 5,000 Persons holds. It is capped at 1,000 per request by the function, so that is the ceiling per call.

Illustration, assuming 10 calls per account per day and 30 days:

| Accounts | 268 names: day / month | 1,000 names: day / month |
|---|---|---|
| 100 | $0.35 / $10.60 | $1.31 / $39 |
| 1,000 | $3.53 / $106 | $13.10 / $394 |
| 10,000 | $35.30 / $1,059 | $131 / $3,940 |

## What could not be established

- Reasoning tokens per Grok 4.3 call over real questions. This is the largest swing in the `family-chat` figures. Measure it by reading `usage.cost` on a set of real messages.
- The share of messages the code answers with no model call.
- Whether OpenRouter caches the repeated system prompt and tools, and OpenRouter's own fee on credit purchases.
- The Grok tokenizer's count for these prompts. The 3.5 characters per token figure is an assumption.
- TypeSafe's price after early access, and whether the Jev price has changed since the launch post (the post's date is inconsistent).
- How often `spelling-matches` is called per account, and the number of distinct given names in a large Tree.
- Provider rate limits at 10,000 accounts. Not looked up.

## Facts the cap design needs (ADR 0021)

- The code limit is 10 messages a day; the ADR says 5. Changing `DAILY_MESSAGE_LIMIT` in `limits.ts` is the only edit the cost needs.
- A message is counted per account in the database (`chat_use_model_call`); nothing sums dollars across accounts. The per-message dollar cap exists (`MAX_MESSAGE_COST_USD`) but a platform-wide monthly dollar cap does not, and `usage.cost` is returned to the browser but not stored by the function (`handler.ts`).
- The cheapest control on this cost is the reasoning spend, not the Tree size. The Tree does not reach the model, so a 5,000-Person Tree changes cost only through longer tool results (at most about 5,700 tokens each, about $0.007 more input per call at the cap).
