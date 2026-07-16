type CrispCommand = [string, ...unknown[]];

declare global {
  interface Window {
    $crisp?: { push: (command: CrispCommand) => void };
    AgentStackSupportChat?: {
      open: () => void;
      close: () => void;
      toggle: () => void;
    };
    __agentStackSupportChatQueue?: string[];
  }
}

function hasMarketingChatSnippet() {
  if (typeof document === "undefined") return false;
  return !!document.querySelector('script[src*="/widget.js"][data-sa]');
}

export function openSupportChat() {
  if (typeof window === "undefined") return;

  if (window.AgentStackSupportChat?.open) {
    window.AgentStackSupportChat.open();
    return;
  }

  if (hasMarketingChatSnippet()) {
    window.__agentStackSupportChatQueue =
      window.__agentStackSupportChatQueue ?? [];
    window.__agentStackSupportChatQueue.push("open");
    return;
  }

  window.$crisp?.push(["do", "chat:open"]);
}

export const openCrispChat = openSupportChat;
