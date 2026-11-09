# Enable Google and Discord sign-in

The code supports both providers, but buttons appear only after the corresponding Client ID and Client Secret are configured on the VPS. Credentials are not included in Git, frontend builds, reports or the public provider-list endpoint. Existing password login continues to work.

## Google

1. Open [Google Cloud Console](https://console.cloud.google.com/), select/create the Gacha Triad project, and configure **Google Auth Platform** branding/audience. Choose **External** for public players. During testing, add your test Google accounts to the allowed test users.
2. Use `https://gachatriad.com/` as the homepage and `https://gachatriad.com/privacy/` as the privacy URL. Select your own support/contact email in the console.
3. Create an **OAuth client ID → Web application**. Add the authorized redirect URI exactly:

   `https://gachatriad.com/api/auth/callback/google`

4. Copy the Client ID and Client Secret directly into the VPS environment file as described below. Before public sharing, move the consent audience out of testing if you want people beyond your test-user list to sign in. Only basic OpenID/profile/email access is used.

Reference: [Better Auth Google setup](https://better-auth.com/docs/authentication/google).

## Discord

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create/select the Gacha Triad application.
2. Under **OAuth2**, add the exact redirect URI:

   `https://gachatriad.com/api/auth/callback/discord`

3. Copy its Client ID and Client Secret into the VPS environment. Login requests basic identity/email access; it does not request a bot installation or server-management permissions. Phone-only Discord accounts without an email use a stable private provider alias inside the game.

Reference: [Better Auth Discord setup](https://better-auth.com/docs/authentication/discord).

## Put credentials on the server

In your PC's PowerShell, connect:

```powershell
ssh gachatriad
```

In the resulting **deploy@...** server terminal:

```bash
sudo nano /etc/gachatriad/server.env
```

Add the pairs you created (without the example angle brackets):

```dotenv
GOOGLE_CLIENT_ID=<your Google client ID>
GOOGLE_CLIENT_SECRET=<your Google client secret>
DISCORD_CLIENT_ID=<your Discord client ID>
DISCORD_CLIENT_SECRET=<your Discord client secret>
```

Keep `BETTER_AUTH_URL=https://gachatriad.com`. Save with **Ctrl+O**, Enter; exit with **Ctrl+X**. Then:

```bash
sudo chmod 600 /etc/gachatriad/server.env
sudo systemctl restart gachatriad
```

Refresh the site. Google/Discord buttons are shown by the login dialog once configured. Test both new registration and signing back into the same account. Never paste Client Secrets into chat, screenshots, client code or Git.

## Existing accounts and guests

Guest progress follows the normal guest-to-account migration. Existing accounts can connect a provider from **Profile** while already signed in. Implicit linking by matching email is disabled: someone pre-registering another person's email cannot acquire their social login. If social sign-in says that the email already has an account, sign in using the existing method and connect the provider from Profile.

The one-account-per-IP policy applies to new social registrations too. Existing-account sign-ins remain available on an occupied IP. The host panel can grant a shared-network exception for a household. OAuth state, PKCE/callback checks and token verification are handled by Better Auth; provider names and tokens never grant administrator rights.

Provider credentials and a real external consent flow are required to finish end-to-end activation. Local tests can verify authorization redirects, anti-forgery guards and configuration behavior, but do not prove an unconfigured real Google/Discord application is ready.
