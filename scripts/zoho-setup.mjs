/**
 * Turns a Zoho grant code into the two values the help desk board needs.
 *
 * Zoho's OAuth is a two-step dance and the second step is easy to get
 * wrong by hand, so this does it: it reads the client id and secret from
 * .env.local, trades the short-lived code for a refresh token, then asks
 * Zoho which organisation the token can see. It prints the lines to paste
 * back into .env.local and nothing else.
 *
 * The client secret is never put on a command line, where it would sit in
 * shell history; only the code is, and that expires in minutes.
 *
 *   node scripts/zoho-setup.mjs <grant code>
 */

// @next/env is CommonJS, so it arrives as a default export here.
import env from "@next/env";

const { loadEnvConfig } = env;

loadEnvConfig(process.cwd(), true);

const code = process.argv[2]?.trim();
const clientId = process.env.ZOHO_CLIENT_ID?.trim();
const clientSecret = process.env.ZOHO_CLIENT_SECRET?.trim();
const region = process.env.ZOHO_REGION?.trim() || "com";

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (!code) {
  die(
    [
      "Usage: node scripts/zoho-setup.mjs <grant code>",
      "",
      "First, in Zoho's API console (api-console.zoho." + region + "):",
      "  1. Create a Self Client, and put its Client ID and Client Secret",
      "     in .env.local as ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET.",
      "  2. On the Generate Code tab, ask for the scope",
      "       Desk.tickets.READ,Desk.basic.READ",
      "     with any duration and description, and copy the code.",
      "  3. Run this with that code, within its few minutes.",
    ].join("\n"),
  );
}

if (!clientId || !clientSecret) {
  die("ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET must be in .env.local first.");
}

const tokenUrl = `https://accounts.zoho.${region}/oauth/v2/token`;
const body = new URLSearchParams({
  grant_type: "authorization_code",
  client_id: clientId,
  client_secret: clientSecret,
  code,
});

const response = await fetch(tokenUrl, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body,
});
const answer = await response.json().catch(() => ({}));

if (!answer.refresh_token) {
  // Zoho reports a spent or mistyped code as 200 with an error field.
  die(
    [
      `Zoho did not give a refresh token: ${answer.error ?? response.status}`,
      "",
      "invalid_code usually means the code has expired or was already used —",
      "generate a fresh one. invalid_client means the id, the secret or the",
      "region (ZOHO_REGION) does not match the console you made it in.",
    ].join("\n"),
  );
}

// The organisation id every Desk request carries.
let orgId = "";
try {
  const orgs = await fetch(`https://desk.zoho.${region}/api/v1/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${answer.access_token}` },
  });
  const list = await orgs.json();
  orgId = list?.data?.[0]?.id ?? "";
  if (list?.data?.length > 1) {
    console.log("\nThis token can see more than one organisation:");
    for (const org of list.data) console.log(`  ${org.id}  ${org.companyName ?? ""}`);
  }
} catch {
  // Not fatal: the refresh token is the hard part, and the org id can be
  // read off any Desk URL.
}

console.log("\nPaste these into .env.local:\n");
console.log(`ZOHO_REFRESH_TOKEN=${answer.refresh_token}`);
console.log(`ZOHO_ORG_ID=${orgId || "«from your Desk URL»"}`);
console.log(`ZOHO_REGION=${region}`);
console.log("\nThen restart the server. The refresh token does not expire.\n");
