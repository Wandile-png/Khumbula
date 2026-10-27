/** Renders a PayFast form as a button. The member taps it and is taken to PayFast's secure page. */
export function GatewayForm({ action, fields, label }: { action: string; fields: [string, string][]; label: string }) {
  return (
    <form action={action} method="post">
      {fields.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button className="btn" type="submit" style={{ width: "100%" }}>{label}</button>
    </form>
  );
}
