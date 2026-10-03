export function PolicyPage({ privacy }: { privacy: boolean }) {
  return <section className="panel policy-page"><a href="/">Back to your outing</a><h1>{privacy ? 'Privacy' : 'Terms of use'}</h1><p>Updated October 2, 2026.</p>
    {privacy ? <>
      <h2>Your outing information</h2><p>Search text, selected places and outing preferences are sent to our server to build your plan. Your tab keeps a temporary draft. Our database keeps place IDs, your entered times, budget, group size, interests, notes and planning measurements so we can understand and improve the planner. Please leave sensitive personal information out of notes.</p>
      <h2>Maps and hosting</h2><p>Google Maps receives location searches, selected place IDs and route endpoints to provide places and travel estimates. Google's <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Privacy Policy</a> applies to its services and is incorporated into this policy. The site is hosted by OpenAI Sites on Cloudflare infrastructure; those services may process network and operational information to serve the app.</p>
      <h2>Storage</h2><p>We store Google place IDs separately and refresh place content rather than keeping a permanent copy of business information. Short-lived request counters use a daily hash of a network address to limit excessive requests. We do not add advertising, accounts or payment processing.</p>
      <h2>Questions</h2><p>This is a founder prototype. For questions about stored outing information, contact the founder who shared this app with you.</p>
    </> : <>
      <h2>Planning help</h2><p>Outing planner is an early prototype for planning real-world outings. Costs, visit lengths and arrival times are estimates. Check opening hours, prices, access and reservation availability before going. The app does not make reservations or purchases.</p>
      <h2>Maps services</h2><p>The app uses Google Maps Platform. Your use of its content is subject to the <a href="https://maps.google.com/help/terms_maps.html" target="_blank" rel="noreferrer">Google Maps and Google Earth Additional Terms of Service</a>, which are incorporated into these terms, and Google's <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</p>
      <h2>Using the prototype</h2><p>Use the app for personal outing planning. Do not abuse the service or scrape its place results. Availability and information can change, and the prototype may occasionally be unavailable. Choose safe, lawful activities and follow local venue requirements.</p>
    </>}
  </section>;
}
