# iOS release setup: runbook for a browser agent

**Audience:** an AI agent driving a real browser with Playwright, with the repository owner present.
**Goal:** after this runbook, one click in GitHub Actions builds the iOS app on EAS and uploads it to TestFlight, and in-app purchases work in that build.

This is one-time setup. For the manual command-line path, see `docs/DEPLOY-AND-SUBMIT.md`.

## Azure-hosted build alternative

Azure DevOps Microsoft-hosted macOS agents include Xcode, so iOS builds can run on ephemeral Macs without creating an Azure App Service. The free hosted-agent allocation is up to one parallel job and 1,800 minutes per month when available to the organization; confirm the macOS quota and usage in the specific DevOps organization before relying on it.

Replacing EAS is not configured in this repository yet. It requires an Azure DevOps organization/project and pipeline, Apple distribution certificate and provisioning profile stored as secure files, an App Store Connect API key in secure storage, and a successful signed TestFlight upload. Do not cancel EAS until the Azure pipeline has produced and uploaded a verified build.

## Rules for the agent

1. **Never type, paste, print, log or screenshot a secret.** That covers passwords, 2FA codes, the Expo access token, the `.p8` key file and the RevenueCat secret key (`sk_...`). When a secret has to move from one page to another, copy it through the clipboard and do not echo it in your output.
2. **The human signs in.** At every login page, 2FA prompt or "accept agreement" screen: stop, tell the human what is needed, and wait. Do not try to get around a login.
3. **Use a headed, persistent browser profile** so sign-ins survive between steps. Do not run headless.
4. **Do only what a step says.** Do not delete keys, products, builds or users. Do not change pricing. Do not press "Submit for Review".
5. **Dashboards change.** If a page does not match the description here, look for the same thing by name. If you still cannot find it, stop and report what you see. Do not guess.
6. **Check each step's "Done when" line before moving on.** At the end, fill in the report at the bottom of this file's last section.

## Fixed values

| Item | Value |
|---|---|
| GitHub repository | `gouthamchidhara/preppilot` |
| Expo account / project | `gchid` / `preppilot` |
| Bundle ID | `com.gchid.preppilot` |
| App Store Connect app ID | `6835532732` |
| Apple Team ID | `KSD8FCH7C9` |
| Subscription product ID | `pro_monthly` |
| RevenueCat entitlement | `pro` |
| Workflow file | `.github/workflows/ios-release.yml` |

## Step 0: check the starting point

1. Open `https://github.com/gouthamchidhara/preppilot/blob/main/.github/workflows/ios-release.yml`.
2. If it is a 404, the workflow is not on `main` yet. GitHub only shows a manually triggered workflow once it is on the default branch. **Stop and ask the human** to merge the branch `claude/eloquent-pasteur-wdc9yd` into `main`. Tell them that merging also deploys the redesigned web app to the live site, because every push to `main` deploys.

**Done when:** the workflow file opens on `main`.

## Step 1: App Store Connect API key

This lets EAS upload builds without anyone's Apple password.

1. Go to `https://appstoreconnect.apple.com/access/integrations/api`. The human signs in.
2. Open the **Team Keys** tab. If the page asks to request access to the API, stop: only the Account Holder can do that, and the human must do it.
3. Click **Generate API Key** (or the **+** button). Name: `EAS Submit`. Access: **App Manager**. Generate.
4. Record the **Issuer ID** (top of the page) and the new key's **Key ID**. These two are identifiers, not secrets, and may appear in your report.
5. Click **Download** for the key. Apple allows this **once**. Confirm the file `AuthKey_<KeyID>.p8` exists in the downloads folder. Do not open it or print its contents.

**Done when:** the key is listed as Active, and you have Issuer ID, Key ID and the `.p8` file on disk.

## Step 2: give the key to Expo

1. Go to `https://expo.dev/accounts/gchid/settings/credentials`. The human signs in to Expo.
2. Find the **App Store Connect API Keys** section and add a key: upload the `.p8` file, enter the Key ID and Issuer ID from step 1, and save.
3. Go to `https://expo.dev/accounts/gchid/projects/preppilot/credentials`, open the iOS bundle `com.gchid.preppilot`, and in the **App Store Connect API Key** / "Submissions" area select the key you just added.
4. On the same page, confirm a **Distribution Certificate** and a **Provisioning Profile** are present and not expired. Do not create new ones.

