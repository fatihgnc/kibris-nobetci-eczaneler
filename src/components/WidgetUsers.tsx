// "Kullananlar": the sites that carry the widget.
//
// Empty on purpose, and it renders nothing while it is. A logo strip with one
// logo on it says less than no strip at all; this exists so that when the
// first newspaper agrees, adding them is a line in the page and not a layout.

export interface WidgetUser {
  name: string;
  /** Their site, not our region page: this row is a thank-you, not a link scheme. */
  href: string;
  /** Path under /public. Monochrome on a transparent background, so the row reads as one. */
  logo: string;
}

export default function WidgetUsers({ title, users }: { title: string; users: WidgetUser[] }) {
  if (users.length === 0) return null;
  return (
    <section className="wusers" aria-label={title}>
      <h2>{title}</h2>
      <ul>
        {users.map((u) => (
          <li key={u.href}>
            <a href={u.href} rel="noopener" target="_blank">
              {/* eslint-disable-next-line @next/next/no-img-element -- static asset, nothing to optimise */}
              <img src={u.logo} alt={u.name} loading="lazy" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
