import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CheckIcon, CloseIcon, CopyIcon, NavIcon, PhoneIcon, RecenterIcon } from "./icons";

const ICONS = {
  RecenterIcon,
  PhoneIcon,
  NavIcon,
  CopyIcon,
  CheckIcon,
  CloseIcon,
};

const meta = {
  title: "Components/Icons",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllIcons: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      {/* The app never renders these at their raw viewBox size — every
          caller sizes them through its own class. Fixed here so the gallery
          shows icons, not a page of giant paths. */}
      <style>{".icon-tile svg { width: 24px; height: 24px; stroke: currentColor; }"}</style>
      {Object.entries(ICONS).map(([name, Icon]) => (
        <div
          key={name}
          className="icon-tile"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            width: 96,
          }}
        >
          <Icon />
          <span style={{ fontSize: 12, color: "#666" }}>{name}</span>
        </div>
      ))}
    </div>
  ),
};
