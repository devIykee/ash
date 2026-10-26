import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";

const PAGES = [
  ["README", "README"],
  ["ARCHITECTURE", "Architecture"],
  ["THREAT_MODEL", "Threat model"],
  ["PRIVACY", "Privacy"],
  ["CRYPTOGRAPHY", "Cryptography"],
  ["ZCASH_INTEGRATION", "Zcash"],
  ["OPERATIONS", "Operations"],
  ["AGENT_API", "Agent API"],
  ["MODULES", "Modules"],
  ["DEPLOYMENT", "Deployment"],
  ["DEMO", "Demo"],
  ["CONTRIBUTING", "Contributing"],
  ["SUBMISSION", "Submission"],
] as const;

export default async function DocsPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const slug = (await params).slug?.[0] ?? "ARCHITECTURE";
  const known = PAGES.some(([id]) => id === slug);
  if (!known) notFound();
  const file = slug === "README" ? "README.md" : slug === "SUBMISSION" ? "SUBMISSION.md" : path.join("docs", `${slug}.md`);
  let source = "";
  try {
    source = await readFile(path.join(process.cwd(), file), "utf8");
  } catch {
    notFound();
  }
  return (
    <div className="stack docs">
      <p className="kicker">Documentation</p>
      <nav className="row" aria-label="Documents">
        {PAGES.map(([id, label]) => (
          <Link key={id} href={id === "ARCHITECTURE" ? "/docs" : `/docs/${id}`}>
            {label}
          </Link>
        ))}
      </nav>
      <Markdown source={source} />
    </div>
  );
}
