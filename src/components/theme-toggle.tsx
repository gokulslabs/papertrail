import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { initTheme, toggleTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

function useThemeState() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(initTheme());
  }, []);

  return [theme, setTheme] as const;
}

export function ThemeToggle({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  const [theme, setTheme] = useThemeState();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:justify-start md:px-3",
        className,
      )}
      aria-label={theme === null ? "Toggle color theme" : dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(toggleTheme())}
    >
      {theme === null ? (
        <span className="h-4 w-4 shrink-0" aria-hidden />
      ) : dark ? (
        <Sun className="h-4 w-4 shrink-0" />
      ) : (
        <Moon className="h-4 w-4 shrink-0" />
      )}
      {showLabel && theme !== null && (
        <span className="hidden md:inline">{dark ? "Light mode" : "Dark mode"}</span>
      )}
    </button>
  );
}

/** Compact toggle for the landing header. */
export function LandingThemeToggle() {
  const [theme, setTheme] = useThemeState();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label={theme === null ? "Toggle color theme" : dark ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === null ? "Theme" : dark ? "Light mode" : "Dark mode"}
      onClick={() => setTheme(toggleTheme())}
    >
      {theme === null ? (
        <span className="h-4 w-4" aria-hidden />
      ) : dark ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  );
}
