# jakeclur.github.io

Year 10 and Year 11 study hubs behind a sign-in. The study pages are stored **encrypted**; only an
account the admin has unlocked a page for can read it.

## Files
- `index.html`: sign-in page; after signing in you choose Year 10 or Year 11, then a subject
- `admin.html`: owner admin tool (admin password only; works in your browser)
- `accountadmin.html`: account admin tool (username + password of an account the owner made an account admin)
- `lock.js`: encryption code used by all three; `ghpub.js`: publish to GitHub
- `vault.enc`: your page files and the owner key, encrypted with the admin password
- `accounts.enc`: the account list and page keys (owner and account admins can open it)
- `access.json`, `p/*.enc`: what visitors download. Unreadable without a login.

## Owner (admin.html)
1. Open `/admin.html`, enter the admin password.
2. Make accounts. Account type: **Normal user** or **Account admin** (tick "can create accounts" and/or "can manage accounts").
3. Settings on an account: Lock/Unlock pages (grouped Year 10 / Year 11), reset password, disable, delete, change account admin rights.
4. Pages: add files (choose the year first), set Year, link exams to their subject.
5. **Publish to GitHub now** (or Build & download ZIP).

## Account admins (accountadmin.html)
- Sign in with their own username and password.
- Can create normal accounts and/or manage normal accounts, but only give out pages they can open themselves.
- Cannot see, add or change page files, cannot change other account admins, and cannot make account admins.
- Publish with a GitHub token. Publishing re-keys every page so locked-out people lose access straight away.

If two people publish one after the other without reloading, the second publish stops ("the site was changed after you opened this page"). Reload and redo the change; nothing is lost.

Never put the plain `.html` study pages in this repo. Keep them on your device and add them through the admin page.
Lose the admin password and the vault cannot be recovered.

## Podcasts (public)
`listen.html` and `audio/*.mp3` are plain files, not encrypted, so anyone with the site link can listen without signing in. The Listen button on the sign-in page and hub opens `listen.html`. To change episodes or chapter times, edit the `EPISODES` list in `listen.html`.
