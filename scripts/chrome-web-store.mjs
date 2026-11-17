import { readFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const API = 'https://chromewebstore.googleapis.com';
const versions = (revision) => revision?.distributionChannels?.map((channel) => channel.crxVersion) ?? [];

/** Dependency injection keeps release failure paths testable without store credentials. */
export async function submitToStore({ publisherId, extensionId, version, zip, clientId, clientSecret, refreshToken }, {
  fetch: request = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = console.log,
} = {}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(publisherId ?? '')) throw new Error('Set CWS_PUBLISHER_ID to the store publisher ID.');
  if (!/^[a-p]{32}$/.test(extensionId ?? '')) throw new Error('Set CWS_EXTENSION_ID to the store item ID, not an unpacked local ID.');
  if (![clientId, clientSecret, refreshToken].every((value) => typeof value === 'string' && value.trim())) {
    throw new Error('Configure CWS_CLIENT_ID, CWS_CLIENT_SECRET and CWS_REFRESH_TOKEN in GitHub Actions secrets.');
  }
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '') || !zip?.length) throw new Error('A versioned ZIP is required.');
  const name = `publishers/${publisherId}/items/${extensionId}`;
  // Do not print response bodies: OAuth errors can contain credential information.
  async function json(url, options, label) {
    const response = await request(url, { ...options, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`${label} failed (HTTP ${response.status}). Check credentials or the Chrome Web Store dashboard; no automatic retry was made.`);
    return response.json();
  }
  const auth = await json('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  }, 'OAuth token refresh');
  if (typeof auth.access_token !== 'string' || !auth.access_token) throw new Error('OAuth did not return an access token.');
  const headers = { Authorization: `Bearer ${auth.access_token}` };
  const statusUrl = `${API}/v2/${name}:fetchStatus`;
  const status = await json(statusUrl, { headers }, 'Store status');
  if (status.takenDown) throw new Error('The item is taken down. Resolve this in the developer dashboard first.');
  const pending = status.submittedItemRevisionStatus;
  if (pending && ['PENDING_REVIEW', 'STAGED'].includes(pending.state)) {
    if (pending.state === 'PENDING_REVIEW' && versions(pending).includes(version)) {
      log(`${version} is already pending review. Check automatic publication mode in the dashboard if it was submitted manually.`);
      return { state: pending.state, skipped: true };
    }
    throw new Error('A revision is already under review or staged. Resolve it in the dashboard before uploading another package.');
  }
  if (versions(status.publishedItemRevisionStatus).includes(version)) {
    log(`${version} is already published.`);
    return { state: status.publishedItemRevisionStatus.state, skipped: true };
  }
  const uploaded = await json(`${API}/upload/v2/${name}:upload`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: zip,
  }, 'Package upload');
  if (uploaded.crxVersion && uploaded.crxVersion !== version) throw new Error('Uploaded version does not match the release. Publication stopped.');
  let uploadState = uploaded.uploadState;
  for (let attempt = 0; ['IN_PROGRESS', 'UPLOAD_IN_PROGRESS'].includes(uploadState) && attempt < 30; attempt++) {
    await sleep(10_000);
    const progress = await json(statusUrl, { headers }, 'Upload status');
    uploadState = progress.lastAsyncUploadState;
  }
  if (uploadState !== 'SUCCEEDED') throw new Error(`Upload did not succeed (${uploadState ?? 'missing state'}). Nothing was submitted for review.`);
  const published = await json(`${API}/v2/${name}:publish`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH', skipReview: false }),
  }, 'Review submission');
  if (!['PENDING_REVIEW', 'PUBLISHED', 'PUBLISHED_TO_TESTERS'].includes(published.state)) {
    throw new Error(`Unexpected submission state: ${published.state ?? 'missing state'}. Check the developer dashboard.`);
  }
  log(`${version}: ${published.state}. Submitted with automatic publication after approval, using existing store visibility and rollout settings.`);
  if (published.warningInfo?.warnings?.length) log('Chrome returned non-blocking warnings. Check the developer dashboard.');
  return { state: published.state, skipped: false };
}

async function main() {
  const version = process.env.CWS_VERSION;
  const zip = await readFile(process.argv[2]);
  const result = await submitToStore({
    version, zip,
    publisherId: process.env.CWS_PUBLISHER_ID,
    extensionId: process.env.CWS_EXTENSION_ID,
    clientId: process.env.CWS_CLIENT_ID,
    clientSecret: process.env.CWS_CLIENT_SECRET,
    refreshToken: process.env.CWS_REFRESH_TOKEN,
  });
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `Chrome Web Store ${version}: **${result.state}**. ${result.skipped ? 'Existing submission/publication detected; no change made.' : 'Automatic publication after approval requested.'}\n\nCI completion is not review approval. Store visibility and rollout settings are unchanged.\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
