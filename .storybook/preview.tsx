import type { Preview } from "@storybook/nextjs-vite";
import { NextIntlClientProvider } from "next-intl";
import React from "react";
import trMessages from "../messages/tr.json";
import "../src/app/globals.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: "todo",
    },
  },
  // Every component here reaches for next-intl's useTranslations/Link sooner
  // or later, so every story renders inside the same provider the real app
  // wraps them in — Turkish messages, since that's the site's default locale.
  decorators: [
    (Story) => (
      <NextIntlClientProvider locale="tr" messages={trMessages}>
        <Story />
      </NextIntlClientProvider>
    ),
  ],
};

export default preview;
