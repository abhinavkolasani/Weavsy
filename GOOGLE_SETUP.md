# Google Cloud setup — archived alternative

**Archived option:** the user subsequently approved a Google-free OpenStreetMap foundation. These steps are not required to run the current app. See [WORLD_DATA_HANDOFF.md](WORLD_DATA_HANDOFF.md). No Google integration or Google Place IDs are claimed.

The guest app is running at http://127.0.0.1:5174/. Stage A passed. There is no Google credential configured in this project or its current server environment. This guide is a setup handoff, not a claim that Google integration is implemented.

## Abhinav's steps

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select or create the project you intend to use for this app. Use a dedicated prototype project if you do not already have one.
2. Link an active billing account under **Billing**. Places API requires billing, even when usage falls within an applicable free allowance. Review [current billing documentation](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing), and choose quotas and budget alerts appropriate for your prototype.
3. Under **APIs & Services → Library**, search for and enable **Places API (New)**. This supports Autocomplete (New), Place Details (New), Text Search (New) and Nearby Search (New). Do not enable the legacy Places API for this implementation. Routes API can wait until route estimates are implemented. Maps JavaScript API is unnecessary for the proposed server-only REST approach.
4. Under **APIs & Services → Credentials**, create a dedicated API key for this app (or use the new key you already generated, if it belongs to this Google project and is dedicated to this app). An OpenAI key cannot authenticate Google Places.
5. Edit the key: **API restrictions → Restrict key → Places API (New)**. Under **Application restrictions**, select **IP addresses** and allow the public outbound IP of the machine running the Node server. Google sees the public network IP, not `127.0.0.1`. Obtain it from your network/router information or your network administrator. If it changes, update the restriction. For deployment, use the server's fixed outbound IP or a supported server authentication alternative; do not use website-referrer restrictions for server REST calls.
6. Save the key locally in `/Users/abhinavkolasani/outing-planner-v01/.env.local` as:

   ```dotenv
   GOOGLE_PLACES_API_KEY=your_actual_google_key
   ```

   This file is already excluded from Git. Do not put the key in a `VITE_` variable, frontend code, screenshots, a commit, or a chat message. `.env.example` documents the variable without a credential.
7. Tell Codex that the Google setup is complete and the key is in `.env.local`. The next implementation step will add server environment loading and the provider layer, then verify a live request. **The current app does not consume this variable yet.** Saving the key alone will not add autocomplete.

## Architecture decision for the next stage

Use the existing Node server as the sole caller of Places API (New), using built-in `fetch` and deliberate field masks. The browser calls our local endpoints. This avoids exposing the server credential and does not require another SDK dependency or a browser key. One provider interface will normalize responses before the form, founder tools or future planner see them.

If a later Google Maps JavaScript map or widget is added, create a separate browser key restricted to the required browser APIs and exact website origins, including the development origin. Never reuse the server key for browser calls.

Keep Google content separate from user intent and durable IDs. Google Place IDs may be stored; other Google content must follow the applicable refresh/storage terms. A live implementation must show Google Maps attribution and any returned third-party attribution, and provide the required Terms of Use and Privacy Policy before public use. None of that live Google behavior has been implemented yet.

## Official references

- [Places API (New) setup](https://developers.google.com/maps/documentation/places/web-service/get-api-key)
- [API key security and restrictions](https://developers.google.com/maps/api-security-best-practices)
- [Places API usage and billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
- [Places API policies and attribution](https://developers.google.com/maps/documentation/places/web-service/policies)

No billing settings, credentials, permissions or Cloud project changes were made by Codex.
