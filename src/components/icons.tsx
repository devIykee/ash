import {
  Bot,
  FileLock2,
  FileSearch,
  Gavel,
  HandCoins,
  Receipt,
  RefreshCcw,
  ScanEye,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

const TYPE_ICONS: Record<string, LucideIcon> = {
  payroll_run: Users,
  tip: HandCoins,
  api_request: Zap,
  data_exchange: FileLock2,
  audit_grant: ScanEye,
  subscription: RefreshCcw,
  memo_check: FileSearch,
  dispute_evidence: Gavel,
  agent: Bot,
  receipt: Receipt,
};

export function TypeIcon({ type, size = 17 }: { type: string; size?: number }) {
  const Icon = TYPE_ICONS[type] ?? Receipt;
  return <Icon size={size} aria-hidden="true" />;
}
