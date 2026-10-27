"use client";

import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { encryptPack } from "@/crypto/pack";
import { api, freshKey } from "@/client/api";
import { presentError } from "./labels";

export function OfferForm() {
  const router = useRouter();
  const [title, setTitle] = useState("Field notes");
  const [description, setDescription] = useState("A small encrypted file. The key stays in this browser.");
  const [price, setPrice] = useState("0.002");
  const [text, setText] = useState("Sample dataset\nrow,value\nalpha,1\n");
  const [error, setError] = useState("");
  const [backup, setBackup] = useState("");
  const [pending, setPending] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const bytes = utf8ToBytes(text);
      const encrypted = encryptPack(bytes);
      const created = await api<{ offer: { id: string } }>("/api/ash/offers", {
        body: {
          title,
          description,
          priceZec: price,
          plaintextSha256: encrypted.pack.plaintextSha256,
          pack: encrypted.pack,
        },
        idempotencyKey: freshKey("offer"),
      });
      const hex = bytesToHex(encrypted.key);
      localStorage.setItem(`ash-content-key:${created.offer.id}`, hex);
      setBackup(hex);
      router.push(`/commerce/offers/${created.offer.id}`);
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "We couldn't publish the file. The original text was not uploaded."));
    } finally {
      setPending(false);
    }
  }

  if (reviewing) {
    return (
      <form className="stack" onSubmit={submit}>
        <h2>Review before encrypting</h2>
        <p>
          <strong>{title}</strong> · {price} ZEC
        </p>
        <p>{description}</p>
        <p>The text is encrypted in this browser. The original is not uploaded. A file key is saved in this browser and shown once. Download or copy it if you need it later. Publishing does not collect a payment.</p>
        <div className="row">
          <button type="submit" disabled={pending}>
            {pending ? "Encrypting" : "Encrypt and publish"}
          </button>
          <button className="quiet" type="button" onClick={() => setReviewing(false)} disabled={pending}>
            Back
          </button>
        </div>
        {backup ? (
          <label>
            File key, shown once
            <textarea readOnly value={backup} />
          </label>
        ) : null}
        {error ? <p className="alert">{error}</p> : null}
      </form>
    );
  }

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
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
      <label data-guide="offer-file">
        File text
        <textarea value={text} onChange={(event) => setText(event.target.value)} required />
        <span className="field-hint">This stays on this device until you encrypt it. Browser storage is not a backup.</span>
      </label>
      <button type="submit" data-guide="offer-publish">
        Review and encrypt
      </button>
      {error ? <p className="alert">{error}</p> : null}
    </form>
  );
}
