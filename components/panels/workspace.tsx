"use client";

/**
 * Blender's workspace tabs — Layout, Shading, Compositing — as window SETS.
 *
 * In Blender a workspace is a screen layout you tab between. Here the windows
 * ARE the layout, so a workspace is just "which panels open together", and
 * switching to one opens them across the screens you have rather than
 * rearranging a single window.
 *
 * Two browser facts shape this. Popups need a user gesture, and browsers rate
 * limit several `window.open` calls from one gesture — so the host reports what
 * it actually managed to open and this says so rather than assuming three
 * windows appeared.
 */
import { useState } from "react";

import type { PanelHost } from "blender-to-threejs";

import { useScreens } from "./use-panels";

export interface Workspace {
  readonly name: string;
  readonly panels: readonly string[];
}

export default function WorkspaceBar({
  host,
  workspaces,
}: {
  host: PanelHost | null;
  workspaces: readonly Workspace[];
}) {
  const { screens, load } = useScreens();
  const [note, setNote] = useState("");

  const openIt = async (w: Workspace) => {
    // Asking for screens first spreads the panels across monitors instead of
    // stacking them. It is also the permission prompt, so it stays inside this
    // click rather than firing on page load.
    await load();
    const opened = host?.openWorkspace(w.panels, screens) ?? [];
    setNote(
      opened.length === w.panels.length
        ? ""
        : `opened ${opened.length} of ${w.panels.length} — the browser blocked the rest, click again`,
    );
  };

  return (
    <div className="mt-2">
      <span className="text-neutral-500">workspace </span>
      {workspaces.map((w) => (
        <button
          key={w.name}
          type="button"
          onClick={() => openIt(w)}
          className="mr-2 underline underline-offset-2 hover:text-neutral-900"
        >
          {w.name}
        </button>
      ))}
      {note ? <div className="text-amber-700">{note}</div> : null}
    </div>
  );
}
