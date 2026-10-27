import { HelpCenter } from "@/components/help-center";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Help" };

export default function HelpPage() {
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Help"
        title="Find the next step"
        lede="Search the guides, the words on the screen, and what to do when a payment or delivery does not finish."
      />
      <HelpCenter />
    </div>
  );
}
