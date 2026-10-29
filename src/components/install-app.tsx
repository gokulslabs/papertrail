import { useEffect, useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  canPromptInstall,
  isStandaloneDisplay,
  promptInstall,
  subscribeInstallAvailability,
} from "@/lib/pwa";

/** Compact install control — shows when the browser can add Privytrail to the home screen. */
export function InstallAppButton({ className }: { className?: string }) {
  const [available, setAvailable] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    setAvailable(canPromptInstall());
    return subscribeInstallAvailability(() => setAvailable(canPromptInstall()));
  }, []);

  if (standalone || !available) return null;

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={className}
      onClick={() => void promptInstall()}
    >
      <Download className="h-3.5 w-3.5" />
      Install app
    </Button>
  );
}

export function InstallAppCard() {
  const [available, setAvailable] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    setAvailable(canPromptInstall());
    return subscribeInstallAvailability(() => setAvailable(canPromptInstall()));
  }, []);

  if (standalone) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Installed</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You’re using Privytrail as an installed app on this device.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold">Install Privytrail</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Add it to your home screen or dock for a full-screen app — still private, still only on this
        device.
      </p>
      {available ? (
        <Button className="mt-3" size="sm" onClick={() => void promptInstall()}>
          <Download className="h-3.5 w-3.5" />
          Install app
        </Button>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          In Chrome or Edge, use the install icon in the address bar. On iPhone/iPad, open Share →
          Add to Home Screen.
        </p>
      )}
    </section>
  );
}
