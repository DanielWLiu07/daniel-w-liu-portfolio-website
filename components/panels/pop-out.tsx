"use client";

/**
 * The button that tears a panel off onto another monitor.
 *
 * Two-stage on purpose. The plain click opens the panel wherever the browser
 * puts it, which is what you want most of the time and costs no permission
 * prompt. The chevron asks for the screen list first — that call IS the
 * "window-management" permission prompt, so it must be behind a deliberate
 * gesture rather than fired on page load, where it would appear unexplained.
 *
 * Both paths degrade: no Window Management API, or permission refused, and the
 * panel still opens. It just opens on this screen.
 */
import { useState } from "react";

import type { PanelHost, ScreenInfo } from "blender-to-threejs";

import { usePanel, useScreens } from "./use-panels";

export default function PopOut({
  host,
  schema,
  binding,
  label,
}: {
  host: PanelHost | null;
  schema: Parameters<typeof usePanel>[1];
  binding: Parameters<typeof usePanel>[2];
  label: string;
}) {
  const { open, close, isOpen } = usePanel(host, schema, binding);
  const { screens, load } = useScreens();
  const [picking, setPicking] = useState(false);

  const pick = async () => {
    await load();
    setPicking((p) => !p);
  };

  const onScreen = (s: ScreenInfo) => {
    open(s);
    setPicking(false);
  };

  return (
    <span className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => (isOpen ? close() : open())}
        className="underline underline-offset-2 hover:text-neutral-900"
      >
        {isOpen ? `close ${label}` : label}
      </button>
      <button
        type="button"
        onClick={pick}
        title="open on a specific screen"
        aria-label={`choose a screen for ${label}`}
        className="px-1 text-neutral-400 hover:text-neutral-800"
      >
        ▾
      </button>
      {picking ? (
        <span className="absolute left-0 top-full z-10 mt-1 min-w-40 border border-neutral-300 bg-white p-1 shadow-sm">
          {screens.length === 0 ? (
            <span className="block px-1 py-0.5 text-neutral-500">
              no screen access — it will open here
            </span>
          ) : (
            screens.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onScreen(s)}
                className="block w-full px-1 py-0.5 text-left hover:bg-neutral-100"
              >
                {s.label}
                <span className="pl-1 text-neutral-400">
                  {s.width}×{s.height}
                  {s.current ? " · this one" : ""}
                </span>
              </button>
            ))
          )}
        </span>
      ) : null}
    </span>
  );
}
