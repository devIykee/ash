import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { manuals } from "@/content/manuals";

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
  const source = manuals[slug];
  if (!source) notFound();
  return (
    <div className="stack docs">
      <p className="kicker">Documentation</p>
      <p className="lede">These pages keep the engineering names on purpose: schemas, payment rules, and cryptographic limits. The workspace uses plainer words for the same behavior.</p>
      <nav className="doc-nav" aria-label="Documents">
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
