"use client";

import { useEffect } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import {
  getMarketingWebChatSubAccountId,
  shouldRenderMarketingChat,
} from "@/lib/marketing-chat";

/**
 * Site-wide analytics + support widget loaders. Skipped on /embed/* so
 * the web-chat iframe doesn't accidentally render Crisp's widget inside
 * itself (two overlapping chat widgets = visual chaos) and so we don't
 * fire spurious PageView events from inside an embedded chat.
 *
 * Each tag is opt-in via its env var — leave unset to disable that tag
 * entirely (same as before; behavior on real pages is unchanged).
 *
 * Also auto-opens the fallback Crisp widget when the URL contains `?chat=1`.
 * The AgentStack marketing chat handles that query itself inside widget.js.
 */
export function AnalyticsScripts() {
  const pathname = usePathname();
  const isEmbed = pathname?.startsWith("/embed/") ?? false;
  const marketingChatSubAccountId = getMarketingWebChatSubAccountId();
  const shouldLoadMarketingChat = shouldRenderMarketingChat(pathname);
  const shouldLoadCrisp =
    !!process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID && !shouldLoadMarketingChat;

  // Auto-open Crisp when ?chat=1 is in the URL on routes where the
  // product marketing widget is NOT mounted. The widget handles the same
  // query param internally on public marketing pages.
  useEffect(() => {
    if (isEmbed) return;
    if (shouldLoadMarketingChat) return;
    if (!shouldLoadCrisp) return;
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("chat") !== "1") return;

    let elapsed = 0;
    const interval = window.setInterval(() => {
      elapsed += 100;
      if (window.$crisp) {
        window.$crisp.push(["do", "chat:open"]);
        window.clearInterval(interval);
      } else if (elapsed >= 5000) {
        window.clearInterval(interval);
      }
    }, 100);
    return () => window.clearInterval(interval);
  }, [isEmbed, shouldLoadCrisp, shouldLoadMarketingChat]);

  if (isEmbed) return null;

  return (
    <>
      {shouldLoadMarketingChat && marketingChatSubAccountId && (
        <Script
          id="agentstack-marketing-chat"
          src="/widget.js"
          strategy="afterInteractive"
          data-sa={marketingChatSubAccountId}
          data-agentstack-marketing-chat="true"
        />
      )}
      {process.env.NEXT_PUBLIC_GTM_ID && (
        <Script id="gtm-script" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${process.env.NEXT_PUBLIC_GTM_ID}');`}
        </Script>
      )}
      {process.env.NEXT_PUBLIC_META_PIXEL_ID && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${process.env.NEXT_PUBLIC_META_PIXEL_ID}');fbq('track','PageView');`}
        </Script>
      )}
      {shouldLoadCrisp && (
        <Script id="crisp-widget" strategy="afterInteractive">
          {`window.$crisp=[];window.CRISP_WEBSITE_ID="${process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID}";(function(){d=document;s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();`}
        </Script>
      )}
    </>
  );
}
