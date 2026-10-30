"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ slug }: { slug: string }) {
  const path = usePathname();
  const items = [["", "Dashboard"], ["/policies", "Policies"], ["/claims", "Claims"], ["/agents", "Agents"], ["/messages", "Messages"], ["/users", "Users"], ["/settings", "Settings"]];
  return (
    <nav className="adminnav" aria-label="Admin">
      {items.map(([p, label]) => {
        const href = `/${slug}/admin${p}`;
        const current = p === "" ? path === href : path.startsWith(href);
        return <Link key={p} href={href} aria-current={current ? "page" : undefined}>{label}</Link>;
      })}
    </nav>
  );
}
