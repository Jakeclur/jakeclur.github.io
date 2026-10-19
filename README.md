# jakeclur.github.io

Year Ten study hubs behind a sign-in. The study pages are stored **encrypted**; only an
account the admin has unlocked a page for can read it.

## Files
- `index.html`: sign-in page and the list of pages an account may open
- `admin.html`: admin tool (needs the admin password; works in your browser only)
- `lock.js`: encryption code used by both
- `vault.enc`: your pages and accounts, encrypted with the admin password
- `access.json`, `p/*.enc`: what visitors download. Unreadable without a login.

## Admin: day to day
1. Open `/admin.html`, enter the admin password.
2. Make accounts, press Settings on an account, press Unlock/Lock for each page. Disable, re-enable or reset a password any time.
3. Press **Build & download ZIP** (or **Publish to GitHub now**). Upload the result. Changes are live after publishing.

Never put the plain `.html` study pages in this repo. Keep them on your device and add them through the admin page.
Lose the admin password and the vault cannot be recovered.
