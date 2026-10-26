import { notFound } from "next/navigation";
import { AshError } from "@/domain/errors";
import { zatoshiToZec } from "@/domain/money";
import { checkReceipt, getReceipt } from "@/services/tips";
import { getStore } from "@/server/store";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const receipt = await getStore().transaction((tx) => getReceipt(tx, id));
    const verdict = checkReceipt(receipt);
    const { publicKey, signature, ...body } = receipt;
    return (
      <div className="stack">
        <p className="kicker">Receipt</p>
        <h1>{zatoshiToZec(BigInt(receipt.amountZatoshi))} ZEC</h1>
        <p className="banner">{verdict.valid ? verdict.reason : "This receipt failed verification."}</p>
        <p className="mono">Level {receipt.verificationLevel}</p>
        <dl className="panel">
          {Object.entries(body).map(([field, value]) => (
            <div key={field}>
              <dt className="kicker">{field}</dt>
              <dd>{value === null ? "omitted" : String(value)}</dd>
            </div>
          ))}
        </dl>
        <p className="muted">Signature key {publicKey}</p>
        <p className="mono">{signature}</p>
        <p className="muted">A viewing key is not part of this format. A third party can check the signature against the public key. They still rely on ASH for what the verification level claims.</p>
      </div>
    );
  } catch (error) {
    if (error instanceof AshError && (error.status === 404 || error.status === 409)) notFound();
    throw error;
  }
}
