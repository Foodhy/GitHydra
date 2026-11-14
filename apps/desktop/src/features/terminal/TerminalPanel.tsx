import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

export function TerminalPanel() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) {
      return;
    }
    const term = new Terminal({
      convertEol: true,
      disableStdin: true,
      fontSize: 13,
      fontFamily: "SF Mono, ui-monospace, monospace",
      theme: {
        background: "#12141a",
        foreground: "#e7e9ef",
        cursor: "#3ee0b0",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element);
    fit.fit();
    term.writeln("GitHydra — terminal reservada");
    term.writeln(
      "El PTY real llega en la fase 2. Esta sesión no ejecuta comandos.",
    );
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(element);
    return () => {
      observer.disconnect();
      term.dispose();
    };
  }, []);

  return <div ref={host} className="h-full bg-surface px-2 py-1" />;
}
