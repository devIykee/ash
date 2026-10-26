"use client";

import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { encryptPack } from "@/crypto/pack";
import { api, freshKey } from "@/client/api";

export function OfferForm() {
  const router = useRouter();
  const [title, setTitle] = useState("Field notes");
  const [description, setDescription] = useState("A small encrypted file. The key stays in this browser.");
  const [price, setPrice] = useState("0.002");
  const [text, setText] = useState("Sample dataset\nrow,value\nalpha,1\n");
  const [error, setError] = useState("");
  const [backup, setBackup] = useState("");
  const [pending, setPending] = useState(false);

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
      setError(caught instanceof Error ? caught.message : "Could not publish.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={80} />
      </label>
      <label>
        Description
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={600} />
      </label>
      <label>
        Price in ZEC
        <input value={price} onChange={(event) => setPrice(event.target.value)} required />
      </label>
      <label>
        File text, encrypted in this browser before upload
        <textarea value={text} onChange={(event) => setText(event.target.value)} required />
      </label>
      <p className="muted">Plaintext is not uploaded. Browser storage is not a filesystem backup. Download the key if you need it later.</p>
      <button type="submit" disabled={pending}>
        {pending ? "Encrypting" : "Publish encrypted offer"}
      </button>
      {backup ? (
        <label>
          Content key, shown once
          <textarea readOnly value={backup} />
        </label>
      ) : null}
      {error ? <p className="alert">{error}</p> : null}
    </form>
  );
}
