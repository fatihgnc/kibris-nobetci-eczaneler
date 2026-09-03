import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import SiteHeader from "./SiteHeader";
import trMessages from "../../messages/tr.json";

const meta = {
  title: "Components/SiteHeader",
  component: SiteHeader,
  parameters: { layout: "fullscreen" },
  args: {
    brand: trMessages.app.shortName,
    labels: trMessages.nav,
  },
} satisfies Meta<typeof SiteHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    current: "/",
  },
};

// The nav marks whichever page is being viewed with aria-current — shown
// here on "Eczaneler" the way the directory page renders it.
export const OnPharmaciesPage: Story = {
  args: {
    current: "/pharmacies",
  },
};
