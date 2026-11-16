import { useCallback, useLayoutEffect, useRef, useState } from "react";

const hostClass = "h-full w-full min-h-0 min-w-0 overflow-hidden";

export function useTerminalHost() {
  const [container] = useState(() => {
    const element = document.createElement("div");
    element.className = hostClass;
    return element;
  });
  const [ready, setReady] = useState(false);
  const assignSlot = useCallback(
    (node: HTMLDivElement | null) => {
      // The host node outlives each dock slot, so the PTY stays open.
      if (!node) {
        return;
      }
      if (container.parentElement !== node) {
        node.appendChild(container);
      }
      setReady(true);
    },
    [container],
  );
  return { container, ready, assignSlot };
}

export function TerminalSlot({
  assign,
}: {
  assign: (node: HTMLDivElement | null) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    assign(node.current);
    return () => assign(null);
  }, [assign]);
  return <div ref={node} className="h-full w-full min-h-0 min-w-0" />;
}
