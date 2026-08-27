Issue #85 — packet log attachments
=====================================

Files in this folder (repo root):

1. ISSUE85_LOG_BEFORE_FIX.txt
   Stock upstream/opo-revised Flatpak. Realme Buds Air 7 (0x064812).
   ANC quick menu works; configure-window prefs do not reach the buds.

2. ISSUE85_LOG_AFTER_FIX.txt
   Same hardware, rebuilt with local fixes on opo-revised (06:02 UTC session).
   EQ, feature toggles, find buds, and single-slot gestures all send and ACK.

Suggested GitHub comment (edit as you like):
-------------------------------------------

Tested `upstream/opo-revised` on Realme Buds Air 7 (PID 0x064812, FW 1.1.0.62).

**Before (stock opo-revised):** attached `ISSUE85_LOG_BEFORE_FIX.txt`
- Connect OK, PID OK, battery/ANC/EQ/gesture reads OK
- Changing EQ / toggles / gestures in configure window did not emit SET packets
- Only quick-menu ANC worked (direct socket path)

**After (local fixes on opo-revised, rebuilt Flatpak):** attached `ISSUE85_LOG_AFTER_FIX.txt`
- Same connect sequence
- Configure window now sends Set EQ, feature switches, find buds, single-slot gestures
- All observed SETs ACK with status 00

Local branch: opo-revised (6 commits ahead of upstream when captured).
Happy to push to fork or cherry-pick if useful.

Wireless 5 ANC (0x051412) not re-tested yet on this tree.
