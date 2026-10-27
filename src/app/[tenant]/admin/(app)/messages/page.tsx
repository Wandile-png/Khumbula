import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/dates";
import { displayPhone } from "@/lib/phone";
import { sendNow } from "../../actions";

export default async function Messages({ params, searchParams }: { params: { tenant: string }; searchParams: { sent?: string; failed?: string } }) {
  const t = await getTenant(params.tenant);
  const [queued, recent] = await Promise.all([
    db.message.findMany({ where: { tenantId: t.id, status: "QUEUED" }, orderBy: { createdAt: "asc" }, take: 50 }),
    db.message.findMany({ where: { tenantId: t.id, status: { not: "QUEUED" } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return (
    <div className="stack">
      <div className="row between">
        <h1>Messages</h1>
        <form action={sendNow.bind(null, t.slug)}><button className="btn sm" type="submit" disabled={!queued.length}>Send {queued.length} now</button></form>
      </div>
      {searchParams.sent && <p className={`flash ${Number(searchParams.failed) ? "bad" : ""}`}>{searchParams.sent} sent{Number(searchParams.failed) ? `, ${searchParams.failed} failed. Check your WhatsApp and SMS settings.` : "."}</p>}
      <p className="muted small">Welcome, due-date, missed-payment, lapse and cover-starting messages are created by the daily billing run and sent by WhatsApp, with SMS as the fallback.</p>
      <div className="cols">
        <div className="stack-s" style={{ minWidth: 0 }}>
          <h3>Waiting to send</h3>
          {queued.map((m) => <div key={m.id} className="msg"><div className="row between small"><b>{m.template.replace("_", " ")}</b><span className="muted">{m.channel} · {displayPhone(m.to)}</span></div><div className="body">{m.body}</div>{m.channel === "SMS" && <span className="muted small num">{m.body.length}/160 characters</span>}</div>)}
          {!queued.length && <p className="muted small">Nothing waiting.</p>}
        </div>
        <div className="stack-s" style={{ minWidth: 0 }}>
          <h3>Recently sent</h3>
          <div className="tablewrap"><table style={{ minWidth: 420 }}>
            <thead><tr><th>When</th><th>To</th><th>Type</th><th>Status</th></tr></thead>
            <tbody>{recent.map((m) => <tr key={m.id}><td>{formatDate(m.sentAt ?? m.createdAt)}</td><td>{displayPhone(m.to)}</td><td>{m.template.replace("_", " ")}</td><td><span className={`chip s-${m.status}`}>{m.status.toLowerCase()}</span>{m.error && <div className="err">{m.error}</div>}</td></tr>)}</tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}
