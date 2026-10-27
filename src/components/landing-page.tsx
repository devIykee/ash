import Link from "next/link";
import { SiteHeader } from "./site-header";

export function LandingPage({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="site">
      <SiteHeader signedIn={signedIn} />
      <main id="content">
        <section className="hero">
          <div className="split">
            <div className="hero-copy rise">
              <p className="kicker">ASH</p>
              <h1 className="display">Private payments. Clear outcomes.</h1>
              <p className="lede">ASH helps people and AI agents pay, exchange digital resources, and verify what happened without exposing more information than necessary.</p>
              <div className="row">
                <Link className="button" href="/workspace">
                  Explore ASH
                </Link>
                <a className="button quiet" href="#how">
                  How it works
                </a>
              </div>
              <p className="fine">This preview speaks in Zcash testnet terms and records practice payments. It does not broadcast a transaction, and it does not show a payment as confirmed before its own check finishes.</p>
            </div>
            <figure className="stage rise rise-late" aria-label="Illustrative example of a private payment">
              <figcaption className="kicker">Illustrative example. Not a live payment.</figcaption>
              <ol>
                <li>
                  <span className="n">1</span>
                  <span>
                    <strong>Payment prepared</strong>
                    <br />
                    <small>0.01 ZEC to a contractor, with the purpose written down.</small>
                  </span>
                  <small>Draft</small>
                </li>
                <li>
                  <span className="n">2</span>
                  <span>
                    <strong>Payment checked</strong>
                    <br />
                    <small>ASH waits until the payment record is accepted.</small>
                  </span>
                  <small>Checking</small>
                </li>
                <li>
                  <span className="n">3</span>
                  <span>
                    <strong>Task completed</strong>
                    <br />
                    <small>The file opens, or the payment run finishes.</small>
                  </span>
                  <small>Done</small>
                </li>
                <li>
                  <span className="n">4</span>
                  <span>
                    <strong>Short receipt</strong>
                    <br />
                    <small>Amount, purpose, and what was shared. Nothing else.</small>
                  </span>
                  <small>Kept</small>
                </li>
              </ol>
            </figure>
          </div>
        </section>

        <section className="band" id="problem">
          <p className="kicker">The problem</p>
          <div className="split">
            <h2>The other person needs the outcome, not your whole history.</h2>
            <div className="stack">
              <p>People send money, buy a file, pay for a service, or show that a payment happened. Doing that should not require exposing unrelated activity, or handing over access the other party does not need.</p>
              <p className="muted">A public payment trail can reveal more than the one transfer. A password, a full account view, or an exported wallet history can do the same. ASH keeps one task in one record.</p>
            </div>
          </div>
        </section>

        <section className="band" id="how">
          <p className="kicker">How ASH works</p>
          <h2>Four steps, then a record you can explain.</h2>
          <ol className="steps">
            <li>
              <span className="n">1</span>
              <h3>Set up the task</h3>
              <p className="muted">Choose what you want to pay for, exchange, or verify.</p>
            </li>
            <li>
              <span className="n">2</span>
              <h3>Make the payment</h3>
              <p className="muted">Use the Zcash payment flow this preview supports. Practice mode records it without broadcasting.</p>
            </li>
            <li>
              <span className="n">3</span>
              <h3>Complete the task</h3>
              <p className="muted">ASH checks the payment record, then the delivery or the access change.</p>
            </li>
            <li>
              <span className="n">4</span>
              <h3>Keep the details private</h3>
              <p className="muted">Share the receipt, the file, or the summary needed for the next step.</p>
            </li>
          </ol>
        </section>

        <section className="band" id="capabilities">
          <p className="kicker">What you can do</p>
          <h2>Start from the job, not from a list of modules.</h2>
          <div className="cap-grid">
            <article className="cap">
              <div>
                <h3>Pay privately</h3>
                <p className="muted">Move money for a clear purpose, then keep a receipt of that purpose.</p>
              </div>
              <ul>
                <li>
                  <strong>Pay a group of contractors.</strong>
                  <span className="muted">Check the batch, approve it, then record each payment. A failed line can be retried on its own.</span>
                </li>
                <li>
                  <strong>Receive tips.</strong>
                  <span className="muted">Publish a page and a wallet request. The receipt lists only the fields you included.</span>
                </li>
                <li>
                  <strong>Pay for one request.</strong>
                  <span className="muted">A research note is returned once, after that request’s payment is accepted.</span>
                </li>
                <li>
                  <strong>Renew a subscription.</strong>
                  <span className="muted">Each period is a separate payment. ASH does not charge a wallet on a schedule.</span>
                </li>
              </ul>
            </article>
            <article className="cap">
              <div>
                <h3>Exchange digital resources</h3>
                <p className="muted">Send a file that the recipient opens on their own device.</p>
              </div>
              <ul>
                <li>
                  <strong>Buy or sell an encrypted file.</strong>
                  <span className="muted">Encryption happens in the browser before upload. The server stores ciphertext.</span>
                </li>
                <li>
                  <strong>Exchange with another person.</strong>
                  <span className="muted">The sender allows delivery, then the buyer pays. This is not an escrow service.</span>
                </li>
                <li>
                  <strong>Check the file afterward.</strong>
                  <span className="muted">A fingerprint helps you see whether the opened file matches what was published.</span>
                </li>
              </ul>
            </article>
            <article className="cap">
              <div>
                <h3>Control what others can see</h3>
                <p className="muted">Share a narrow record, and say plainly what that record does not prove.</p>
              </div>
              <ul>
                <li>
                  <strong>Give a reviewer limited access.</strong>
                  <span className="muted">A written summary can be withdrawn in ASH. A viewing-key disclosure cannot be narrowed to one date, and ASH does not hold the key.</span>
                </li>
                <li>
                  <strong>Check a memo.</strong>
                  <span className="muted">Warnings run in the browser. The memo is not uploaded with the check.</span>
                </li>
                <li>
                  <strong>Prepare evidence.</strong>
                  <span className="muted">A signed package describes what ASH stored. It does not turn an unverified claim into a fact.</span>
                </li>
              </ul>
            </article>
          </div>
        </section>

        <section className="band" id="privacy">
          <p className="kicker">Privacy and trust</p>
          <h2>Private where the payment network allows it. Limited everywhere else.</h2>
          <div className="compare">
            <article>
              <h3>What ASH uses</h3>
              <ul>
                <li>Shielded Zcash payment instructions, where the flow supports them.</li>
                <li>Files encrypted before they leave the sender’s browser, then opened on the recipient’s device.</li>
                <li>Receipts and evidence that list the fields someone chose to include.</li>
              </ul>
            </article>
            <article>
              <h3>What it does not do</h3>
              <ul>
                <li>Payment privacy does not hide every detail of using ASH.</li>
                <li>Other people still see what you deliberately share.</li>
                <li>ASH may process transaction references and operational records.</li>
                <li>Someone who decrypts a file can copy it. Encryption does not prevent that.</li>
              </ul>
            </article>
          </div>
          <p className="fine">ASH does not provide perfect anonymity, total secrecy, or protection from every form of tracking. Practice payments are labeled. A transaction id seen on the network is not proof of the amount, the recipient, or the memo.</p>
        </section>

        <section className="band closing">
          <h2>Open the workspace and start a real task.</h2>
          <div className="row">
            <Link className="button" href="/workspace">
              Explore ASH
            </Link>
            <Link className="button quiet" href="/docs">
              Read the documentation
            </Link>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="site-inner">
          <nav className="footer-links" aria-label="Footer">
            <Link href="/workspace">Product</Link>
            <Link href="/docs">Documentation</Link>
            <Link href="/docs/PRIVACY">Privacy</Link>
            <Link href="/docs/THREAT_MODEL">Security</Link>
            <a href="https://github.com/devIykee/ash">GitHub</a>
            <Link href="/docs/CONTRIBUTING">Project</Link>
          </nav>
          <p className="fine">ASH is open source. No contact address is configured beyond the project repository.</p>
        </div>
      </footer>
    </div>
  );
}
