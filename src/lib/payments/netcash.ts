/**
 * DebiCheck debit orders via Netcash (https://netcash.co.za).
 *
 * DebiCheck requires the member to approve an electronic mandate on their banking app (TT1/TT2 flow).
 * Netcash exposes this through its Debit Order / DebiCheck service (SOAP + batch file upload) and posts
 * results back to a notify URL. Their integration needs a service key issued on onboarding, so this
 * adapter is the single place to finish once you have sandbox credentials.
 *
 * Until NETCASH_DEBICHECK_SERVICE_KEY is set, `mode` is "manual": mandates are created as REQUESTED and
 * staff confirm approval and collections in Admin. That keeps the rest of the system working end to end.
 */

export type MandateRequest = {
  policyNumber: string;
  accountHolder: string;
  idNumber: string;
  phone: string;
  bank: string;
  accountType: string;
  accountNumber: string; // passed through, never stored by us
  branchCode: string;
  amountCents: number;
  debitDay: number;
  firstCollection: Date;
};

export const netcashMode = () => (process.env.NETCASH_DEBICHECK_SERVICE_KEY ? "live" : "manual");

export async function requestMandate(req: MandateRequest): Promise<{ providerRef: string | null; mode: "live" | "manual" }> {
  if (netcashMode() === "manual") return { providerRef: null, mode: "manual" };
  // TODO(netcash): call the DebiCheck mandate-request service with the service key.
  // Map: req.accountNumber, req.branchCode, req.accountType (1 cheque, 2 savings, 3 transmission),
  // req.amountCents / 100, collection day req.debitDay, contract reference req.policyNumber.
  throw new Error("Netcash DebiCheck live mode is not implemented yet. Unset NETCASH_DEBICHECK_SERVICE_KEY to use manual mode.");
}

/** Universal branch codes for the main SA banks. */
export const BANKS: Record<string, string> = {
  "Absa": "632005",
  "African Bank": "430000",
  "Capitec": "470010",
  "Discovery Bank": "679000",
  "FNB": "250655",
  "Investec": "580105",
  "Nedbank": "198765",
  "Standard Bank": "051001",
  "TymeBank": "678910",
};