If the dashboard has no way to upload the key, do not improvise. Report it, and ask the human to run this once in a terminal and choose "App Store Connect: Manage your API Key":

```bash
cd mobile && npx eas-cli credentials --platform ios
```

**Done when:** the project's iOS credentials page shows an App Store Connect API key for submissions, plus a valid certificate and profile.

## Step 3: Expo access token into GitHub

1. Go to `https://expo.dev/accounts/gchid/settings/access-tokens`.
2. Create a token named `github-actions-preppilot`. Copy the value to the clipboard. It is shown once.
3. Go to `https://github.com/gouthamchidhara/preppilot/settings/secrets/actions`. The human signs in to GitHub.
4. **New repository secret.** Name: `EXPO_TOKEN`. Paste the value. Add secret.

**Done when:** `EXPO_TOKEN` is listed under Repository secrets.

## Step 4: RevenueCat, so purchases work

Without this the "Start Pro" button in the app fails, and App Review rejects the build.

1. Go to `https://app.revenuecat.com`. The human signs in. Open the PrepPilot project.
2. **Check the setup.** Report anything missing; do not create it yourself unless the human says so.
   - An App Store app with bundle ID `com.gchid.preppilot`.
   - A product `pro_monthly`.
   - An entitlement `pro` with `pro_monthly` attached.
   - An offering marked **Current** that contains a package for `pro_monthly`, ideally the Monthly package type.
   - Under Integrations → Webhooks: a webhook pointing at `<live web app URL>/api/billing/revenuecat` with an Authorization header set.
3. Open **API keys**. Copy the **public** iOS SDK key. It starts with `appl_`. Do not copy any key that starts with `sk_`.
4. Put that public key into `mobile/app.settings.json` as the value of `revenueCatIosKey`, on `main`. It is a public identifier and is safe to commit. Easiest route: open `https://github.com/gouthamchidhara/preppilot/edit/main/mobile/app.settings.json`, change only that one value, and commit with the message `Set RevenueCat iOS public key`. Keep the rest of the file exactly as it is.

**Done when:** `revenueCatIosKey` on `main` holds a value starting with `appl_`, and the checklist in item 2 is reported.

## Step 5: App Store Connect readiness

Check only. Report what is missing.

1. `https://appstoreconnect.apple.com/agreements/`: the **Paid Apps** agreement is Active. If not, stop: only the human can sign it, and subscriptions cannot be sold without it.
2. `https://appstoreconnect.apple.com/apps/6835532732/distribution/subscriptions`: `pro_monthly` exists at $10.99/month, and its status is "Ready to Submit" or better. "Missing Metadata" means the human still has to finish it.
3. Report whether a product called `mock_session_60min` still exists. The app no longer uses it. Do not delete it; tell the human.

**Done when:** all three are reported.

## Step 6: run the release

1. Go to `https://github.com/gouthamchidhara/preppilot/actions/workflows/ios-release.yml`.
2. **Run workflow**, branch `main`, "Upload the finished build to TestFlight" ticked. Run.
3. Open the run and wait for it to go green. It takes a few minutes: it only starts the build and does not wait for it.
4. Go to `https://expo.dev/accounts/gchid/projects/preppilot/builds`. The newest iOS build should be in progress. A build takes 15 to 30 minutes. Reload every few minutes; do not start a second build.
5. When the build is Finished, open `https://expo.dev/accounts/gchid/projects/preppilot/submissions` and confirm the submission succeeded.
6. Go to `https://appstoreconnect.apple.com/apps/6835532732/testflight/ios`. The build appears after Apple finishes processing, usually 5 to 30 minutes.

If the workflow, the build or the submission fails: copy the error text into your report and stop. Do not retry more than once.

**Done when:** the new build number is listed in TestFlight, or the failure is reported with its error text.

## Step 7: stop here

Do not press **Submit for Review**. That is the owner's decision, after testing the TestFlight build: sign-in, Start Pro in the sandbox, restore purchases, and a voice session.

## Report to hand back

- Step 0 to 6: done / blocked, with one line each.
- Issuer ID and Key ID of the new App Store Connect key.
- RevenueCat checklist results.
- App Store Connect readiness results, including whether `mock_session_60min` still exists.
- Build number and links to the GitHub run, the EAS build and the EAS submission.
- Anything that needed the human, and anything on a page that did not match this runbook.
