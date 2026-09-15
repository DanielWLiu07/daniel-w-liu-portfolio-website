/**
 * One route for every torn-off panel: `/panel/run`, `/panel/honk`, and so on.
 *
 * The id is in the PATH rather than the query string so the window's title can
 * be server-rendered. That matters more than it sounds: a panel is its own OS
 * window, and its title bar is the only label you get when three are parked in
 * a row on the second monitor. Setting `document.title` from the client does
 * not survive — Next re-asserts its own metadata over it, measured as the title
 * staying "panel" five seconds after the schema had arrived and rendered.
 *
 * The page itself knows nothing about what it is driving. It asks the scene
 * window for a schema and draws that, which is what makes adding a panel a
 * registration on the host rather than a new route.
 */
import type { Metadata } from "next";

import PanelClientView from "./client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `${id} · panel` };
}

export default async function PanelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  // Any tool can group its existing schemas into one window without changing
  // the panel protocol. IDs are still the address of each live connection.
  const tabs = (typeof query.tabs === "string" ? query.tabs : "")
    .split("|").slice(0, 8).map((entry) => {
      const [key, label] = entry.split(":");
      return { id: key, label: label?.slice(0, 60) || key };
    }).filter((tab, i, all) => /^[a-zA-Z0-9_-]{1,80}$/.test(tab.id) && all.findIndex(t => t.id === tab.id) === i);
  return <PanelClientView id={id} tabs={tabs} terminal={query.theme === "terminal"} />;
}
