# Family chat

The 🤖 button opens the Family Chat Bot, which answers questions about the signed-in person's family ("Who is my father?", "How are X and I related?"). Common question kinds are answered in code; the rest go to the model. Each account has 10 messages per UAE day (`DAILY_MESSAGE_LIMIT`), and one message may spend $0.01 on model calls (`MAX_MESSAGE_COST_USD`); both are in `supabase/functions/family-chat/limits.ts`.

## Sub-features

- `chat-open` the 🤖 button opens the panel; ✕ closes it.
- `chat-answer` a question gets a user bubble, "AI is thinking...", then an answer bubble.
- `chat-clear` Clear empties the conversation (a limit line stays).
- `chat-limit` after 10 messages a status line replaces answers and the input is disabled until UAE midnight.
- `chat-stack` the chat sits above everything (z-index 10000), except below 900px while the person details sheet is open: then it drops to 1100, behind the sheet (1200), and returns on top when the sheet closes (see [person details](./person-details.md), Chat and sheet).

## A correct reply

The rules are in `supabase/functions/family-chat/prompt.ts`; `src/lib/fixtures/chatTestCheck.ts` checks the same shape on test replies. Every answer bubble meets each rule below that applies to it:

- **Term first.** The Kinship Term comes first, and the reply never spells out the Kinship Path (the chain of Persons between the two): "**Omar Badran** is your uncle, on your father's side." Only a relation no single term names joins terms at a married Person: "your first cousin once removed **Layla Haddad**'s husband".
- **The user's word.** A question with an Arabic kinship word (khalo, khalto, ammo, amto, jiddo, teta) gets that word back, from code and, since LIN-81, from the model: "How am I related to Mohammed Zabalawi, is he my khalo?" gets "**Mohammed Zabalawi** is your khalo."
- **Yes or no.** Since LIN-88, code answers "Is <Person> my <word>?" for an Arabic or English kinship word it knows (`KINSHIP_WORDS` in `src/lib/chatRouting.ts`), with no model call. Yes is the user's word: "Is Mohammed Zabalawi my khalo?" gets "**Mohammed Zabalawi** is your khalo." No is "No." and nothing more: no other term, and no list of who does fit the word. Arabic words are exact, so the father's brother asked as khalo gets "No."; English words that name no side or gender ("uncle", "cousin") fit either. Code checks the word against every Kinship Path that could fit it, not only the shortest, so in a cousin marriage a father-in-law who is also an aunt's husband is "uncle" too. "No." is said only when it is proved: when the tree does not record the gender, side or second parent the word needs, or the word is "cousin" (whose paths have no longest), the reply is the Kinship Term instead. A Person with no Kinship Path gets "You and **X** are not related in the family tree." A word code does not know ("my favourite khalo", "my godfather") goes to the model.
- **Terse.** One or two lines, plus a bulleted list for a group of relatives. An open question ("Tell me about the family") gets two or three sentences of counts, at most 150 words. The reply ends on the answer, with no follow-up question or offer ("Ask me about…"); the one question allowed asks which Person a shared name means.
- **Markdown.** Each Person's name is bold. A list question gets a lead line and bullets, e.g. "Your uncles:" with names tagged "(father's side)" or "(mother's side)".

## How to get to it (user POV)

- The round 🤖 button at the bottom left of the tree, in 2D and 3D.

## Driving it with ui.sh

Preconditions:

- Baseline preconditions hold; the tree is showing.
- Opening the panel is free; each sent message spends one of the owner's 10 daily messages. Send one code-answered question such as "Who is my father?" for the panel itself, plus one question per reply rule the ticket touches ("Is <Person> my khalo?" for yes or no, both code-answered, "Tell me about the family" for an open question on the model path). Keep a run to 4 messages and give the count in the report.

- **Open.** Run `$S/ui.sh "$RUN_DIR" click button "🤖"`. `ui.sh tree` shows "Family Chat Bot", button "Clear", the empty text "Ask me anything about your family tree!", `textbox "Who are my maternal cousins?"` and button "Send".
- **Ask.** Run `$S/ui.sh "$RUN_DIR" fill textbox "Who are my maternal cousins?" "Who is my father?"`, then `$S/ui.sh "$RUN_DIR" click button "Send"`. The question appears as a bubble; within about 30 s an answer bubble follows and "AI is thinking..." is gone. Judge the answer by [A correct reply](#a-correct-reply).
- **Scroll.** The list can stop short of the newest answer. Before each capture, scroll it to the bottom: `$S/ui.sh "$RUN_DIR" orca eval --expression "(() => { const l=[...document.querySelectorAll('div')].find(d => d.style.overflowY==='auto' && d.previousElementSibling?.textContent.startsWith('Family Chat Bot')); l.scrollTop=l.scrollHeight; return l.scrollTop; })()" --json`.
- **Side effect.** Run `SELECT uae_day, model_calls, created_at FROM chat_message_usage ORDER BY created_at DESC LIMIT 3;` on dev through Supabase MCP `execute_sql` (`djwqamcfllqziqiyvyjj`) or, without MCP, the logged-in CLI: `supabase db query --linked --project-ref djwqamcfllqziqiyvyjj "<the SELECT>"`. A row created at the send time passes; `model_calls` 1 means code answered, more means the model did. When neither tool answers, report the side effect as not checked.
- **Clear.** Run `$S/ui.sh "$RUN_DIR" click button "Clear"`. The empty text returns.
- **Close.** Run `$S/ui.sh "$RUN_DIR" click button "✕"`.
- **Proof.** `capture.sh "$RUN_DIR" family-chat open`, `... asked` after the scroll, and the SQL result saved to `$RUN_DIR/evidence/family-chat/usage.txt`.

## Gotchas

- A `role="status"` line in the panel is a notice (failure, daily limit, credit gone), not an answer. The limit line disables the input and the Send button.
- Messages are capped in length (`MAX_USER_MESSAGE_CHARS`); longer input is cut silently.
- The answer is about the signed-in owner's own node, so the expected answer depends on their place in the dev tree; check it against the tree, not a fixed string.
- The chat calls the dev `family-chat` Edge Function; if it is not deployed to dev with its secrets, every send ends in a failure notice. That is an environment gap to report, not a pass.
- Routing (`routeMessage` in `src/lib/chatRouting.ts`, called from `src/lib/familyChat.ts`) runs in the browser, including the code answers and the "Is <Person> my <word>?" yes/no. A change there ships with the frontend deploy, not a `family-chat` deploy. When TypeSafe fails, the route call still returns 200 with `questionKind: null` and the speaker, so browser routing still runs.
