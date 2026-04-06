# SalesLord

A B2B sales prospecting assistant for enterprise AEs. Replaces the gap between "here's a company profile" and "here's what to actually say to this specific person today."

Research any company and get a full brief: fiscal year timing, strategic initiatives, pain signals, decision makers, tech stack, recent news, and a draft outreach email — all grounded in your voice and your product.

**App URL:** https://saleslord-theta.vercel.app

---

## Getting started (new users)

You'll need an invitation from your admin before you can sign in.

### 1. Sign in
Go to [saleslord-theta.vercel.app](https://saleslord-theta.vercel.app) and sign in with the Google account your admin invited.

### 2. Get an Anthropic API key
SalesLord uses your own Anthropic API key — you pay for your own usage directly, no markup.

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Navigate to **API Keys** in the left sidebar
4. Click **Create Key**, give it a name (e.g. "SalesLord"), and copy the value — it starts with `sk-ant-` and is only shown once

### 3. Add your API key in Profile & Settings
1. In SalesLord, click **Profile & settings →** at the bottom of the sidebar
2. Paste your key into the **Anthropic API key** field
3. Click **Save profile**

A green "API key configured" badge will appear confirming it's saved. Your key is encrypted before storage — no one else can see it.

### 4. Fill out your profile
While you're in settings, fill out:
- **Your background** — relevant experience the assistant can reference naturally
- **Voice samples** — paste 2–5 of your best-performing emails or LinkedIn messages; the more you add, the better the output matches your style
- **Ideal customer profile** — who you're targeting (company size, stage, buyer title, tech stack, geography)

### 5. Research your first prospect
Type a company name into the search bar at the bottom of the sidebar and hit Enter. Research takes 30–60 seconds and produces a full brief including a draft outreach email.

---

## Tips

- **Voice samples matter most.** The quality of generated emails is directly tied to how many samples you provide. Aim for 3–5 of your sharpest messages.
- **The timing bar is your signal.** Green = budget window open now. Amber = approaching. Grey = monitoring. Prioritize accordingly.
- **Use the note log.** Anything you learn in a call or meeting goes in the log. It informs future research and suggested angles.
- **Email draft is a starting point.** Hit "Refresh draft" in the email panel to regenerate if the first version misses the mark.
- **PDF export** — the Export PDF button in the topbar produces a shareable brief you can attach to internal account plans.

---

## For admins

### Inviting teammates
Sidebar → **Manage team →** — enter their email address. They must sign in with that exact Google account.

### Managing products
Sidebar → **Manage products →** — all products are included in every research call. Keep descriptions tight and value props specific; the model uses these to tailor every brief.

### Promoting someone to admin
Run this in the Supabase SQL editor (contact your technical admin):
```sql
update rep_profiles set is_admin = true
where user_id = (select id from auth.users where email = 'their@email.com');
```
