import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import WidgetUsers, { type WidgetUser } from "./WidgetUsers";

const meta = {
  title: "Components/WidgetUsers",
  component: WidgetUsers,
  parameters: { layout: "padded" },
  args: {
    title: "Kullananlar",
  },
} satisfies Meta<typeof WidgetUsers>;

export default meta;
type Story = StoryObj<typeof meta>;

// A monochrome placeholder mark, standing in for a real newspaper's logo —
// there is nothing under /public yet because the list is empty in
// production (see the component's own comment).
const placeholderLogo =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='32'%3E%3Crect width='120' height='32' rx='4' fill='%23888'/%3E%3Ctext x='60' y='21' font-family='sans-serif' font-size='13' fill='%23fff' text-anchor='middle'%3ELogo%3C/text%3E%3C/svg%3E";

const users: WidgetUser[] = [
  { name: "Örnek Gazetesi", href: "https://example.com", logo: placeholderLogo },
  { name: "Örnek Belediyesi", href: "https://example.org", logo: placeholderLogo },
  { name: "Örnek Rehber", href: "https://example.net", logo: placeholderLogo },
];

export const WithUsers: Story = {
  args: { users },
};

// The row renders nothing at all until the first site actually carries the
// widget — no empty strip, no placeholder text.
export const Empty: Story = {
  args: { users: [] },
};
