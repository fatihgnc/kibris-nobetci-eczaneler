import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import BackLink from "./BackLink";

const meta = {
  title: "Components/BackLink",
  component: BackLink,
  parameters: { layout: "padded" },
} satisfies Meta<typeof BackLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    href: "/pharmacies",
    label: "Tüm eczaneler",
  },
};

// `?from` picks the alternate target after mount — open this story with
// ?from=region in the preview URL to see it swap, the same way a pharmacy
// page swaps between "tüm eczaneler" and "Lefkoşa" depending on where the
// visitor came from.
export const WithAlternate: Story = {
  args: {
    href: "/pharmacies",
    label: "Tüm eczaneler",
    from: { key: "region", href: "/pharmacies-on-duty/lefkosa", label: "Lefkoşa" },
  },
};
