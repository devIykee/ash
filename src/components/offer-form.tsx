"use client";

import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { encryptPack, MAX_PLAINTEXT } from "@/crypto/pack";
import { api, freshKey } from "@/client/api";
import { storage } from "@/client/storage";
import { presentError } from "./labels";
import { useToast } from "./toast";
import { addressPlaceholder, sampleAddress, type Runtime } from "./runtime";
import { PayoutNotice } from "./payout-notice";

type Source = { kind: "text" } | { kind: "file"; name: string; bytes: Uint8Array };

function sizeLabel(bytes: number): string {
  return bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KiB`;
}

export function OfferForm({ runtime, payout = null }: { runtime: Runtime; payout?: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const fixture = sampleAddress(runtime);
  const [title, setTitle] = useState("Field notes");
  const [description, setDescription] = useState("A small encrypted file. The key stays in this browser.");
  const [price, setPrice] = useState("0.002");
  const [payTo, setPayTo] = useState(fixture);
  const [text, setText] = useState("Sample dataset\nrow,value\nalpha,1\n");
  const [source, setSource] = useState<Source>({ kind: "text" });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const payToRequired = false;

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    setError("");
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size === 0) {
      setError("That file is empty.");
      return;
    }
    if (file.size > MAX_PLAINTEXT) {
      setError(`Files are limited to ${sizeLabel(MAX_PLAINTEXT)} in this build. This one is ${sizeLabel(file.size)}.`);
      event.target.value = "";
      return;
    }
    setSource({ kind: "file", name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  }

  function plaintext(): Uint8Array {
    return source.kind === "file" ? source.bytes : utf8ToBytes(text);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const encrypted = encryptPack(plaintext());
      const created = await api<{ offer: { id: string } }>("/api/ash/offers", {
        body: {
          title,
          description,
          priceZec: price,
          payTo: runtime.practice ? payTo.trim() || undefined : undefined,
          fileName: source.kind === "file" ? source.name.slice(0, 120) : undefined,
          plaintextSha256: encrypted.pack.plaintextSha256,
          pack: encrypted.pack,
        },
        idempotencyKey: freshKey("offer"),
      });
      // Storage can be blocked. The offer page then explains how to keep the key.
      storage.set(`ash-content-key:${created.offer.id}`, bytesToHex(encrypted.key));
      toast("File encrypted and published.");
      router.push(`/commerce/offers/${created.offer.id}`);
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "We couldn't publish the file. The original was not uploaded."));
      setPending(false);
    }
  }

  if (reviewing) {
    return (
      <form className="stack" onSubmit={submit}>
        <h2>Review before encrypting</h2>
        <p>
          <strong>{title}</strong> · {price} ZEC · {source.kind === "file" ? `${source.name}, ${sizeLabel(source.bytes.length)}` : `${sizeLabel(utf8ToBytes(text).length)} of text`}
        </p>
        <p>{description}</p>
        {payTo ? <p className="mono muted address-line">Buyers pay {payTo}</p> : null}
        <p>The file is encrypted in this browser. The original is not uploaded. The file key is saved in this browser. Keep a copy from the next page if you may sell from another device. Publishing does not collect a payment.</p>
        <div className="row">
          <button type="submit" disabled={pending}>
            {pending ? "Encrypting" : "Encrypt and publish"}
          </button>
          <button className="quiet" type="button" onClick={() => setReviewing(false)} disabled={pending}>
            Back
          </button>
        </div>
        {error ? <p className="alert">{error}</p> : null}
      </form>
    );
  }

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (source.kind === "text" && !text.trim()) {
          setError("Add some text or choose a file.");
          return;
        }
        if (source.kind === "text" && utf8ToBytes(text).length > MAX_PLAINTEXT) {
          setError(`Text is limited to ${sizeLabel(MAX_PLAINTEXT)} in this build.`);
          return;
        }
        if (payToRequired && !payTo.trim()) {
          setError("Add the shielded address that receives the buyer's payment.");
          return;
        }
        setError("");
        setReviewing(true);
      }}
    >
      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={80} />
      </label>
      <label>
        What the buyer receives
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={600} />
      </label>
      <label data-guide="offer-price">
        Price in ZEC
        <input value={price} onChange={(event) => setPrice(event.target.value)} required inputMode="decimal" />
      </label>
      {runtime.practice ? null : <PayoutNotice runtime={runtime} payout={payout} />}
      <label hidden={!runtime.practice}>
        Shielded address that receives payment{payToRequired ? "" : " (optional)"}
        <input value={payTo} onChange={(event) => setPayTo(event.target.value.trim())} spellCheck={false} autoComplete="off" placeholder={addressPlaceholder(runtime)} required={payToRequired} />
        <span className="field-hint">
          {fixture && payTo === fixture
            ? "The sample address is an unfunded test fixture. Replace it before any real sale."
            : "Buyers get a wallet link to this address. ASH never holds the money."}
        </span>
      </label>
      <div className="stack" data-guide="offer-file">
        <label>
          File to sell, up to {sizeLabel(MAX_PLAINTEXT)}
          <input type="file" onChange={pick} />
        </label>
        {source.kind === "file" ? (
          <p className="row">
            <span>
              {source.name} · {sizeLabel(source.bytes.length)}
            </span>
            <button className="quiet small" type="button" onClick={() => setSource({ kind: "text" })}>
              Use text instead
            </button>
          </p>
        ) : (
          <label>
            Or type the file text
            <textarea value={text} onChange={(event) => setText(event.target.value)} />
          </label>
        )}
        <span className="field-hint">This stays on this device until you encrypt it. Browser storage is not a backup.</span>
      </div>
      <button type="submit" data-guide="offer-publish" disabled={!runtime.practice && !payout}>
        Review and encrypt
      </button>
      {error ? <p className="alert">{error}</p> : null}
    </form>
  );
}
