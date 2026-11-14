# ClipForge AI

An automated clipping operation, run like a small media business. This folder holds **Phase 1**:
- campaign discovery records and evaluation
- the earnings ledger
- the weekly profitability report
- a dashboard you can open on your phone

These are built first because they answer whether campaigns actually pay per working hour. The answer
decides whether Phases 2 to 7 are worth building.

Status (2026-11-14): Phase 1 works and has tests. There is no video processing, AI scoring or publishing
code yet. Campaigns are entered by hand or from a CSV. The marketplaces are not scraped.

## Verified constraints that change the roadmap

Checked 2026-11-14 against the platforms' own documentation:

1. **TikTok Content Posting API.** "All content posted by unaudited clients will be restricted to private
   viewing mode" (developers.tiktok.com, Content Posting API get-started guide).
2. **YouTube Data API.** Videos uploaded through `videos.insert` from unverified API projects created after
   28 July 2020 are locked to private until the project passes a compliance audit.
3. **Instagram.** Publishing through the Graph API needs a professional (Business or Creator) account linked
   to a Facebook Page. This is from memory and was not re-checked today.

**Consequence.** Private posts earn no campaign views, so automated publishing (Phase 5) cannot serve the
14-day experiment unless an audit is passed first, and audits take an unpredictable amount of time. The
plan is to **post by hand, or with each platform's own scheduler, during the experiment.** Apply for the
audits in parallel only if the experiment proves the economics.

The marketplace terms are also only partly checked:
- Ssemble's creator page lists a standard test campaign at $1 per 1,000 verified views, with a
  $100 budget and a 14-day cap.
- Vyro's rate of about $3 per 1,000 views comes from third-party reviews, one of them on Ssemble's blog.
- Content Rewards sets its rate per campaign.

Re-check every campaign's terms and rules before posting. The evaluator marks any campaign whose terms were
checked more than 7 days ago.

## Install (Windows)

1. Install Python 3.11 or later from python.org and tick "Add to PATH".
2. Install FFmpeg (`winget install Gyan.FFmpeg`). Phase 1 does not use it yet.
3. Get the code:
   ```
   git clone <this repo>
   cd sturdy-system\clipforge
   python -m clipforge init
   ```

Nothing else needs installing because Phase 1 uses only the Python standard library. The database is
created at `%USERPROFILE%\clipforge\clipforge.db`. To use another path, set `CLIPFORGE_DB` or pass `--db`.

## Daily use

```
python -m clipforge campaign import my_campaigns.csv      # columns as in examples/campaigns.csv
python -m clipforge evaluate --minutes-per-clip 20 --platforms tiktok,youtube
python -m clipforge campaign status 2 active

python -m clipforge clip  --campaign 2 --title "Guest on why X fails" --source-url https://...
python -m clipforge post  --clip 1 --platform tiktok --account @mine --url https://tiktok.com/... --submitted
python -m clipforge views --post 1 --views 5400 --approved 5100   # cumulative; record every few days
python -m clipforge log   --minutes 45 --activity clipping --campaign 2
python -m clipforge log   --minutes 90 --activity building        # system-building time is tracked separately
python -m clipforge payout --amount 12.50 --campaign 2            # only money actually received
python -m clipforge expense --amount 5 --description "OpenAI API"

python -m clipforge report --out reports\week.md                  # weekly profitability, Monday to Sunday
python -m clipforge serve --host 0.0.0.0                          # dashboard on http://<laptop-ip>:8765
```

The dashboard has no login. Use `--host 0.0.0.0` only on your home Wi-Fi. To reach it from outside the
house, install Tailscale on the laptop and the phone instead of opening a router port.

To get the weekly report on a schedule, set up a Windows Task Scheduler job for Sunday evening that runs
`python -m clipforge report --out %USERPROFILE%\clipforge\reports\latest.md`.

## How the evaluator decides

**Hard gates.** A campaign is BLOCKED or ENDED if any of these hold:
- source permission is not `explicit`
- none of its allowed platforms is one you post on
- its budget is exhausted
- it has ended

**Ranking.** The remaining campaigns are ranked by expected pay per hour:

    expected per post = sum over the view distribution of P(views) x payout(views)
    payout(views)     = 0 if views < campaign minimum, else min(views x CPM / 1000, per-post cap)
    per hour          = expected per post x posts per clip x 60 / minutes per clip

**The view distribution is the weak link.** Until 10 of your posts have view counts, the evaluator uses a
placeholder guess for a new account: 50% of posts get 300 views, 30% get 1,500, 15% get 8,000 and 5% get
50,000. That guess is not data. Its 5% tail supplies 58% of the expected views, so a $/hour figure computed
from it mostly reflects one guess about viral hits. After 10 posts the evaluator switches to your own
numbers automatically, and only from then on are its rankings worth trusting.

The weekly report keeps two kinds of earnings apart:
- **Verified:** payouts actually received. Only this counts toward the $50 target.
- **Estimated:** views multiplied by CPM, with thresholds applied to cumulative views.

## Roadmap from here

| Phase | Next concrete step | Gate before starting |
|---|---|---|
| 2 | Download with yt-dlp only from sources the campaign authorises; transcribe with faster-whisper (CPU) | One campaign recorded with `source_permission=explicit` |
| 3 | Find candidate moments with an LLM over the transcript, then score each on the 6-point quality rubric | Phase 2 clips exist |
| 4 | Cut vertical 9:16 clips with burned-in subtitles using FFmpeg | — |
| 5 | Publishing: post by hand during the experiment; file the API audits only if the economics hold | Experiment result |
| 6 | Pull view counts automatically; the ledger and report already exist | — |
| 7 | Feed back which hooks and campaigns pay into Phase 3 scoring | 30+ posts of own data |

**Experiment success test.** After 14 days, compare verified $/operating hour with what your time is worth.
Building time is reported separately, so the decision does not depend on how long it took to build.
