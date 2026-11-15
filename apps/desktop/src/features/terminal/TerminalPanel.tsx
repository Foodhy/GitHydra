import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

export function TerminalPanel({ path }: { path: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) {
      return;
    }
    const term = new Terminal({
      convertEol: true,
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
    const session = { id: 0, closed: false };
    const stops: Array<() => void> = [];

    term.onData((data) => {
      if (session.id === 0) {
        return;
      }
      void invoke("pty_write", { id: session.id, data });
    });
    term.onResize(({ cols, rows }) => {
      if (session.id === 0) {
        return;
      }
      void invoke("pty_resize", { id: session.id, rows, cols });
    });
    const observer = new ResizeObserver(() => {
      fit.fit();
    });
    observer.observe(element);

    void (async () => {
      const output = await listen<{ id: number; data: string }>(
        "pty-output",
        (event) => {
          if (event.payload.id === session.id) {
            term.write(event.payload.data);
          }
        },
      );
      stops.push(output);
      const exit = await listen<{ id: number }>("pty-exit", (event) => {
        if (event.payload.id === session.id) {
          term.writeln("\r\nLa sesión terminó.");
        }
      });
      stops.push(exit);
      if (session.closed) {
        return;
      }
      const id = await invoke<number>("pty_open", { path });
      if (session.closed) {
        await invoke("pty_close", { id });
        return;
      }
      session.id = id;
      void invoke("pty_resize", {
        id,
        rows: term.rows,
        cols: term.cols,
      });
    })().catch((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      term.writeln(message);
    });

    return () => {
      session.closed = true;
      observer.disconnect();
      for (const stop of stops) {
        stop();
      }
      if (session.id !== 0) {
        void invoke("pty_close", { id: session.id });
      }
      term.dispose();
    };
  }, [path]);

  return <div ref={host} className="h-full bg-surface px-2 py-1" />;
}
