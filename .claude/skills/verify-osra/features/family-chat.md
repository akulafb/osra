# Family chat

The 🤖 button opens the Family Chat Bot, which answers questions about the signed-in person's family ("Who is my father?", "How are X and I related?"). Common question kinds are answered in code; the rest go to the model. Each account has 10 messages per UAE day.

## Sub-features

- `chat-open` the 🤖 button opens the panel; ✕ closes it.
- `chat-answer` a question gets a user bubble, "AI is thinking...", then an answer bubble.
- `chat-clear` Clear empties the conversation (a limit line stays).
- `chat-limit` after 10 messages a status line replaces answers and the input is disabled until UAE midnight.

## How to get to it (user POV)

- The round 🤖 button at the bottom left of the tree, in 2D and 3D.

## Driving it with ui.sh

Preconditions:

- Baseline preconditions hold; the tree is showing.
- The ticket needs a sent message. Opening the panel is free; each sent message spends one of the owner's 10 daily messages and may spend OpenRouter credit on dev. Send at most one per run, preferring a code-answered question such as "Who is my father?".

- **Open.** Run `$S/ui.sh "$RUN_DIR" click button "🤖"`. `ui.sh tree` shows "Family Chat Bot", button "Clear", the empty text "Ask me anything about your family tree!", `textbox "Who are my maternal cousins?"` and button "Send".
- **Ask.** Run `$S/ui.sh "$RUN_DIR" fill textbox "Who are my maternal cousins?" "Who is my father?"`, then `$S/ui.sh "$RUN_DIR" click button "Send"`. The question appears as a bubble; within about 30 s an answer bubble follows and "AI is thinking..." is gone.
- **Side effect.** Supabase MCP `execute_sql` on `djwqamcfllqziqiyvyjj`: `SELECT uae_day, model_calls, created_at FROM chat_message_usage ORDER BY created_at DESC LIMIT 3;` shows a row created at the time of the send.
- **Clear.** Run `$S/ui.sh "$RUN_DIR" click button "Clear"`. The empty text returns.
- **Close.** Run `$S/ui.sh "$RUN_DIR" click button "✕"`.
- **Proof.** `capture.sh "$RUN_DIR" family-chat open`, `... asked` after the answer, and the SQL result saved to `$RUN_DIR/evidence/family-chat/usage.txt`.

## Gotchas

- A `role="status"` line in the panel is a notice (failure, daily limit, credit gone), not an answer. The limit line disables the input and the Send button.
- Messages are capped in length (`MAX_USER_MESSAGE_CHARS`); longer input is cut silently.
- The answer is about the signed-in owner's own node, so the expected answer depends on their place in the dev tree; check it against the tree, not a fixed string.
- The chat calls the dev `family-chat` Edge Function; if it is not deployed to dev with its secrets, every send ends in a failure notice. That is an environment gap to report, not a pass.
