import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import MapView, { type MapPoint } from "./MapView";

const POINTS: MapPoint[] = [
  { id: 1, name: "Merkez Eczanesi", lat: 35.1856, lng: 33.3823, statusClass: "s-open", muted: false },
  { id: 2, name: "Sağlık Eczanesi", lat: 35.3363, lng: 33.3192, statusClass: "s-oncall", muted: false },
  { id: 3, name: "Liman Eczanesi", lat: 35.1264, lng: 33.9391, statusClass: "s-warn", muted: false },
  { id: 4, name: "Kapalı Eczane", lat: 35.2, lng: 33.5, statusClass: "s-closed", muted: true },
];

const meta = {
  title: "Components/MapView",
  component: MapView,
  parameters: {
    layout: "fullscreen",
    // Real Leaflet + real OpenStreetMap tiles (no API key, see the
    // component's own comment) — this fetches actual tile images over the
    // network when the story renders.
  },
  decorators: [
    (Story) => (
      <div style={{ height: "560px", width: "100%" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    points: POINTS,
    me: null,
    selId: null,
    fitSignal: 1,
    onSelect: () => {},
    bottomInset: 0,
  },
} satisfies Meta<typeof MapView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithSelection: Story = {
  args: {
    selId: 2,
  },
};

// "Me" is the visitor's own location — a pin drawn distinctly from the
// pharmacies and included in the fit as long as no region filter is active.
export const WithUserLocation: Story = {
  args: {
    me: [35.19, 33.36],
  },
};

// Clicking an open pin calls onSelect with its id; this story keeps its own
// state to show the resulting selection, the way the app screen does above
// MapView.
export const Interactive: Story = {
  render: (args) => {
    function Wrapper() {
      const [selId, setSelId] = useState<number | null>(null);
      return <MapView {...args} selId={selId} onSelect={setSelId} />;
    }
    return <Wrapper />;
  },
};
