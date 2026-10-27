import Link from "next/link";
import type { Tenant } from "@prisma/client";

export function shortName(name: string) {
  return name.replace(/\s*(funeral (home|services|parlour)s?)\s*$/i, "").toUpperCase();
}

export function Masthead({ tenant, active }: { tenant: Tenant; active?: "join" | "portal" | "admin" }) {
  const initials = tenant.name.split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0].toLowerCase()).join("");
  const links = [
    ["join", "Get cover", `/${tenant.slug}`],
    ["portal", "My policy", `/${tenant.slug}/portal`],
  ] as const;
  return (
    <header className="masthead wrap">
      <div className="in container">
        <Link href={`/${tenant.slug}`} className="wordmark">
          <span className="monogram">{initials}</span>
          <span style={{ minWidth: 0 }}>
            <b>{shortName(tenant.name)}</b>
            <small>— FUNERAL HOME —</small>
          </span>
        </Link>
        <nav className="topnav" aria-label="Main">
          {links.map(([k, label, href]) => (
            <Link key={k} href={href} aria-current={active === k ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function Footer({ tenant }: { tenant: Tenant }) {
  return (
    <footer className="footer wrap">
      <div className="in container">
        <div>
          <h4>Contact us</h4>
          <div className="c num">
            {tenant.phone && <span>Office {tenant.phone}</span>}
            {tenant.whatsapp && <span>WhatsApp {tenant.whatsapp}</span>}
            {tenant.email && <span>{tenant.email}</span>}
            {tenant.website && <span>{tenant.website}</span>}
            {tenant.address && <span>{tenant.address}</span>}
          </div>
        </div>
        <div>
          <h4>Our cover</h4>
          <div className="c">
            <span>Tailor-made packages and group schemes available on request</span>
            <span>{tenant.waitingMonths} months waiting period applicable for all plans</span>
          </div>
        </div>
        {tenant.underwriter && (
          <div>
            <h4>Underwritten by</h4>
            <div className="c">
              <span style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>{tenant.underwriter}</span>
              {tenant.fspNumber && <span>FSP {tenant.fspNumber}</span>}
            </div>
          </div>
        )}
      </div>
    </footer>
  );
}
