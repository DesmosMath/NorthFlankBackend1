const express = require('express');
const app = express();

// --- Constants from your Vercel file ---
const RECAPTCHA_WORKER = "https://recaptcha.uraverageopdoge.workers.dev";
const PORT = process.env.PORT || 8080; // Northflank provides a PORT env variable

// --- Main proxy route (replaces Vercel's default export) ---
app.get('/proxy', async (req, res) => {
  const target = req.query.url;

  if (!target) {
    return res.status(400).send("Use /proxy?url=https://example.com");
  }

  // This is the new, dynamic way to get the proxy's own URL
  // Replaces: const SELF_BASE = "https://vercelbackend1.vercel.app";
  // We use req.protocol (http/https) and req.get('host') (your-app.northflank.app)
  const SELF_BASE = `${req.protocol}://${req.get('host')}`;

  try {
    const headers = new Headers();
    headers.set("User-Agent", randomUserAgent());
    headers.set("Accept-Language", randomAcceptLang());
    headers.set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
    headers.set("Referer", new URL(target).origin + "/");
    headers.set("Sec-Fetch-Site", "none");
    headers.set("Sec-Fetch-Mode", "navigate");
    headers.set("Sec-Fetch-User", "?1");
    headers.set("Sec-Fetch-Dest", "document");
    headers.set("Upgrade-Insecure-Requests", "1");

    // We use the built-in 'fetch' from Node.js 18+
    const upstream = await fetch(target, { method: "GET", headers, redirect: "follow" });
    const contentType = upstream.headers.get("content-type") || "";

    if (upstream.status === 429 || upstream.status === 403) {
      const redirectUrl = `${RECAPTCHA_WORKER}/?url=${encodeURIComponent(target)}`;
      // Vercel: return Response.redirect(redirectUrl, 302);
      // Express:
      return res.redirect(302, redirectUrl);
    }

    const bodyText = contentType.includes("text") ? await upstream.text() : null;

    // CAPTCHA Detection (identical logic)
    if (
      bodyText &&
      (bodyText.includes("recaptcha/api.js") ||
        bodyText.includes("Our systems have detected unusual traffic") ||
        bodyText.includes("detected unusual traffic from your computer network") ||
        bodyText.includes("To continue, please type the characters you see"))
    ) {
      const redirectUrl = `${RECAPTCHA_WORKER}/?url=${encodeURIComponent(target)}`;
      // Express:
      return res.redirect(302, redirectUrl);
    }

    const outHeaders = new Headers(upstream.headers);
    stripSecurityHeaders(outHeaders);
    outHeaders.set("Access-Control-Allow-Origin", "*");
    outHeaders.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    outHeaders.set("Access-Control-Allow-Headers", "*");
    outHeaders.set("X-Proxied-By", "Roogle Northflank Proxy");
    
    // Convert Headers object to a plain object for res.set()
    const headersObject = Object.fromEntries(outHeaders.entries());
    res.status(upstream.status).set(headersObject);

    // HTML rewriting section (identical logic, just using dynamic SELF_BASE)
    if (contentType.includes("text/html") && bodyText !== null) {
      const base = `<base href="${new URL(target).origin}/">`;
      let rewritten = bodyText.replace(/<head([^>]*)>/i, (m) => `${m}${base}`);

      rewritten = rewritten
        .replace(/https?:\/\/([a-zA-Z0-9.-]+)/g, (match) => {
          return `${SELF_BASE}/proxy?url=${encodeURIComponent(match)}`;
        })
        .replace(/href="\/([^"]*)"/g, (match, path) => {
          const full = new URL(path, target).href;
          return `href="${SELF_BASE}/proxy?url=${encodeURIComponent(full)}"`;
        })
        .replace(/action="\/([^"]*)"/g, (match, path) => {
          const full = new URL(path, target).href;
          return `action="${SELF_BASE}/proxy?url=${encodeURIComponent(full)}"`;
        });

      rewritten = rewritten.replace(/src="https?:\/\/([^"]+)"/g, (m, url) => {
        return `src="${SELF_BASE}/proxy?url=https://${url}"`;
      });

      // Vercel: return new Response(rewritten, { status: 200, headers: outHeaders });
      // Express:
      return res.send(rewritten);
    }

    // Pass through for binary/non-text
    // Vercel: return new Response(upstream.body, ...);
    // Express: We pipe the upstream body (a stream) directly to the response
    if (bodyText === null) {
      // @ts-ignore
      return upstream.body.pipe(res);
    } else {
      // Fallback for text-based content that wasn't HTML
      return res.send(bodyText);
    }
    
  } catch (err) {
    // Vercel: return new Response("Proxy failed: " + err.message, ...);
    // Express:
    return res
      .status(502)
      .type('text/plain')
      .send("Proxy failed: " + (err instanceof Error ? err.message : String(err)));
  }
});

// --- Root path handler (from your Vercel logic) ---
app.get('/', (req, res) => {
  res.status(400).send("Use /proxy?url=https://example.com");
});

// --- Start the server ---
app.listen(PORT, () => {
  console.log(`Proxy server listening on port ${PORT}`);
});


/* -------------------- HELPERS (Copied directly, no changes) -------------------- */
function stripSecurityHeaders(headers) {
  [
    "content-security-policy",
    "content-security-policy-report-only",
    "x-frame-options",
    "frame-options",
    "cross-origin-embedder-policy",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
  ].forEach((h) => headers.delete(h));
}

function randomAcceptLang() {
  const langs = ["en-US,en;q=0.9", "en-GB,en;q=0.8", "en;q=0.7", "en-US,en-CA;q=0.8"];
  return langs[Math.floor(Math.random() * langs.length)];
}

function randomUserAgent() {
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:118.0) Gecko/20100101 Firefox/118.0",
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}
