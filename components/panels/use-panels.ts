"use client";

/**
 * The scene page's handle on its panels.
 *
 * Wraps PanelHost so a component can register a panel, push readouts from the
 * frame loop, and offer a pop-out button, without owning the lifetime of a
 * BroadcastChannel.
 *
 * The binding is held in a ref rather than passed as a dependency on purpose.
 * A tuner's `set` closes over React state that changes on every edit, and
 * re-registering the panel on every keystroke would re-send the schema and make
 * the panel window flicker. The host reads through the ref instead, so it
 * always sees current state without the registration churning.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  PanelHost,
  listScreens,
  type PanelBinding,
  type PanelSchema,
  type ScreenInfo,
} from "blender-to-threejs";

import { PANEL_EDIT_EVENT } from './panel-events';

export function usePanelHost(options?: ConstructorParameters<typeof PanelHost>[0]): PanelHost | null {
  // The connection must be created and destroyed in the SAME lifecycle.
  // A state initialiser survives StrictMode's effect remount, so disposing
  // that host in cleanup leaves the remounted page using a closed channel.
  const [host, setHost] = useState<PanelHost | null>(null);
  const initialOptions = useRef(options);
  useEffect(() => {
    const connection = new PanelHost(initialOptions.current);
    setHost(connection);
    return () => connection.dispose();
  }, []);
  return host;
}

/**
 * Register one panel and keep its binding fresh.
 *
 * Returns whether the panel window is currently open, so the page can label its
 * button "pop out" or "close".
 */
export function usePanel(
  host: PanelHost | null,
  schema: PanelSchema,
  binding: PanelBinding,
): { open: (screen?: ScreenInfo) => void; close: () => void; isOpen: boolean } {
  const ref = useRef(binding);
  // Refreshed in an effect rather than during render. The host only ever reads
  // this from a channel message — asynchronously, never while rendering — so
  // an update that lands after paint is soon enough, and writing a ref during
  // render is the thing that makes a component not update as expected.
  useEffect(() => {
    ref.current = binding;
  });
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!host) return;
    // Every optional member has to be forwarded explicitly. Forgetting one
    // fails silently — the host calls an absent method, gets undefined, and
    // the panel renders an empty section rather than an error. That is exactly
    // how the outliner first shipped showing "nothing in the scene" against a
    // 94-object graph.
    host.register(schema, {
      get: () => ref.current.get(),
      set: (k, v) => {
        ref.current.set(k, v);
        window.dispatchEvent(new Event(PANEL_EDIT_EVENT));
      },
      press: (k) => {
        ref.current.press?.(k);
        window.dispatchEvent(new Event(PANEL_EDIT_EVENT));
      },
      snippets: () => ref.current.snippets?.() ?? {},
      trees: () => ref.current.trees?.() ?? {},
      select: (k, node, visible) => {
        ref.current.select?.(k, node, visible);
        window.dispatchEvent(new Event(PANEL_EDIT_EVENT));
      },
    });
    return () => host.unregister(schema.id);
  }, [host, schema]);

  // `win.closed` is the only way to learn a popup was closed by its own title
  // bar — there is no event for it on the opener side. A slow poll is enough
  // for a button label.
  useEffect(() => {
    if (!host) return;
    const t = setInterval(() => setIsOpen(host.isOpen(schema.id)), 500);
    return () => clearInterval(t);
  }, [host, schema.id]);

  const open = useCallback(
    (screen?: ScreenInfo) => {
      host?.open(schema.id, screen);
      setIsOpen(true);
    },
    [host, schema.id],
  );
  const close = useCallback(() => {
    host?.close(schema.id);
    setIsOpen(false);
  }, [host, schema.id]);

  return { open, close, isOpen };
}

/**
 * The screens available to park a panel on.
 *
 * Empty until permission is granted, which only happens inside a user gesture —
 * so this is loaded lazily by the pop-out control rather than on mount, where
 * the prompt would appear unprompted on every page load.
 */
export function useScreens(): {
  screens: ScreenInfo[];
  load: () => Promise<void>;
} {
  const [screens, setScreens] = useState<ScreenInfo[]>([]);
  const load = useCallback(async () => {
    setScreens(await listScreens());
  }, []);
  return { screens, load };
}
