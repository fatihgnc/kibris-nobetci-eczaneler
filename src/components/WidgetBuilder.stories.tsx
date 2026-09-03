import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import WidgetBuilder, { type WidgetLabels, type WidgetRegion } from "./WidgetBuilder";
import trMessages from "../../messages/tr.json";

const regions: WidgetRegion[] = [
  { slug: "lefkosa", tr: "Lefkoşa", en: "Nicosia" },
  { slug: "girne", tr: "Girne", en: "Kyrenia" },
  { slug: "gazimagusa", tr: "Gazimağusa", en: "Famagusta" },
  { slug: "guzelyurt", tr: "Güzelyurt", en: "Morphou" },
  { slug: "lefke", tr: "Lefke", en: "Lefke" },
  { slug: "iskele", tr: "İskele", en: "Iskele" },
  { slug: "karpaz", tr: "Karpaz", en: "Karpaz" },
  { slug: "mesarya", tr: "Mesarya", en: "Mesarya" },
];

// The `widget` namespace matches WidgetLabels field for field — it's kept
// out of the client bundle on every other page (see the component's own
// comment) and handed in here exactly as the /widget route builds it.
const labels: WidgetLabels = trMessages.widget;

const meta = {
  title: "Components/WidgetBuilder",
  component: WidgetBuilder,
  parameters: {
    layout: "padded",
    // The preview pane loads /embed/[slug], a real route this app serves —
    // Storybook has no such server, so the frame below the fold will show
    // as not-found rather than a rendered roster. Everything above it (the
    // controls, the generated snippet) is unaffected.
  },
  args: {
    regions,
    origin: "https://acikeczanevarmi.com",
    labels,
  },
} satisfies Meta<typeof WidgetBuilder>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
