# ManyChat setup sheet (copy and paste)

No secrets are in this file. Your key is the value of `LEAD_INTAKE_KEY` that you set on your PC; type it in ManyChat where it says `YOUR_KEY`.
Project address used below: `https://ghbumxivporzsalivgyg.supabase.co/functions/v1`

## Part 1 · On your PC first (10 minutes)
```
cd C:\Users\Master\cuddly-couscous
git pull origin claude/topmop-operations-app-fas1zc
supabase.cmd db push
supabase.cmd functions deploy lead-intake --no-verify-jwt
supabase.cmd functions deploy chat-availability --no-verify-jwt
supabase.cmd functions deploy chat-estimate --no-verify-jwt
supabase.cmd functions deploy chat-book --no-verify-jwt
supabase.cmd functions deploy chat-brain --no-verify-jwt
supabase.cmd functions deploy chat-send --no-verify-jwt
```
(Answer Y at `db push`.) Secrets, typed on your PC only: `supabase.cmd secrets set LEAD_INTAKE_KEY=...` (a long random text, if not set yet) and, so approved replies are pushed to the customer, `supabase.cmd secrets set MANYCHAT_API_TOKEN=...` (ManyChat → Settings → API). Do not paste them in chat.

In the app: **Settings → AI chat → mode = Suggest** (nothing is sent without your approval). Leave "Book open dates automatically" OFF for now.

## Part 2 · In ManyChat: one block does everything
The AI brain asks the system for prices, dates and bookings by itself, so ManyChat needs only **one** External Request. (An External Request step needs the ManyChat Pro plan.)

1. **Settings → Custom User Fields** → create (type Text): `ai_reply`, `ai_lang`.
2. **Automation → Default Reply** (or the keyword / message trigger you use) → add an **Action → External Request**:
   - Method: **POST**
   - URL: `https://ghbumxivporzsalivgyg.supabase.co/functions/v1/chat-brain?key=YOUR_KEY`
   - Header: `Content-Type: application/json`
   - Body:
```
{"channel":"messenger","subscriber_id":"{{user_id}}","name":"{{first_name}}","text":"{{last_input_text}}","message_id":"{{last_input_text_id}}","lang":"{{ai_lang}}"}
```
   - **Response mapping** (Test the request first, then map): `$.reply` → `ai_reply`
3. Below it add a **Condition**: if `ai_reply` **is not empty** → **Send Message** with the text `{{ai_reply}}`. If it is empty, send nothing (in Suggest mode the reply is empty on purpose; the draft is waiting for you).
4. If ManyChat does not have `{{last_input_text_id}}`, use any unique value per message (for example `{{user_id}}-{{current_time}}`); it only stops a retried message from being handled twice.
5. Publish the automation.

## Part 3 · How you use it
- A customer writes → the draft appears in the app under **Sales → AI Chat**, with its safety flags.
- You **Edit** it if needed and press **Approve & send**. With the token set, the reply goes to the customer through ManyChat; without it you paste the copied text into ManyChat's live chat.
- A booking sentence always comes from the system, never from the AI.

## Part 4 · Test before real customers (15 minutes)
Write to your own Page from a personal Facebook account and check:
1. "Magkano po ang window cleaning sa Makati? 21 panels." → estimate ₱4,799, says the crew counts on site.
2. "Pwede po ba sa Saturday?" → an open date, or the next open dates.
3. "May discount po ba?" → handed to a person (never a discount promise).
4. A complaint or refund → marked **Needs a person**.
5. A Taglish message gets a Taglish reply.
6. Make one test booking (name, mobile, address, date), see it in Jobs, then cancel it.

## Part 5 · When you are happy (your decision, each one separate)
1. **Settings → Messenger booking rules → Book open dates automatically** ON (Confirmed job, no team or price).
2. **Create and send the Job Order automatically** ON; first run `supabase.cmd secrets set APP_URL=https://ops.topmop.ph`.
3. **Settings → AI chat → Full** (replies go out at once; any failed safety check sends a safe handover sentence and alerts you).

## What I could not do for you
I cannot log in to ManyChat or your Facebook Page, and I do not hold your keys, so the clicks in Part 2 and the commands in Part 1 are yours. Everything else (the functions, the rules, the rulebook, the draft inbox) is built.
