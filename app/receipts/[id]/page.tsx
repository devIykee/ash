import { notFound } from "next/navigation";
import { receiptFieldLabel, verificationLabel } from "@/components/labels";
import { PageHeader } from "@/components/page-header";
import { AshError } from "@/domain/errors";
import { zatoshiToZec } from "@/domain/money";
import { checkReceipt, getReceipt } from "@/services/tips";
import { getStore } from "@/server/store";

export const metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const receipt = await getStore().transaction((tx) => getReceipt(tx, id));
    const verdict = checkReceipt(receipt);
    const { publicKey, signature, ...body } = receipt;
    return (
      <div className="stack">
        <PageHeader
          eyebrow="Receipt"
          title={`${zatoshiToZec(BigInt(receipt.amountZatoshi))} ZEC`}
          lede="This receipt lists the fields that were approved. One ZEC is 100,000,000 zatoshis."
        />
        <p className="banner">{verdict.valid ? verdict.reason : "This receipt failed its signature check."}</p>
        <p>{verificationLabel(receipt.verificationLevel)}</p>
        <dl className="panel receipt">
          {Object.entries(body).map(([field, value]) => (
            <div key={field}>
              <dt className="kicker">{receiptFieldLabel(field)}</dt>
              <dd>{value === null ? "Left off this receipt" : Array.isArray(value) ? value.join(", ") : String(value)}</dd>
            </div>
          ))}
        </dl>
        <p className="muted">The signature key is public. A viewing key is not part of this receipt. A third party can check the signature, and still has to trust ASH for what the check level claims.</p>
        <p className="mono">{publicKey}</p>
        <p className="mono">{signature}</p>
      </div>
    );
  } catch (error) {
    if (error instanceof AshError && (error.status === 404 || error.status === 409)) notFound();
    throw error;
  }
}
