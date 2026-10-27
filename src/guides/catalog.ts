export type GuideStep = {
  id: string;
  title: string;
  body: string;
  href?: string;
  target?: string;
  fallbackHref?: string;
  fallbackLabel?: string;
};

export type Guide = {
  id: string;
  title: string;
  summary: string;
  startHref: string;
  steps: GuideStep[];
};

export const GUIDES: readonly Guide[] = [
  {
    id: "orient",
    title: "A quick look around",
    summary: "See where to start, how to enter the preview, and where help stays available.",
    startHref: "/workspace",
    steps: [
      {
        id: "start",
        title: "Start from the task",
        body: "Pick what you want to do in ordinary language. You do not have to learn the section names first.",
        href: "/workspace",
        target: "task-launcher",
      },
      {
        id: "account",
        title: "Choose a demo person",
        body: "This preview has no password. Avery pays people. Noor receives payments. Jules buys resources. Sam reviews records. Choose the person who matches the task.",
        href: "/workspace",
        target: "account-menu",
      },
      {
        id: "help",
        title: "Help stays open",
        body: "Open Help any time to restart a guide, read a status, or see what another person can view. A guide never sends a payment, shares a record, or changes access for you.",
        href: "/workspace",
        target: "help-link",
      },
    ],
  },
  {
    id: "payroll",
    title: "Pay a group of people",
    summary: "Check a batch, approve it, then record each payment. A failed line can be retried on its own.",
    startHref: "/payments/payroll/new",
    steps: [
      {
        id: "name",
        title: "Name the payment run",
        body: "Use a name you will recognize. People who can open the run can see it.",
        href: "/payments/payroll/new",
        target: "payroll-name",
        fallbackHref: "/payments/payroll",
        fallbackLabel: "Open payment runs",
      },
      {
        id: "people",
        title: "Add each person",
        body: "Each line needs a label, an amount in ZEC, and a shielded payment address. The sample addresses are test fixtures, not live wallets. ASH does not create an address for you.",
        href: "/payments/payroll/new",
        target: "payroll-lines",
      },
      {
        id: "review",
        title: "Review, then check",
        body: "Choose Review payment run. The summary shows the people, amounts, and addresses. Checking the batch saves a draft. It does not send money.",
        href: "/payments/payroll/new",
        target: "payroll-submit",
      },
      {
        id: "send",
        title: "Approve, then record payment",
        body: "On the saved run, Approve run only marks it ready. Record practice payments asks for a separate confirmation and does not broadcast. If one line fails, choose Retry this person. The others are not paid again.",
        href: "/payments/payroll",
        target: "payroll-list",
        fallbackHref: "/payments/payroll",
        fallbackLabel: "Open payment runs",
      },
    ],
  },
  {
    id: "tips",
    title: "Receive a private tip",
    summary: "Publish a tip page, share the payment link, and read a receipt that lists only the fields you included.",
    startHref: "/payments/tips/new",
    steps: [
      {
        id: "page",
        title: "Describe the page",
        body: "The title and note are what a visitor reads. Publishing the page does not collect money.",
        href: "/payments/tips/new",
        target: "tip-title",
        fallbackHref: "/payments/tips",
        fallbackLabel: "Open tip pages",
      },
      {
        id: "address",
        title: "Set the payment address",
        body: "Tips are requested to this shielded address. The sample address is an unfunded test fixture. Replace it with an address you control before any real use.",
        href: "/payments/tips/new",
        target: "tip-address",
      },
      {
        id: "publish",
        title: "Publish the page",
        body: "After publishing, open the page and share its link. The wallet link asks a wallet to pay. Opening the link does not pay, and ASH has not seen a transaction yet.",
        href: "/payments/tips/new",
        target: "tip-publish",
      },
      {
        id: "receipt",
        title: "Understand the receipt",
        body: "On a published page, choose an amount. The memo is optional. If you include it on the receipt, that text is stored with the receipt. A practice payment can create a receipt. The receipt says whether it is a practice record, a network observation, or unverified.",
        href: "/payments/tips",
        target: "tip-list",
        fallbackHref: "/payments/tips",
        fallbackLabel: "Open tip pages",
      },
    ],
  },
  {
    id: "api",
    title: "Pay for an API request",
    summary: "The research note is returned once, after the payment for that exact request is accepted.",
    startHref: "/agents",
    steps: [
      {
        id: "request",
        title: "Request the note",
        body: "Run one paid request. The first response asks for payment and does not include the note.",
        href: "/agents",
        target: "api-demo",
      },
      {
        id: "pay",
        title: "Pay that request only",
        body: "ASH records a payment for the request id it just issued. The same payment reference works once. If the check fails, the note is not returned and no second use of that reference is accepted.",
        href: "/agents",
        target: "api-demo",
      },
      {
        id: "result",
        title: "Read the result",
        body: "The note appears on this page after the payment is accepted. This button does not broadcast a Zcash transaction in practice mode. A wallet is not connected.",
        href: "/agents",
        target: "api-demo",
      },
    ],
  },
  {
    id: "exchange",
    title: "Buy or sell a private file",
    summary: "Encrypt a file in the browser, agree on delivery, then open it on the buyer's device.",
    startHref: "/commerce",
    steps: [
      {
        id: "find",
        title: "Find a file",
        body: "Open offers show the seller, a short description, and the price. If the list is empty, a seller can publish one. Buyers do not publish.",
        href: "/commerce",
        target: "offer-list",
      },
      {
        id: "terms",
        title: "Read the terms",
        body: "Open an offer to see the price, the encrypted size, and the fingerprint of the original file. Starting a purchase does not pay. It creates an encryption key in this browser.",
        href: "/commerce",
        target: "offer-list",
        fallbackHref: "/commerce/new",
        fallbackLabel: "Publish a file",
      },
      {
        id: "prepare",
        title: "Publish, or start a purchase",
        body: "Sellers encrypt the text in this browser before upload. The original text is not sent. The file key is shown once. Buyers use Start purchase on the offer. Payment comes later, after the seller allows delivery.",
        href: "/commerce/new",
        target: "offer-file",
        fallbackHref: "/commerce",
        fallbackLabel: "Back to offers",
      },
      {
        id: "finish",
        title: "Open the file",
        body: "After payment is accepted, the buyer uses Open and download. Opening happens on this device. Compare the file with the published fingerprint if you need to check that it was not altered. The finished exchange stays under Your exchanges.",
        href: "/commerce",
        target: "exchange-list",
      },
    ],
  },
  {
    id: "delivery",
    title: "If a file exchange fails",
    summary: "Delivery is a split file key, not an escrow service and not an automatic refund.",
    startHref: "/commerce",
    steps: [
      {
        id: "model",
        title: "What this exchange is",
        body: "The seller splits the file key into three parts. The buyer can open the file with two of them. ASH stores one part and the encrypted file. ASH cannot read the file. This does not hold the payment in escrow.",
        href: "/commerce",
        target: "offer-list",
      },
      {
        id: "seller",
        title: "The sender allows delivery",
        body: "On the exchange, the seller uses Allow delivery and may need to paste the file key saved at publish time. Until then, the buyer cannot pay.",
        href: "/commerce",
        target: "exchange-list",
        fallbackHref: "/commerce",
        fallbackLabel: "Open exchanges",
      },
      {
        id: "pay",
        title: "Payment still has to be accepted",
        body: "The buyer chooses Review practice payment, then confirms. That records a practice payment in this preview and does not broadcast. If it is not accepted, the file stays locked. ASH does not mark the payment confirmed before that check finishes.",
        href: "/commerce",
        target: "exchange-list",
      },
      {
        id: "fail",
        title: "Report a failed delivery",
        body: "If the file will not open after payment is accepted, the buyer can use Report failed delivery on that exchange. This does not reverse the payment.",
        href: "/commerce",
        target: "exchange-list",
        fallbackHref: "/operations",
        fallbackLabel: "Open activity",
      },
      {
        id: "recover",
        title: "Try the stored key part",
        body: "After a reported failure, Recover with the stored key part asks ASH for the part it stored. Opening still happens in this browser, and it still needs the part sealed for this device.",
        href: "/commerce",
        target: "exchange-list",
      },
      {
        id: "after",
        title: "Keep the record",
        body: "Mark finished when the file opened. If it did not, open the activity record and prepare an evidence package. The package describes what ASH stored. It does not prove a network transfer by itself.",
        href: "/operations",
        target: "operation-list",
      },
    ],
  },
  {
    id: "audit",
    title: "Share a limited financial record",
    summary: "Give a reviewer a written summary, or record the limits of a viewing-key disclosure.",
    startHref: "/privacy/grants",
    steps: [
      {
        id: "choice",
        title: "Choose what is shared",
        body: "A written summary is text you type. ASH can stop serving it later. The other choices record that a viewing key would reveal the whole account, not one date or one address. ASH rejects a pasted viewing key and does not store one.",
        href: "/privacy/grants",
        target: "grant-capability",
        fallbackHref: "/privacy/grants",
        fallbackLabel: "Open audit access",
      },
      {
        id: "scope",
        title: "Say what the review covers",
        body: "The note is the scope you claim. For a written summary, the report text is the information the reviewer can read.",
        href: "/privacy/grants",
        target: "grant-scope",
      },
      {
        id: "confirm",
        title: "Review the disclosure",
        body: "Create the record only after the confirmation shows the access type and whether ASH can withdraw it. Creating the record does not paste a key.",
        href: "/privacy/grants",
        target: "grant-submit",
      },
      {
        id: "later",
        title: "Stop access in ASH",
        body: "Withdraw access stops ASH from serving a written summary. If the record described a viewing key, withdrawing it does not erase a key the reviewer already holds.",
        href: "/privacy/grants",
        target: "grant-list",
      },
    ],
  },
  {
    id: "subscription",
    title: "Set up a recurring payment",
    summary: "Each period is a separate payment. ASH does not charge a wallet on a schedule.",
    startHref: "/payments/subscriptions",
    steps: [
      {
        id: "plan",
        title: "Read or publish a plan",
        body: "A plan has a price, a period, and a grace window. Publishing a plan does not charge anyone. The sample period is 30 days, with 3 days of grace.",
        href: "/payments/subscriptions",
        target: "plan-list",
      },
      {
        id: "join",
        title: "Start it yourself",
        body: "Review subscription asks you to confirm the price first. In this preview, that confirmation records a practice payment. It does not approve future periods.",
        href: "/payments/subscriptions",
        target: "plan-list",
      },
      {
        id: "renew",
        title: "Renew, refresh, or cancel",
        body: "Renew now is another explicit payment and asks for confirmation again. Check the period only looks at whether the current period has lapsed. Cancel future renewals stops later payments and keeps the record.",
        href: "/payments/subscriptions",
        target: "sub-list",
        fallbackHref: "/payments/subscriptions",
        fallbackLabel: "Open subscriptions",
      },
      {
        id: "grace",
        title: "What lapse looks like",
        body: "During grace, access remains and the status says so. After grace, access is paused. The history stays. Nothing is deleted.",
        href: "/payments/subscriptions",
        target: "sub-list",
      },
    ],
  },
  {
    id: "memo",
    title: "Check a transaction memo",
    summary: "Look for sensitive details before a memo leaves this browser.",
    startHref: "/privacy/memo",
    steps: [
      {
        id: "paste",
        title: "Paste the memo",
        body: "The text stays in this browser while you review it. Checking it does not create a payment.",
        href: "/privacy/memo",
        target: "memo-input",
      },
      {
        id: "findings",
        title: "Read the warnings",
        body: "ASH flags patterns such as email addresses, phone numbers, and invoice references. A clear result is not a privacy proof. You can dismiss a warning you believe is harmless.",
        href: "/privacy/memo",
        target: "memo-findings",
      },
      {
        id: "clean",
        title: "Preview a cleaner version",
        body: "Preview a cleaner memo shows a suggestion. Use this memo in the box replaces the text in this box only. It does not send the memo.",
        href: "/privacy/memo",
        target: "memo-actions",
      },
      {
        id: "record",
        title: "Save the counts, if you want",
        body: "Save the counts only stores how many warnings you saw and how many you dismissed. The memo itself is not in that request.",
        href: "/privacy/memo",
        target: "memo-actions",
      },
    ],
  },
  {
    id: "evidence",
    title: "Prepare evidence for a dispute",
    summary: "Seal what ASH stored about one activity. The package does not make a claim true.",
    startHref: "/operations",
    steps: [
      {
        id: "choose",
        title: "Open the activity",
        body: "Choose the payment, exchange, or other record you need to document. The package is built from that record.",
        href: "/operations",
        target: "operation-list",
      },
      {
        id: "contents",
        title: "See what will be included",
        body: "Open one activity from this list. Prepare evidence is on that record, not on this list. The package can include the status, the payment mode, a transaction reference, and the event list, including names and amounts already stored.",
        href: "/operations",
        target: "operation-list",
        fallbackHref: "/operations/verify",
        fallbackLabel: "Check a package",
      },
      {
        id: "seal",
        title: "Prepare the package on the activity",
        body: "Prepare evidence shows the package on that activity. Prepare a package for a reviewer creates a key in this browser and encrypts the package to it. ASH does not keep that private key. Copy it before you leave. Neither button sends the package.",
        href: "/operations",
        target: "operation-list",
      },
      {
        id: "check",
        title: "Check a package later",
        body: "Paste the package here. A matching signature means these bytes were sealed together. An encrypted package opens in this browser only if you paste the reviewer key. A valid signature is not proof that a payment happened on the network.",
        href: "/operations/verify",
        target: "evidence-verify",
      },
    ],
  },
  {
    id: "agent",
    title: "Connect an AI agent",
    summary: "Create a limited token for software that calls ASH. The secret is shown once.",
    startHref: "/agents",
    steps: [
      {
        id: "who",
        title: "Use the paying account",
        body: "Only Avery can create a token in this preview. The form asks for a name and a spending limit. Review token does not create it until you confirm. The token can read, pay, and exchange, up to that limit.",
        href: "/agents",
        target: "agent-form",
        fallbackHref: "/agents",
        fallbackLabel: "Open agents",
      },
      {
        id: "secret",
        title: "Copy the secret once",
        body: "Creating a token asks you to confirm the limit first. The secret is shown once. ASH stores only a hash. Leaving the page hides the secret, and it cannot be shown again.",
        href: "/agents",
        target: "agent-form",
      },
      {
        id: "limits",
        title: "Know what it cannot do",
        body: "An agent can act inside its spending limit. It cannot approve a contractor payment run. Revoke token stops it immediately. Revoking does not undo a payment it already made.",
        href: "/agents",
        target: "agent-list",
        fallbackHref: "/agents",
        fallbackLabel: "Open agents",
      },
      {
        id: "demo",
        title: "Run the included demo",
        body: "The demo script is pnpm agent:demo, and ASH must already be running. The script follows the paid-request flow. It is not a model that decides to pay.",
        href: "/agents",
        target: "api-demo",
      },
    ],
  },
];

const REQUIRED = ["payroll", "tips", "api", "exchange", "delivery", "audit", "subscription", "memo", "evidence", "agent"] as const;

export function getGuide(id: string): Guide | undefined {
  return GUIDES.find((guide) => guide.id === id);
}

export function requiredGuideIds(): readonly string[] {
  return REQUIRED;
}
