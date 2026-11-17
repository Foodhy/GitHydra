import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useT } from "../../lib/i18n";
import {
  advanceOnboarding,
  finishOnboarding,
  type OnboardingStep,
  readOnboarding,
} from "../../lib/onboarding";

interface McpLaunch {
  command: string;
  args: string[];
}

export function CursorConnectStrip() {
  const tr = useT();
  const [step, setStep] = useState<OnboardingStep | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    void readOnboarding().then((state) => {
      if (!alive || state.done || state.step === null) {
        return;
      }
      setStep(state.step);
      void invoke<McpLaunch>("mcp_launch")
        .then((launch) => {
          if (!alive) {
            return;
          }
          setBody(
            JSON.stringify(
              {
                mcpServers: {
                  githydra: {
                    command: launch.command,
                    args: launch.args,
                  },
                },
              },
              null,
              2,
            ),
          );
        })
        .catch(() => undefined);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (step === null) {
    return null;
  }

  async function copy() {
    if (!body) {
      return;
    }
    await navigator.clipboard.writeText(body);
    setCopied(true);
    await advanceOnboarding();
    setStep(3);
  }

  async function hide() {
    await finishOnboarding();
    setStep(null);
  }

  if (step === 3) {
    return (
      <section className="flex items-start justify-between gap-3 border-b border-line bg-surface-raised px-3 py-2">
        <p className="text-xs text-muted">
          <span className="mr-2 text-accent">
            {tr("onboard.progress", { step: 3 })}
          </span>
          {tr("onboard.confirm")}
        </p>
        <button
          type="button"
          className="shrink-0 text-xs text-accent"
          onClick={() => {
            void hide();
          }}
        >
          {tr("onboard.done")}
        </button>
      </section>
    );
  }

  return (
    <section className="border-b border-line bg-surface-raised px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted">
          <span className="mr-2 text-accent">
            {tr("onboard.progress", { step: 2 })}
          </span>
          {tr("connect.lead")}
        </p>
        <div className="flex shrink-0 gap-3 text-xs">
          <button
            type="button"
            className="text-accent"
            onClick={() => {
              void copy();
            }}
          >
            {copied ? tr("connect.copied") : tr("connect.copy")}
          </button>
          <button
            type="button"
            className="text-muted"
            onClick={() => {
              void hide();
            }}
          >
            {tr("connect.hide")}
          </button>
        </div>
      </div>
      {body ? (
        <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-5 text-text">
          {body}
        </pre>
      ) : null}
    </section>
  );
}
