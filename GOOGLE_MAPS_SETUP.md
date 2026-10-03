# Google Maps setup for the outing planner

The running app uses Google Places API (New), Routes API, and Maps JavaScript API. Both keys have been saved locally and tested. These steps describe the configuration for another computer or replacement keys.

## 1. Create or select a project and enable billing

Open [Google Cloud Console](https://console.cloud.google.com/). Use the project selector to create a project named **Outing Planner**, or select your existing project. Open **Billing** and link a billing account to that project. Google Maps web-service usage is billable. You control the project and billing account.

## 2. Enable three APIs

Open **APIs & Services → Library**. Search for and enable each of:

- **Places API (New)** — current location autocomplete, place search and place details.
- **Routes API** — driving durations and route lines.
- **Maps JavaScript API** — the map shown in the browser.

The legacy Places API and Directions API are not needed for the planned integration.

## 3. Create a server key

Open **APIs & Services → Credentials → Create credentials → API key**. Edit the new key and name it **Outing Planner Server**.

- Under **API restrictions**, choose **Restrict key** and select **Places API (New)** and **Routes API**.
- Under **Application restrictions**, use **IP addresses** and allow the public outbound IP address of the computer running the local server. This is your network's public IP, not `127.0.0.1` or a `192.168.*` address. If your internet provider changes it, update this restriction. A deployed server should use its own fixed outbound IP.
- Save the restrictions. This key must stay on the server and must not have a `VITE_` prefix.

## 4. Create a browser key

Create a second key and name it **Outing Planner Browser**.

- Under **Application restrictions**, choose **Websites** and add both:
  - `http://127.0.0.1:5174/*`
  - `http://localhost:5174/*`
- Under **API restrictions**, choose **Restrict key** and select only **Maps JavaScript API**.
- Save. Add your exact website domain to the allowed websites when the app is deployed. This key will be visible in the browser, so the restrictions matter.

## 5. Store the keys locally

Create or edit `.env.local` in `/Users/abhinavkolasani/outing-planner-v01/` with:

```dotenv
GOOGLE_MAPS_SERVER_KEY=your_server_key
GOOGLE_MAPS_BROWSER_KEY=your_browser_key
```

Replace the placeholder values. Do not paste the keys into chat, screenshots, or GitHub. `.env.local` is already excluded by this project's `.gitignore`. An OpenAI API key cannot be used in place of either Google key.

## 6. Restart after changing keys

Restart the local server after editing `.env.local`. The app keeps the same URL: `http://127.0.0.1:5174/`. Search is restricted to US places. Google owns place identity; the product preserves the user's fixed/flexible decisions, times and notes. Existing OpenStreetMap selections must be explicitly reselected from Google; they are never silently assigned different IDs.

## Official setup references

- [Places API (New) setup](https://developers.google.com/maps/documentation/places/web-service/get-api-key)
- [Routes API setup](https://developers.google.com/maps/documentation/routes/get-api-key)
- [Maps JavaScript API setup](https://developers.google.com/maps/documentation/javascript/get-api-key)
- [API key security best practices](https://developers.google.com/maps/api-security-best-practices)

