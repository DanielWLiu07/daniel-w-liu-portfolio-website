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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PanelClientView id={id} />;
}
