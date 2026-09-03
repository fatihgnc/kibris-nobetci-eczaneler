import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import DocPage from "./DocPage";
import trMessages from "../../messages/tr.json";

const meta = {
  title: "Components/DocPage",
  component: DocPage,
  parameters: { layout: "fullscreen" },
  args: {
    brand: trMessages.app.shortName,
    navLabels: trMessages.nav,
  },
} satisfies Meta<typeof DocPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const about = trMessages.about;

export const About: Story = {
  args: {
    current: "/about",
    h1: about.h1,
    lead: about.p1,
    sections: [
      { heading: about.sourceTitle, body: about.sourceP },
      { heading: about.freshTitle, body: about.freshP },
      { heading: about.limitsTitle, body: about.limitsP },
      { heading: about.openTitle, body: about.openP },
    ],
  },
};

// The contact page passes its address block as children, between the lead
// and the titled sections — DocPage itself never knows what that markup is.
export const WithChildren: Story = {
  args: {
    current: "/contact",
    h1: trMessages.contact.h1,
    lead: trMessages.contact.p1,
    sections: [],
    children: (
      <p>
        <strong>E-posta:</strong> merhaba@acikeczanevarmi.com
      </p>
    ),
  },
};
