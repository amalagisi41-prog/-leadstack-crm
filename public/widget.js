/* LeadStack Web Chat widget loader.
 *
 * Snippet:
 *   <script src="https://leadstack.dev/widget.js" data-sa="sa_xxx" async></script>
 *
 * What this script does, in order:
 *   1. Read data-sa from its own <script> tag.
 *   2. Derive the LeadStack origin from its own src so the same file
 *      works on every deployment without hard-coding URLs.
 *   3. GET /api/web-chat/config?sa=... — bail silently if disabled or
 *      the host page's Origin isn't on the allowlist.
 *   4. Inject a floating bubble button (no framework, no CSS deps).
 *   5. On click, lazy-create an <iframe> pointing at
 *      /embed/chat/<sa> — only loaded once the visitor opens the chat.
 *   6. postMessage protocol with the iframe: handle "close" to
 *      collapse back to the bubble.
 *
 * Vanilla ES2015+. ~4KB minified. No deps.
 */
(function () {
  "use strict";

  if (window.__leadstackWebChatLoaded) return;
  window.__leadstackWebChatLoaded = true;

  // ---- Step 1+2: find our own script tag + parse config -----------
  var scriptTag =
    document.currentScript ||
    (function () {
      var all = document.getElementsByTagName("script");
      for (var i = all.length - 1; i >= 0; i--) {
        if ((all[i].src || "").indexOf("/widget.js") !== -1) return all[i];
      }
      return null;
    })();
  if (!scriptTag) return;

  var saId = scriptTag.getAttribute("data-sa");
  if (!saId) {
    console.warn("[leadstack-webchat] missing data-sa on widget snippet");
    return;
  }

  var BASE = (function () {
    try {
      var u = new URL(scriptTag.src);
      return u.protocol + "//" + u.host;
    } catch (e) {
      return "";
    }
  })();
  if (!BASE) return;

  // ---- Step 3: fetch config ---------------------------------------
  var bubble = null;
  var iframe = null;
  var isOpen = false;
  var config = null;

  fetch(BASE + "/api/web-chat/config?sa=" + encodeURIComponent(saId), {
    method: "GET",
    credentials: "omit",
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data || !data.enabled) return;
      config = data;
      mountBubble();
      listenForIframeMessages();
    })
    .catch(function () {
      // Network failure: silently degrade. The buyer's site shouldn't
      // show a broken-looking widget on intermittent connection issues.
    });

  // ---- Step 4: bubble ---------------------------------------------
  function mountBubble() {
    bubble = document.createElement("button");
    bubble.setAttribute("aria-label", "Open chat");
    bubble.style.cssText =
      "position:fixed;" +
      (config.position === "left" ? "left:20px;" : "right:20px;") +
      "bottom:20px;width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;" +
      "background:" + config.accentColor + ";color:white;" +
      "box-shadow:0 8px 24px -4px rgba(15,23,42,0.35);" +
      "display:flex;align-items:center;justify-content:center;" +
      "font-size:24px;line-height:1;z-index:2147483646;" +
      "transition:transform 0.18s ease-out;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";
    bubble.innerHTML = "&#128172;"; // 💬
    bubble.onmouseenter = function () {
      bubble.style.transform = "scale(1.06)";
    };
    bubble.onmouseleave = function () {
      bubble.style.transform = "scale(1)";
    };
    bubble.onclick = function () {
      if (isOpen) collapseIframe();
      else openIframe();
    };
    document.body.appendChild(bubble);
  }

  // ---- Step 5: iframe ---------------------------------------------
  function openIframe() {
    if (!iframe) {
      iframe = document.createElement("iframe");
      // Pass the parent's URL into the iframe so the chat UI can stamp
      // it on each /message call. Used for session.origin + session.pageUrl
      // logging — not for auth (parent origin is gated at /config).
      var parentUrl = "";
      try { parentUrl = window.location.href; } catch (e) {}
      var qs = parentUrl ? "?p=" + encodeURIComponent(parentUrl) : "";
      iframe.src = BASE + "/embed/chat/" + encodeURIComponent(saId) + qs;
      iframe.title = "Chat with us";
      iframe.allow = "clipboard-write";
      iframe.style.cssText =
        "position:fixed;" +
        (config.position === "left" ? "left:20px;" : "right:20px;") +
        "bottom:88px;width:380px;height:min(620px,calc(100vh - 120px));" +
        "border:0;border-radius:16px;background:transparent;" +
        "box-shadow:0 16px 48px -12px rgba(15,23,42,0.35);" +
        "z-index:2147483647;opacity:0;transform:translateY(8px) scale(0.98);" +
        "transition:opacity 0.18s ease-out, transform 0.18s ease-out;" +
        "color-scheme:light;";
      document.body.appendChild(iframe);
      // Force-trigger the transition after the browser has applied the
      // initial styles (otherwise the opacity:0 starting state is missed).
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (!iframe) return;
          iframe.style.opacity = "1";
          iframe.style.transform = "translateY(0) scale(1)";
        });
      });
    } else {
      iframe.style.display = "block";
      requestAnimationFrame(function () {
        if (!iframe) return;
        iframe.style.opacity = "1";
        iframe.style.transform = "translateY(0) scale(1)";
      });
    }
    isOpen = true;
    bubble.setAttribute("aria-label", "Close chat");
    bubble.innerHTML = "&#10005;"; // ×
  }

  function collapseIframe() {
    if (!iframe) return;
    iframe.style.opacity = "0";
    iframe.style.transform = "translateY(8px) scale(0.98)";
    // Keep the iframe in the DOM (preserves React state, no reload on
    // re-open) — just hide visually + via display:none after the fade.
    setTimeout(function () {
      if (iframe && !isOpen) iframe.style.display = "none";
    }, 200);
    isOpen = false;
    bubble.setAttribute("aria-label", "Open chat");
    bubble.innerHTML = "&#128172;";
  }

  // ---- Step 6: postMessage protocol -------------------------------
  function listenForIframeMessages() {
    window.addEventListener("message", function (event) {
      var data = event.data;
      if (!data || data.source !== "leadstack-webchat") return;
      if (data.type === "close") collapseIframe();
    });
  }
})();
