# Bisco Tracker

Log the Disco Biscuits shows you've been to and see every song, segue and gap you've caught.
Shows and setlists come from the [Bisco Internet Project](https://discobiscuits.net) (BIP).

**How it's built:** a Next.js website hosted on Vercel, with sign-in and the database on Supabase.
The server talks to BIP's MCP server and saves every year's show list and every setlist in the database,
so BIP is asked once per show, not once per visitor.

| Folder | What's in it |
| --- | --- |
| `app/` | Pages: home, sign-in, and the server routes that fetch from BIP |
| `components/Tracker.tsx` | The tracker itself: stats, your shows, the year picker and the setlist form |
| `lib/setlist.ts` | Setlist parsing and all the stats math |
| `lib/bip.ts` | The BIP connection and its cache |
| `supabase/schema.sql` | Database tables and the rules that keep each person's shows private |
| `prototype/` | The original one-page version |

---

## Launch it on your own domain

You'll do this once. It takes about an hour, most of it waiting for DNS.

### 1. Buy the domain

Any registrar works. Cloudflare, Porkbun and Namecheap are good, cheap choices.

### 2. Set up Supabase (sign-in and database)

1. Create an account at [supabase.com](https://supabase.com) and click **New project**. Pick a region near the East Coast and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste in everything from `supabase/schema.sql`, and click **Run**.
3. Open **Project Settings → API** and keep that tab open. You need three values from it in step 3:
   - **Project URL**
   - **anon / publishable key**
   - **service_role / secret key** (keep this one private)
4. Upgrade the project to **Pro** under **Organization → Billing**, so it never pauses and gets daily backups.

### 3. Put the site on Vercel

1. Create an account at [vercel.com](https://vercel.com) using **Continue with GitHub**.
2. Click **Add New → Project**, then pick the `bisco-tracker` repository and click **Import**.
3. Open **Environment Variables** and add these four:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL from Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |
   | `BIP_MCP_URL` | `https://discobiscuits.net/mcp` |

4. Click **Deploy**. You'll get a `something.vercel.app` address in a minute or two.

From now on, every change pushed to GitHub goes live by itself.

### 4. Connect your domain

1. In Vercel, open the project's **Settings → Domains**, type your domain and click **Add**.
2. Vercel shows one or two DNS records. Add them at your registrar under **DNS**.
3. Wait for the green check. HTTPS sets itself up.

### 5. Point sign-in at your domain

In Supabase, open **Authentication → URL Configuration**:

- **Site URL:** `https://yourdomain.com`
- **Redirect URLs:** add `https://yourdomain.com/auth/callback`

### 6. Send sign-in emails from your domain

Supabase's built-in email only sends a few messages an hour, which isn't enough for a public site.

1. Create an account at [resend.com](https://resend.com) and add your domain. It gives you a few DNS records; add them at your registrar.
2. Create an API key in Resend.
3. In Supabase, open **Authentication → Emails → SMTP Settings**, turn on custom SMTP, and enter:
   - Host `smtp.resend.com`, port `465`, username `resend`, password: your Resend API key
   - Sender: something like `shows@yourdomain.com`

### 7. Optional: Continue with Google

1. In [Google Cloud Console](https://console.cloud.google.com), create an **OAuth client ID** (type: Web application).
2. Under **Authorized redirect URIs**, add the callback URL that Supabase shows under **Authentication → Sign In / Providers → Google**.
3. Paste the Google client ID and secret into that Supabase page and turn Google on.

Until you do this, the Google button says it isn't set up and people use the email link.

---

## Before you announce it

- Contact BIP through the form on [discobiscuits.net](https://discobiscuits.net). Their terms rule out commercial use, and the MCP server is a beta. Ask if they're happy with a public tracker using it.
- Sign up with a second email address and confirm that it can't see your shows.

## Run it on your computer (optional)

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
cp .env.example .env.local   # then fill in the values
npm install
npm run dev                  # open http://localhost:3000
```
