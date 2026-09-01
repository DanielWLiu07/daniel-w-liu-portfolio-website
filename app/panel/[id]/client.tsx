"use client";

/**
 * The live half of a panel window: connect, render what arrives, post edits.
 *
 * There is deliberately nothing to server-render here — the whole page is a
 * view onto another window's state and has nothing to show until that window
 * answers.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  PanelClient,
  type PanelSnapshot,
  type PanelValue,
} from "blender-to-threejs";

import PanelView from "@/components/panels/panel-view";

export default function PanelClientView({ id }: { id: string }) {
  // A ref, not state: nothing rendered depends on the client's identity, only
  // the snapshot it produces. Holding it in state would set state inside an
  // effect and cascade a second render for no gain.
  const client = useRef<PanelClient | null>(null);
  const [snapshot, setSnapshot] = useState<PanelSnapshot>({
    schema: null,
    values: {},
    readouts: {},
    snippets: {},
    connected: false,
  });

  useEffect(() => {
    const c = new PanelClient(id);
    client.current = c;
    const off = c.subscribe(setSnapshot);
    return () => {
      off();
      c.dispose();
      client.current = null;
    };
  }, [id]);

  const onSet = useCallback(
    (key: string, value: PanelValue) => client.current?.set(key, value),
    [],
  );
  const onPress = useCallback((key: string) => client.current?.press(key), []);

  return (
    <div className="h-dvh font-mono text-xs text-neutral-700">
      <PanelView snapshot={snapshot} onSet={onSet} onPress={onPress} />
    </div>
  );
}
