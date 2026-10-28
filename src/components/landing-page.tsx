import Link from "next/link";
import type { Runtime } from "./runtime";
import { SiteHeader } from "./site-header";

function previewLine(runtime: Runtime): string {
  const network = runtime.network === "mainnet" ? "Zcash mainnet" : "Zcash testnet";
  return runtime.practice
    ? `Runs on ${network} settings with practice payments. Nothing is sent on the network.`
    : `Runs on ${network}. You pay from your own wallet, and ASH looks up the transaction id.`;
}

export function LandingPage({ signedIn, runtime }: { signedIn: boolean; runtime: Runtime }) {
  return (
    <div className="site">
      <SiteHeader signedIn={signedIn} />
      <main id="content">
        <section className="hero">
          <div className="split">
            <div className="hero-copy rise">
              <h1 className="display">Pay someone privately, then keep a short receipt.</h1>
              <p className="lede">You can also send a locked file, or show one payment to a reviewer. They only see that.</p>
              <div className="row">
                <Link className="button" href="/workspace">
                  {signedIn ? "Go to my workspace" : "Open ASH"}
                </Link>
                <a className="button quiet" href="#how">
                  How it works
                </a>
              </div>
              <p className="fine">{previewLine(runtime)}</p>
            </div>
            <figure className="stage rise rise-late" aria-label="Example of a private payment. Not a real payment.">
              <figcaption className="kicker">Example only. Not a real payment.</figcaption>
              <ol>
                <li>
                  <span className="n">1</span>
                  <span>
                    <strong>You write the payment</strong>
                    <br />
                    <small>Who it is for, the amount, and why.</small>
                  </span>
                  <small>Draft</small>
                </li>
                <li>
                  <span className="n">2</span>
                  <span>
                    <strong>ASH checks it</strong>
                    <br />
                    <small>You wait until the check finishes.</small>
                  </span>
                  <small>Checking</small>
                </li>
                <li>
                  <span className="n">3</span>
                  <span>
                    <strong>The task finishes</strong>
                    <br />
                    <small>The file opens, or the people are paid.</small>
                  </span>
                  <small>Done</small>
                </li>
                <li>
                  <span className="n">4</span>
                  <span>
                    <strong>You keep a receipt</strong>
                    <br />
                    <small>The amount and the reason. Nothing else.</small>
                  </span>
                  <small>Saved</small>
                </li>
              </ol>
            </figure>
          </div>
        </section>

        <section className="band" id="problem">
          <p className="kicker">Why</p>
          <div className="split">
            <h2>Show this payment. Not every payment.</h2>
            <p>Paying someone, buying a file, or proving one payment should not mean handing over your whole history.</p>
          </div>
        </section>

        <section className="band" id="how">
          <p className="kicker">How it works</p>
          <h2>Four steps.</h2>
          <ol className="steps">
            <li>
              <span className="n">1</span>
              <h3>Choose the task</h3>
              <p className="muted">A payment, a file, or a record to share.</p>
            </li>
            <li>
              <span className="n">2</span>
              <h3>Pay</h3>
              <p className="muted">ASH checks that the payment went through.</p>
            </li>
            <li>
              <span className="n">3</span>
              <h3>Finish</h3>
              <p className="muted">The file opens, or the receipt is ready.</p>
            </li>
            <li>
              <span className="n">4</span>
              <h3>Share only that</h3>
              <p className="muted">Not your other payments or files.</p>
            </li>
          </ol>
        </section>

        <section className="band" id="capabilities">
          <p className="kicker">What you can do</p>
          <h2>Three kinds of tasks.</h2>
          <div className="cap-grid">
            <article className="cap">
              <div>
                <h3>Pay</h3>
                <p className="muted">Send money for one reason, and keep a receipt.</p>
              </div>
              <ul>
                <li>
                  <strong>Pay a group of people.</strong>
                  <span className="muted">One list. If one payment fails, retry that person only.</span>
                </li>
                <li>
                  <strong>Receive a tip.</strong>
                  <span className="muted">Share a page. The receipt shows only what you include.</span>
                </li>
                <li>
                  <strong>Pay for one request.</strong>
                  <span className="muted">Pay once, then you get the result.</span>
                </li>
                <li>
                  <strong>Renew access.</strong>
                  <span className="muted">Each renewal is a new payment you approve.</span>
                </li>
              </ul>
            </article>
            <article className="cap">
              <div>
                <h3>Send a file</h3>
                <p className="muted">The other person opens it on their own device.</p>
              </div>
              <ul>
                <li>
                  <strong>Buy or sell a locked file.</strong>
                  <span className="muted">The file is locked in the browser before it is uploaded.</span>
                </li>
                <li>
                  <strong>Hand it over.</strong>
                  <span className="muted">The sender allows it, then the buyer pays. This is not an escrow service.</span>
                </li>
                <li>
                  <strong>Check the file.</strong>
                  <span className="muted">A fingerprint shows whether the file changed.</span>
                </li>
              </ul>
            </article>
            <article className="cap">
              <div>
                <h3>Choose what others see</h3>
                <p className="muted">Share one note, not the whole account.</p>
              </div>
              <ul>
                <li>
                  <strong>Let a reviewer read one note.</strong>
                  <span className="muted">You can take that note back. ASH does not hold a viewing key.</span>
                </li>
                <li>
                  <strong>Check a payment note.</strong>
                  <span className="muted">Look for private details before you send it. The note stays in this browser.</span>
                </li>
                <li>
                  <strong>Save a dispute record.</strong>
                  <span className="muted">It shows what ASH stored. It does not prove more than that.</span>
                </li>
              </ul>
            </article>
          </div>
        </section>

        <section className="band" id="privacy">
          <p className="kicker">Privacy</p>
          <h2>What is private, and what is not.</h2>
          <div className="compare">
            <article>
              <h3>Private</h3>
              <ul>
                <li>The payment can be private on Zcash.</li>
                <li>A locked file is opened by the recipient, not by ASH.</li>
                <li>A receipt lists only the fields you included.</li>
              </ul>
            </article>
            <article>
              <h3>Not private</h3>
              <ul>
                <li>Using the app can still be seen.</li>
                <li>People see what you choose to send them.</li>
                <li>ASH keeps a history of the actions on a task.</li>
                <li>After a file is opened, it can be copied.</li>
              </ul>
            </article>
          </div>
          <p className="fine">ASH is not fully anonymous. Practice payments are labeled. Seeing a transaction on the network does not prove the amount, the person, or the note.</p>
        </section>

        <section className="band closing">
          <h2>Open ASH and pick a task.</h2>
          <div className="row">
            <Link className="button" href="/workspace">
              Open ASH
            </Link>
            <Link className="button quiet" href="/docs">
              Read the docs
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
          <p className="fine">ASH is open source. The GitHub project is the contact.</p>
        </div>
      </footer>
    </div>
  );
}
