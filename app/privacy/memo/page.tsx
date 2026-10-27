import { GuideStart } from "@/components/guide-provider";
import { MemoStudio } from "@/components/memo-studio";
import { ConsequenceList, PageHeader } from "@/components/page-header";

export const metadata = { title: "Memo check" };

export default function MemoPage() {
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Privacy"
        title="Check a memo before you send it"
        lede="The check runs in this browser. Nothing in the memo box is posted unless you are on a tip receipt and you choose to include the note."
        actions={<GuideStart id="memo">Guide this check</GuideStart>}
      />
      <ConsequenceList
        items={[
          { title: "What it finds", body: "Patterns such as email addresses, phone numbers, and invoice references." },
          { title: "What a clear result means", body: "No pattern matched. That is not proof the memo is safe." },
          { title: "What gets stored", body: "Only if you save the counts: how many warnings, and how many you dismissed." },
        ]}
      />
      <MemoStudio />
    </div>
  );
}
