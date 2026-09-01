// What of the translation catalogue actually has to reach the browser.
//
// The layout used to hand NextIntlClientProvider everything, which meant the
// full catalogue was serialised into the HTML of every page — including the
// namespaces that only ever render on the server. That was a few unnoticed
// kilobytes before this site had region, pharmacy, directory and legal pages;
// it is a lot more now, on every single page load.
//
// A denylist rather than an allowlist: a namespace added later is more likely
// to be read by a client component than not, and forgetting to allow one fails
// at runtime with a missing-message error. Forgetting to deny one only costs
// the bytes we were already paying.
import type { AbstractIntlMessages } from "next-intl";

/**
 * Namespaces no `"use client"` component reads — verified against every file
 * carrying the directive. Keep this list honest: if a client component starts
 * using one of these, take it off the list or it will throw.
 */
const SERVER_ONLY = ["region", "pharmacy", "about", "privacy", "contact", "directory", "embed", "widget"];

export function clientMessages(all: AbstractIntlMessages): AbstractIntlMessages {
  const out: AbstractIntlMessages = { ...all };
  for (const namespace of SERVER_ONLY) delete out[namespace];
  return out;
}
