type CrispCommand = [string, ...unknown[]];

declare global {
  interface Window {
    $crisp?: { push: (command: CrispCommand) => void };
  }
}

export function openCrispChat() {
  if (typeof window === "undefined") return;
  window.$crisp?.push(["do", "chat:open"]);
}
