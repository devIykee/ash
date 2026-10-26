import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { BIP39_ENGLISH } from "./bip39";

export const MEMO_RULES_VERSION = "ash-memo-1";

const WORD_SET = new Set(BIP39_ENGLISH);

export type Finding = {
  id: string;
  ruleId: string;
  severity: "high" | "medium" | "low";
  start: number;
  end: number;
  excerpt: string;
  reason: string;
};

export type LintResult = {
  rulesVersion: string;
  findings: Finding[];
  disclaimer: string;
};

type Span = { start: number; end: number };

function spans(memo: string, pattern: RegExp): Span[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const expression = new RegExp(pattern.source, flags);
  const found: Span[] = [];
  for (const match of memo.matchAll(expression)) {
    if (match.index === undefined || match[0].length === 0) continue;
    found.push({ start: match.index, end: match.index + match[0].length });
  }
  return found;
}

function findingId(ruleId: string, start: number, end: number, excerpt: string): string {
  return bytesToHex(sha256(utf8ToBytes(`${ruleId}|${start}|${end}|${excerpt}`))).slice(0, 16);
}

const RULES: {
  id: string;
  severity: Finding["severity"];
  reason: string;
  find: (memo: string) => Span[];
}[] = [
  {
    id: "email",
    severity: "high",
    reason: "An email address identifies a person or company to the memo recipient.",
    find: (memo) => spans(memo, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi),
  },
  {
    id: "phone",
    severity: "high",
    reason: "A phone number is a direct personal or business identifier.",
    find: (memo) => spans(memo, /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g),
  },
  {
    id: "url-tracker",
    severity: "medium",
    reason: "A URL with a query string can carry tracking identifiers or account tokens.",
    find: (memo) => spans(memo, /https?:\/\/[^\s]+(?:\?|&)[^\s]+/gi),
  },
  {
    id: "credential",
    severity: "high",
    reason: "This looks like a token, key, or authorization header. A memo is visible to the recipient.",
    find: (memo) =>
      spans(
        memo,
        /\b(?:sk_live|sk_test|rk_live|api[_-]?key|bearer|secret|token)[^\s]{0,8}[A-Za-z0-9_\-./+=]{8,}|\bAKIA[0-9A-Z]{16}\b/gi,
      ),
  },
  {
    id: "hex-token",
    severity: "medium",
    reason: "A long hexadecimal string may be a key, transaction-internal id, or account token.",
    find: (memo) => spans(memo, /\b[0-9a-fA-F]{32,}\b/g),
  },
  {
    id: "invoice",
    severity: "medium",
    reason: "Invoice and account references can tie this payment to a business relationship.",
    find: (memo) => spans(memo, /\b(?:inv(?:oice)?|acct|account|po|order)[\s#:_-]*[A-Z0-9][A-Z0-9-]{2,}\b/gi),
  },
  {
    id: "ticket",
    severity: "low",
    reason: "Ticket ids can point at an internal system the recipient should not learn about.",
    find: (memo) => spans(memo, /\b[A-Z][A-Z0-9]{1,9}-\d{1,6}\b/g),
  },
  {
    id: "named-party",
    severity: "low",
    reason: "A labeled personal name is optional context. The recipient can store it next to the payment.",
    find: (memo) => spans(memo, /\b(?:name|attn|attention|from|signed)\s*[:\-]\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g),
  },
];

function seedSpans(memo: string): Span[] {
  const words = [...memo.matchAll(/[a-z]+/g)];
  const found: Span[] = [];
  for (const size of [24, 12]) {
    for (let index = 0; index + size <= words.length; index += 1) {
      const window = words.slice(index, index + size);
      if (window.every((word) => WORD_SET.has(word[0].toLowerCase()))) {
        found.push({ start: window[0].index ?? 0, end: (window.at(-1)?.index ?? 0) + window[size - 1][0].length });
        index += size - 1;
      }
    }
  }
  return found;
}

export function analyzeMemo(memo: string, extraPatterns: { id: string; pattern: string; reason: string }[] = []): LintResult {
  const findings: Finding[] = [];
  const push = (ruleId: string, severity: Finding["severity"], reason: string, span: Span) => {
    const excerpt = memo.slice(span.start, span.end);
    findings.push({
      id: findingId(ruleId, span.start, span.end, excerpt),
      ruleId,
      severity,
      start: span.start,
      end: span.end,
      excerpt,
      reason,
    });
  };
  for (const rule of RULES) {
    for (const span of rule.find(memo)) push(rule.id, rule.severity, rule.reason, span);
  }
  for (const span of seedSpans(memo)) {
    push(
      "seed-phrase",
      "high",
      "These words match a BIP-39 seed phrase. A seed in a memo can spend funds. Remove it.",
      span,
    );
  }
  for (const extra of extraPatterns) {
    let expression: RegExp;
    try {
      expression = new RegExp(extra.pattern, "g");
    } catch {
      continue;
    }
    for (const span of spans(memo, expression)) push(extra.id || "custom", "medium", extra.reason, span);
  }
  findings.sort((a, b) => a.start - b.start || a.end - b.end);
  return {
    rulesVersion: MEMO_RULES_VERSION,
    findings,
    disclaimer:
      "This linter finds patterns. It misses sensitive meaning written without those patterns, and it can flag harmless text. It does not make a shielded memo private.",
  };
}

export function proposeCleanup(memo: string, findings: Finding[], dismissedIds: string[]): { proposal: string; removed: Finding[] } {
  const dismissed = new Set(dismissedIds);
  const active = findings.filter((finding) => !dismissed.has(finding.id));
  const removed = [...active].sort((a, b) => b.start - a.start);
  let proposal = memo;
  for (const finding of removed) {
    proposal = `${proposal.slice(0, finding.start)}[removed:${finding.ruleId}]${proposal.slice(finding.end)}`;
  }
  return { proposal, removed: removed.reverse() };
}
