# IPO Tracker

Installable PWA for tracking Indian IPO applications. Live: https://arpitonai.github.io/ipo-tracker/

Personal data (accounts, PANs, applications) stays on the phone. The repo holds only app code,
public NSE IPO data (`data/ipos.json`, updated by GitHub Actions) and encrypted allotment results.

## Private allotment results (encrypted)

1. In the app: **Backup tab → Private results setup → Set up private results**, then **Copy public key**
   and send it to the assistant (it can only lock results, not unlock them). It is saved as
   `data/results_pubkey.txt`.
2. Results are written to a temp file outside the repo, e.g. `/tmp/new_results.json`:
   `[{"account":"Name as in app","ipo":"HD Fire Protect","symbol":"HDFIRE","status":"allotted","shares":55}]`
   (no PAN field; the script rejects PAN-like values and extra fields).
3. Publish: `python3 scripts/encrypt_results.py /tmp/new_results.json && rm /tmp/new_results.json`, then commit
   and push `data/results.enc.json` only. The script merges into `~/.ipo-results/results.json` (chmod 600, outside the repo)
   and re-encrypts the full set (random AES-256-GCM key wrapped with RSA-OAEP-2048/SHA-256).
4. The app fetches `data/results.enc.json` on open, decrypts on the phone, and fills in allotment for matching
   applications (account name + IPO name/symbol) unless they were marked by hand. Unmatched results appear in the Backup tab.

The private key is in the phone's IndexedDB and in JSON backups. Keep backups private; losing both means the
old results can't be read (just set up a new key and re-publish).

## Cloud sync (Firebase)

- Google sign-in (popup, redirect fallback) in the **Backup** tab; ☁️ in the header when signed in.
- Data: `users/{uid}` (vault: PBKDF2 salt + verifier), `users/{uid}/accounts|ipos|applications/{id}`,
  `users/{uid}/settings/keys` (RSA results key, encrypted) and `settings/results` (results, encrypted).
- PAN, full PAN and demat/DP ID are AES-GCM encrypted on the phone with a key derived from the sync passcode
  (PBKDF2-SHA256, 310,000 iterations). Without the passcode they show 🔒 and are never uploaded in plaintext.
- Rules: `firestore.rules` (owner-only). Deploy: `scripts/deploy_rules.sh` (or paste into the console).
