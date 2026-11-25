---
title: Review requests
description: How AgentStack asks your clients for a Google review after a closing, and where to see every request.
category: Messaging & AI
order: 10
---
# Review requests

Review Requests asks your clients for a Google review after a deal closes. It's included in every workspace at no extra charge.

## How it works

1. **When a deal closes** — when a deal moves to Closed (won) — a review request is created for that deal's contact.
2. **It waits for the delay you set.** The request goes out a number of days after closing. The default is **3 days**; you can choose anywhere from 0 (send right away) to 30 days.
3. **It sends your Google review link** to the contact by text message or WhatsApp, using the channel and message in your Google review settings.

Review requests link to **Google only**. Set your Google review link under **Workspace Settings → Messaging & email → Google reviews**. Until a link is set, requests are logged as failed with the reason, rather than sent.

## Off, Log only and Live

The automation has three modes, chosen on the Review Requests page:

- **Off** — nothing happens when a deal closes.
- **Log only** — when a deal closes, the request is created, scheduled for the delay, and every step is written to the log, including whether it *would* have sent or exactly why it would fail. **Nothing is sent.** This is the starting mode, so you can see what would happen before any client receives a message.
- **Live** — the same flow, and the request is really sent at its scheduled time.

The mode is checked at the moment a request is due, so switching to Off cancels requests that are still waiting, and switching to Live means waiting requests will send.

## Sending one by hand

Use **Send review request** at the top of the Review Requests page (or the **Review** button on a contact) to send one now. A request you send by hand goes out immediately, with no delay, whatever mode the automation is in. If it can't be sent — for example, text messaging isn't set up — you'll see the exact reason instead of a success message.

## Where the log lives

Every request — automatic or sent by hand — appears on **Grow My Business → Review Requests**, with the contact, the deal, when it is or was scheduled, when it was sent, its status (Queued, Would send, Sent, Failed, Skipped or Cancelled), the reason for anything that didn't send, and a step-by-step log.

## Good practice

- Leave the automation in Log only for a few closings and check the log before switching to Live.
- Make sure your Google review link opens your review form before going Live.
- A contact who was asked recently isn't asked again automatically until your cooldown period has passed.
