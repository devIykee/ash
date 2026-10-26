import { EvidenceVerify } from "@/components/evidence-desk";

export default function VerifyPage() {
  return (
    <div className="stack">
      <p className="kicker">Evidence</p>
      <h1>Verify a package</h1>
      <p className="lede">A valid signature means these bytes were sealed together. It does not prove a payment, a file, or that the event log was never rewritten by the signing operator.</p>
      <EvidenceVerify />
    </div>
  );
}
