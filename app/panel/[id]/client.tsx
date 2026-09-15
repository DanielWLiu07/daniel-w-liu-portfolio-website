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
import { useTransitionState } from '@/components/ui/page-transition';
import CustomModule from '@/components/panels/custom-module';
import { TOOL_MODULES, toolModule } from '@/components/panels/tool-modules';
import "@/components/panels/terminal.css";

export default function PanelClientView({ id, tabs = [], terminal = false }: {
  id: string;
  tabs?: { id: string; label: string }[];
  terminal?: boolean;
}) {
  const { signalReady, transitionStage } = useTransitionState();
  // The module shell owns its connection/loading UI; release the site's
  // page overlay even when a returning visitor has a saved display mode.
  useEffect(() => { signalReady(); }, [signalReady, transitionStage]);
  const [active, setActive] = useState(id);
  const [modules, setModules] = useState(() => tabs.some(tab => tab.id === id) ? tabs : [{ id, label: toolModule(id)?.title ?? id }, ...tabs]);
  return (
    <div className={`flex h-dvh flex-col font-mono text-xs ${terminal ? "panel-terminal" : "text-neutral-700"}`}>
      <div className="flex items-center gap-2 border-b border-neutral-700 p-2">
        <span>Modules</span>
        <select aria-label="Add tool module" value="" className="min-w-0 flex-1 bg-transparent" onChange={event => {
          const entry = toolModule(event.target.value);
          if (!entry) return;
          setModules(current => current.some(tab => tab.id === entry.id) ? current : [...current, { id: entry.id, label: entry.title }]);
          setActive(entry.id);
        }}>
          <option value="" disabled>Add module…</option>
          {TOOL_MODULES.map(module => <option key={module.id} value={module.id}>{module.title}</option>)}
        </select>
      </div>
      {modules.length > 0 && <div role="tablist" aria-label="Control editors" className="panel-tabs overflow-x-auto">
        {modules.map((tab, i) => <button key={tab.id} type="button" role="tab"
          id={`tab-${tab.id}`} aria-controls={`editor-${tab.id}`} aria-selected={active === tab.id}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => setActive(tab.id)} onKeyDown={(e) => {
            const next = e.key === "ArrowRight" ? (i + 1) % modules.length : e.key === "ArrowLeft" ? (i + modules.length - 1) % modules.length : e.key === "Home" ? 0 : e.key === "End" ? modules.length - 1 : -1;
            if (next < 0) return;
            e.preventDefault(); setActive(modules[next].id);
            document.getElementById(`tab-${modules[next].id}`)?.focus();
          }}>{tab.label}</button>)}
      </div>}
      <div className="min-h-0 flex-1" role="tabpanel"
        id={`editor-${active}`} aria-labelledby={`tab-${active}`}>
        {toolModule(active)?.kind === 'custom' ? <CustomModule key={active} id={active} /> : <ConnectedPanel key={active} id={active} />}
      </div>
    </div>
  );
}

function ConnectedPanel({ id }: { id: string }) {
  // A ref, not state: nothing rendered depends on the client's identity, only
  // the snapshot it produces. Holding it in state would set state inside an
  // effect and cascade a second render for no gain.
  const client = useRef<PanelClient | null>(null);
  const [snapshot, setSnapshot] = useState<PanelSnapshot>({
    schema: null,
    values: {},
    readouts: {},
    snippets: {},
    trees: {},
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
  const onSelect = useCallback(
    (key: string, node: string, visible?: boolean) =>
      client.current?.select(key, node, visible),
    [],
  );

  return (
    <div className="h-full">
      <PanelView
        snapshot={snapshot}
        onSet={onSet}
        onPress={onPress}
        onSelect={onSelect}
      />
    </div>
  );
}
