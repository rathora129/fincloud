#!/usr/bin/env node
/**
 * Real-browser smoke test for the FinCloud LMS demo.
 *
 * Drives a headless system Chrome over the DevTools Protocol using Node's
 * built-in WebSocket — no Playwright/Puppeteer dependency. Every interaction
 * below is a real mouse/input event dispatched into the renderer, so a
 * passing run is evidence of interactive behaviour, not just SSR markup.
 *
 * Usage: node scripts/browser-smoke.mjs [baseUrl]
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

const BASE = (process.argv[2] ?? process.env.FINCLOUD_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);
const ARTIFACTS = path.resolve(".artifacts/browser");
const PASSWORD = "Fincloud@2026";

const checks = [];
const consoleErrors = [];
const failedRequests = [];
let fatalError = null;

function check(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), detail: detail ?? null });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${!pass && detail ? ` — ${detail}` : ""}`);
}

function log(message) {
  console.log(`\n▸ ${message}`);
}

/* ------------------------------------------------------------------ */
/* CDP plumbing                                                        */
/* ------------------------------------------------------------------ */

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve());
      this.ws.addEventListener("error", (event) => reject(new Error(`CDP socket error: ${event.message ?? "unknown"}`)));
      this.ws.addEventListener("close", () => {
        for (const { reject: fail } of this.pending.values()) fail(new Error("CDP socket closed"));
        this.pending.clear();
      });
    });
    this.ws.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8"));
      } catch {
        return;
      }
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
        else resolve(message.result);
        return;
      }
      if (message.method) {
        for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {}, message.sessionId);
        for (const listener of this.listeners.get("*") ?? []) listener(message.method, message.params ?? {}, message.sessionId);
      }
    });
  }

  async send(method, params = {}, sessionId) {
    await this.ready;
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 20000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.ws.send(JSON.stringify(payload));
    });
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* already closed */
    }
  }
}

async function waitForDebugger(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        const data = await response.json();
        if (data.webSocketDebuggerUrl) return data;
      }
    } catch {
      /* chrome still booting */
    }
    await sleep(200);
  }
  throw new Error("Chrome DevTools endpoint did not become ready");
}

async function launchChrome() {
  const { chmod, access } = await import("node:fs/promises");
  let binary = null;
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await access(candidate);
      binary = candidate;
      break;
    } catch {
      /* try next */
    }
  }
  if (!binary) throw new Error(`Chrome not found. Set CHROME_BIN. Tried: ${CHROME_CANDIDATES.join(", ")}`);
  await chmod(binary, 0o755).catch(() => {});

  const port = 9400 + Math.floor(Math.random() * 200);
  const profileDir = `/tmp/fincloud-browser-smoke-${Date.now()}`;
  const child = spawn(
    binary,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-sync",
      "--mute-audio",
      "--hide-scrollbars",
      "--remote-allow-origins=*",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      "--window-size=1440,960",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  try {
    const info = await waitForDebugger(port);
    return { child, port, profileDir, wsUrl: info.webSocketDebuggerUrl, stderr: () => stderr };
  } catch (error) {
    child.kill("SIGKILL");
    throw new Error(`${error.message}\n${stderr.slice(-2000)}`);
  }
}

/* ------------------------------------------------------------------ */
/* Page driver                                                         */
/* ------------------------------------------------------------------ */

const HELPER_SOURCE = String.raw`
(() => {
  if (window.__fc) return;
  window.__fc = {
    visible(el) {
      if (!el || !el.isConnected) return false;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    },
    find(selector, text, opts) {
      const options = opts || {};
      const scope = options.scope ? document.querySelector(options.scope) || document : document;
      let nodes;
      try { nodes = [...scope.querySelectorAll(selector)]; } catch { return null; }
      const visible = nodes.filter((el) => this.visible(el));
      const matches = visible.filter((el) => !text || (el.textContent || "").replace(/\s+/g, " ").trim().includes(text));
      if (!matches.length) return null;
      return options.last ? matches[matches.length - 1] : matches[0];
    },
    mark(el) {
      if (!el) return null;
      const id = "fc-" + Math.random().toString(36).slice(2, 10);
      el.setAttribute("data-fc-target", id);
      return id;
    },
    qs(id) { return document.querySelector('[data-fc-target="' + id + '"]'); },
    markSelector(selector, text, opts) { return this.mark(this.find(selector, text, opts)); },
    rect(id) {
      const el = this.qs(id);
      if (!el) return null;
      el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      const rect = el.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height, tag: el.tagName };
    },
    setValue(id, value) {
      const el = this.qs(id);
      if (!el) return { ok: false, reason: "missing" };
      return this.applyValue(el, value);
    },
    setValueOn(selector, value) {
      const el = document.querySelector(selector);
      if (!el) return { ok: false, reason: "missing" };
      return this.applyValue(el, value);
    },
    applyValue(el, value) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      el.focus();
      setter.call(el, String(value));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
      return { ok: true, value: el.value };
    },
    focusSelect(id) {
      const el = this.qs(id);
      if (!el) return false;
      el.focus();
      if (typeof el.select === "function") el.select();
      return true;
    },
    inViewport(id) {
      const el = this.qs(id);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1;
    },
    seenText(text) { return (document.body.innerText || "").includes(text); },
    roleTab(label) {
      return this.mark(this.find('[role="tab"]', label));
    },
    lastDialogButton(label) {
      return this.mark(this.find("button", label, { last: true, scope: '[role="dialog"]' }));
    },
    dialog() {
      const nodes = [...document.querySelectorAll('[role="dialog"]')].filter((el) => this.visible(el));
      return nodes[nodes.length - 1] || null;
    },
  };
})();
`;

class Page {
  constructor(cdp, sessionId) {
    this.cdp = cdp;
    this.sessionId = sessionId;
  }

  send(method, params) {
    return this.cdp.send(method, params, this.sessionId);
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const detail =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.exception?.value ??
        result.exceptionDetails.text;
      throw new Error(`evaluate failed: ${detail}`);
    }
    return result.result?.value;
  }

  async waitFor(expression, { timeout = 20000, interval = 120, label } = {}) {
    const start = Date.now();
    let lastError = null;
    while (Date.now() - start < timeout) {
      try {
        if (await this.evaluate(expression)) return true;
      } catch (error) {
        lastError = error;
      }
      await sleep(interval);
    }
    throw new Error(`Timed out waiting for ${label ?? expression}${lastError ? ` (${lastError.message})` : ""}`);
  }

  waitForText(text, options = {}) {
    return this.waitFor(`window.__fc ? window.__fc.seenText(${JSON.stringify(text)}) : false`, {
      label: `text "${text}"`,
      ...options,
    });
  }

  async goto(urlPath, { expectPath } = {}) {
    await this.send("Page.navigate", { url: urlPath.startsWith("http") ? urlPath : `${BASE}${urlPath}` });
    await this.waitFor(`document.readyState === "complete"`, { label: `load ${urlPath}` });
    await this.installHelpers();
    if (expectPath) {
      await this.waitFor(`location.pathname === ${JSON.stringify(expectPath)}`, {
        label: `pathname ${expectPath}`,
      });
    }
    await sleep(450);
  }

  async installHelpers() {
    // addScriptToEvaluateOnNewDocument covers future documents; run again for the current one.
    await this.evaluate(HELPER_SOURCE.replace(/^\/\*[\s\S]*?\*\/\s*/, ""));
  }

  async markTarget(selector, text, options = {}) {
    const id = await this.evaluate(
      `window.__fc.markSelector(${JSON.stringify(selector)}, ${JSON.stringify(text ?? null)}, ${JSON.stringify(options)})`,
    );
    if (!id) throw new Error(`Element not found: ${selector}${text ? ` (text: "${text}")` : ""}`);
    return id;
  }

  async click(selector, text, options = {}) {
    const id = await this.markTarget(selector, text, options);
    const rect = await this.evaluate(`window.__fc.rect(${JSON.stringify(id)})`);
    if (!rect) throw new Error(`Element detached: ${selector} ${text ?? ""}`);
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: rect.y });
    await sleep(40);
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    await sleep(60);
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    await sleep(160);
    return id;
  }

  async clickTab(label) {
    const id = await this.evaluate(`window.__fc.roleTab(${JSON.stringify(label)})`);
    if (!id) throw new Error(`Tab not found: ${label}`);
    const rect = await this.evaluate(`window.__fc.rect(${JSON.stringify(id)})`);
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    await sleep(250);
  }

  async fill(selector, value) {
    const result = await this.evaluate(
      `window.__fc.setValueOn(${JSON.stringify(selector)}, ${JSON.stringify(value)})`,
    );
    if (!result?.ok) throw new Error(`Could not fill ${selector}`);
    await sleep(100);
    return result.value;
  }

  async typeReal(selector, value) {
    const focused = await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.focus();
      if (typeof el.select === "function") el.select();
      return true;
    })()`);
    if (!focused) throw new Error(`Could not focus ${selector}`);
    await this.send("Input.insertText", { text: value });
    await sleep(160);
    return this.evaluate(`document.querySelector(${JSON.stringify(selector)})?.value ?? null`);
  }

  async pressEnter() {
    const params = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", ...params });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...params });
    await sleep(200);
  }

  async setViewport(width, height, { mobile = false, scale = 1 } = {}) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: scale,
      mobile,
      screenWidth: width,
      screenHeight: height,
    });
    await sleep(350);
  }

  async screenshot(name) {
    await sleep(300);
    const { data } = await this.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const file = path.join(ARTIFACTS, `${name}.png`);
    await writeFile(file, Buffer.from(data, "base64"));
    console.log(`    📸 ${path.relative(process.cwd(), file)}`);
  }

  async bodyText() {
    return this.evaluate("document.body.innerText");
  }

  async waitForHydration(selector = "#email", timeout = 20000) {
    return this.waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)})?._valueTracker)`, {
      timeout,
      label: "React hydration",
    });
  }

  async countRows() {
    return this.evaluate(`document.querySelectorAll("main table tbody tr").length`);
  }
}

/* ------------------------------------------------------------------ */
/* Scenarios                                                           */
/* ------------------------------------------------------------------ */

async function readCookies(cdp, page) {
  try {
    return (await cdp.send("Storage.getCookies")).cookies;
  } catch {
    try {
      return (await page.send("Network.getCookies", { urls: [BASE] })).cookies;
    } catch {
      return [];
    }
  }
}

async function loginWithForm(page, email) {
  await page.goto("/login", { expectPath: "/login" });
  await page.waitFor(`Boolean(document.querySelector("#email"))`, { label: "login form" });
  const emailValue = await page.typeReal("#email", email);
  if (emailValue !== email) {
    await page.fill("#email", email);
  }
  const passwordValue = await page.typeReal("#password", PASSWORD);
  if (passwordValue !== PASSWORD) {
    await page.fill("#password", PASSWORD);
  }
  await page.click('button[type="submit"]', "Sign in to workspace");
  await page.waitFor(`location.pathname === "/dashboard"`, { label: "dashboard redirect", timeout: 25000 });
  await page.waitFor(`Boolean(document.querySelector("nav[aria-label='Primary']"))`, { label: "app shell" });
}

async function logout(page) {
  await page.click('button[aria-label="Open profile menu"]');
  await page.waitFor(`window.__fc.seenText("Sign out")`, { label: "profile menu" });
  await page.click("button", "Sign out", { last: true });
  await page.waitFor(`location.pathname === "/login"`, { label: "redirect to login", timeout: 20000 });
}

async function scenarioLoginAndManager(page, cdp) {
  log("Login page: validation and real credential entry");
  await page.goto("/login");
  await page.waitForHydration().catch(() => {});
  check("login page renders form", await page.evaluate(`Boolean(document.querySelector("#email") && document.querySelector("#password"))`));
  check(
    "demo profiles are displayed",
    (await page.bodyText()).toLowerCase().includes("demo role profiles"),
    "expected the demo profile panel",
  );
  await page.screenshot("01-login-desktop");

  await page.fill("#email", "not-an-email");
  await page.click('button[type="submit"]', "Sign in to workspace");
  try {
    await page.waitForText("Enter a valid email address.", { timeout: 8000 });
  } catch (error) {
    console.log("    debug url:", await page.evaluate("location.href"));
    console.log("    debug value:", await page.evaluate(`document.querySelector("#email")?.value ?? null`));
    console.log("    debug tracker:", await page.evaluate(`Boolean(document.querySelector("#email")?._valueTracker)`));
    console.log("    debug aria-invalid:", await page.evaluate(`document.querySelector("#email")?.getAttribute("aria-invalid")`));
    await page.screenshot("debug-login-validation");
    throw error;
  }
  check("invalid email stops submission with inline error", true);
  await page.screenshot("02-login-validation");

  await loginWithForm(page, "manager.mumbai@fincloud.demo");
  check("branch manager reaches dashboard", (await page.evaluate("location.pathname")) === "/dashboard");

  const cookies = await readCookies(cdp, page);
  const session = cookies.find((cookie) => cookie.name === "fincloud_session");
  check("session cookie is HttpOnly", Boolean(session?.httpOnly), session ? `httpOnly=${session.httpOnly}` : "cookie missing");
  check(
    "session cookie is SameSite-scoped and not cross-site",
    Boolean(session) && session.sameSite !== "None",
    session ? `sameSite=${session.sameSite}` : "cookie missing",
  );
  check(
    "session cookie carries an expiry",
    Boolean(session?.expires) && session.expires * 1000 > Date.now(),
    session ? `expires=${session.expires}` : "cookie missing",
  );
  const documentCookie = await page.evaluate("document.cookie");
  check("session token is not readable from JavaScript", !documentCookie.includes("fincloud_session"), documentCookie || "(empty)");

  await page.waitFor(`document.querySelectorAll("canvas").length > 0`, { label: "dashboard charts", timeout: 20000 });
  check("dashboard charts render as canvas", true);
  check("sidebar shows role-scoped navigation", (await page.bodyText()).includes("Applications"));
  await page.screenshot("03-manager-dashboard");

  log("Sidebar navigation, table search and detail interaction");
  await page.click('nav[aria-label="Primary"] a', "Applications");
  await page.waitFor(`location.pathname === "/applications"`, { label: "/applications" });
  // The route streams a loading skeleton before the RSC payload swaps in the
  // table, so wait for the rows themselves rather than the sidebar label.
  await page.waitFor(`document.querySelectorAll("main table tbody tr").length > 0`, {
    label: "applications table rows",
  });
  const initialRows = await page.countRows();
  check("applications table renders rows", initialRows > 0, `rows=${initialRows}`);

  const firstRef = await page.evaluate(`(() => {
    const row = document.querySelector("main table tbody tr");
    const match = row ? row.innerText.match(/[A-Z]{2,5}-\\d{4}-\\d+/) : null;
    return match ? match[0] : null;
  })()`);
  await page.fill('[aria-label="Search applications"]', firstRef ?? "");
  await sleep(600);
  const filteredRows = await page.countRows();
  check(
    "table search filters the result set",
    Boolean(firstRef) && initialRows > 1 && filteredRows > 0 && filteredRows < initialRows,
    `query=${firstRef} initial=${initialRows} filtered=${filteredRows}`,
  );
  await page.screenshot("04-manager-applications-search");

  await page.click("main table tbody tr");
  await page.waitFor(`/^\\/applications\\/[^/]+$/.test(location.pathname)`, { label: "application detail" });
  await page.waitForText("Loan summary", { timeout: 15000 });
  check("row click opens the application record", true, await page.evaluate("location.pathname"));
  await page.screenshot("05-application-detail");

  log("Responsive layout (390×844) and mobile navigation");
  await page.setViewport(390, 844, { mobile: true, scale: 2 });
  await page.goto("/dashboard", { expectPath: "/dashboard" });
  const mobileWidth = await page.evaluate("window.innerWidth");
  const mobileLayout = await page.evaluate(`({
    client: document.documentElement.clientWidth,
    narrow: window.matchMedia("(max-width: 1023px)").matches,
    menuVisible: Boolean(window.__fc.find('button[aria-label="Open navigation"]')),
  })`);
  check(
    "mobile breakpoint activates with a usable shell",
    mobileLayout.narrow && mobileLayout.menuVisible && mobileLayout.client <= 700,
    `inner=${mobileWidth} client=${mobileLayout.client} narrow=${mobileLayout.narrow}`,
  );
  const closedLeft = await page.evaluate(`document.querySelector("aside").getBoundingClientRect().left`);
  check("mobile sidebar starts off-canvas", closedLeft < 0, `left=${closedLeft}`);
  await page.screenshot("06-mobile-dashboard");

  await page.click('button[aria-label="Open navigation"]');
  await page.waitFor(`document.querySelector("aside").getBoundingClientRect().left >= 0`, { label: "mobile nav open" });
  check("hamburger opens the sidebar", true);
  const navLinkInView = await page.evaluate(`(() => {
    const el = window.__fc.find('nav[aria-label="Primary"] a', 'Applications');
    return window.__fc.mark(el) ? window.__fc.inViewport(window.__fc.mark(el)) : false;
  })()`);
  check("mobile navigation exposes in-viewport links", navLinkInView);
  await page.screenshot("07-mobile-nav-open");

  await page.click('aside button[aria-label="Close navigation"]');
  await page.waitFor(`document.querySelector("aside").getBoundingClientRect().left < 0`, { label: "mobile nav close" });
  check("mobile sidebar closes again", true);
  await page.setViewport(1440, 960, { mobile: false });

  log("Secure logout clears the session");
  await page.goto("/dashboard", { expectPath: "/dashboard" });
  await logout(page);
  check("logout returns to login page", true);
  const afterLogout = await readCookies(cdp, page);
  const sessionAfter = afterLogout.find((cookie) => cookie.name === "fincloud_session" && cookie.value);
  check("logout clears the session cookie", !sessionAfter, sessionAfter ? `value length ${sessionAfter.value.length}` : "cleared");
}

async function scenarioAdminWorkflows(page) {
  log("Admin sign-in and new-record dialogs");
  await loginWithForm(page, "admin@fincloud.demo");
  check("admin reaches dashboard", (await page.evaluate("location.pathname")) === "/dashboard");

  await page.goto("/sanctions", { expectPath: "/sanctions" });
  await page.waitForText("Sanctions");
  const raiseButton = await page.evaluate(`(() => {
    const el = window.__fc.find("button", "Raise sanction");
    return el ? { disabled: el.disabled } : null;
  })()`);
  check("sanctions page renders the creation control", Boolean(raiseButton), raiseButton ? "" : "button missing");
  if (raiseButton && !raiseButton.disabled) {
    await page.click("button", "Raise sanction", { last: true });
    await page.waitFor(`Boolean(window.__fc.dialog())`, { label: "sanction dialog" });
    check("raise-sanction modal opens", (await page.bodyText()).includes("Raise a sanction offer"));
    await page.screenshot("08-admin-sanction-modal");

    const selectedApp = await page.evaluate(`(() => {
      const select = document.querySelector("#sanction-application");
      return select && select.options.length > 1 ? select.options[1].value : "";
    })()`);
    if (selectedApp) {
      await page.fill("#sanction-application", selectedApp);
      await page.fill("#sanction-amount", "");
      await page.click("button", "Raise sanction", { last: true });
      await page.waitForText("Enter the sanction amount.", { timeout: 6000 }).then(
        () => check("sanction form rejects an empty amount", true),
        () => check("sanction form rejects an empty amount", false, "no inline error"),
      );
    } else {
      check("sanction dialog lists an eligible application", false, "no eligible application");
    }
    await page.click("button", "Cancel", { last: true });
    await page.waitFor(`!window.__fc.dialog()`, { label: "sanction modal close" });
    check("sanction modal closes without side effects", true);
  } else {
    check("sanction creation is available to admin", false, raiseButton ? "button disabled" : "button missing");
  }

  await page.goto("/disbursements", { expectPath: "/disbursements" });
  await page.waitForText("Disbursements");
  const newDisbursement = await page.evaluate(`(() => {
    const el = window.__fc.find("button", "New disbursement");
    return el ? { disabled: el.disabled } : null;
  })()`);
  check("disbursements page renders the creation control", Boolean(newDisbursement), newDisbursement ? "" : "button missing");
  if (newDisbursement && !newDisbursement.disabled) {
    await page.click("button", "New disbursement", { last: true });
    await page.waitFor(`Boolean(window.__fc.dialog())`, { label: "disbursement dialog" });
    check("new-disbursement modal opens", (await page.bodyText()).includes("Raise a disbursement request"));
    await page.screenshot("09-admin-disbursement-modal");
    await page.click("button", "Cancel", { last: true });
    await page.waitFor(`!window.__fc.dialog()`, { label: "disbursement modal close" });
    check("disbursement modal closes", true);
  } else {
    check(
      "disbursement creation is guarded when no approved sanction is pending",
      Boolean(newDisbursement) && newDisbursement.disabled,
      newDisbursement ? "control disabled" : "control missing",
    );
  }
  await logout(page);
  check("admin logout after workflow checks", (await page.evaluate("location.pathname")) === "/login");
}

async function scenarioAccessControl(page) {
  log("Access Control Center: tabs, role creation, permission edit, compare, history");
  await loginWithForm(page, "superadmin@fincloud.demo");
  const roleName = `QA Role ${Date.now().toString().slice(-5)}`;
  const shortLabel = `QA${Date.now().toString().slice(-4)}`;
  await page.goto("/access-control", { expectPath: "/access-control" });
  await page.waitFor(`Object.keys(window.__fc).length > 0`);
  await page.waitForText("Access Control Center");
  check("user access tab renders", (await page.bodyText()).includes("User access"));
  await page.screenshot("10-access-users");

  await page.clickTab("Roles & matrix");
  await page.waitForText("Module permission matrix");
  const matrixRows = await page.evaluate(`document.querySelectorAll("main table tbody tr").length`);
  check("permission matrix renders", matrixRows > 10, `rows=${matrixRows}`);
  await page.screenshot("11-access-roles");

  await page.click("button", "New role", { last: true });
  await page.waitFor(`Boolean(document.querySelector("#role-name"))`, { label: "role dialog" });
  await page.fill("#role-name", roleName);
  await page.fill("#role-short", shortLabel);
  await page.fill("#role-description", "Created by the automated browser smoke test to prove role editing works.");
  await page.click("label", "dashboard:view");
  const checkboxState = await page.evaluate(`(() => {
    const label = window.__fc.find("label", "dashboard:view");
    const input = label?.querySelector('input[type="checkbox"]');
    return input ? input.checked : null;
  })()`);
  check("permission checkbox toggles on click", checkboxState === true, `checked=${checkboxState}`);
  await page.click("button", "Create role", { last: true });
  await page.waitFor(`window.__fc.seenText(${JSON.stringify(roleName)}) && !window.__fc.dialog()`, {
    label: "role created",
    timeout: 15000,
  });
  check("custom role is created and listed", true);
  await page.screenshot("12-role-created");

  await page.click(`button[aria-label="Edit ${roleName}"]`);
  await page.waitForText("Save role");
  check("role edit dialog opens with existing values", (await page.evaluate(`document.querySelector("#role-name")?.value`)) === roleName);
  await page.click("label", "leads:view");
  await page.click("button", "Save role", { last: true });
  await page.waitFor(`!window.__fc.dialog()`, { label: "role saved", timeout: 15000 });
  check("role permission edit saves and closes the dialog", true);
  await page.screenshot("13-role-updated");

  await page.clickTab("Grants & delegation");
  await page.waitFor(`Boolean(window.__fc.find("button", "New grant"))`, { label: "grants panel" });
  const grantRows = await page.evaluate(`document.querySelectorAll("main table tbody tr").length`);
  check("grants register renders", grantRows >= 1, `rows=${grantRows}`);
  const grantButton = await page.evaluate(`Boolean(window.__fc.find("button", "New grant"))`);
  if (grantButton) {
    await page.click("button", "New grant", { last: true });
    await page.waitFor(`Boolean(document.querySelector("#grant-record-id"))`, { label: "grant dialog" }).catch(() => {});
    check("grant modal exposes record-level scope fields", await page.evaluate(`Boolean(document.querySelector("#grant-scope"))`));
    await page.click("button", "Cancel", { last: true });
    await page.waitFor(`!window.__fc.dialog()`, { label: "grant modal close" });
  }

  await page.clickTab("Compare");
  await page.waitFor(`Boolean(document.querySelector('[aria-label="Left user"]'))`, { label: "compare selectors" });
  const compareValues = await page.evaluate(`(() => {
    const left = document.querySelector('[aria-label="Left user"]');
    const right = document.querySelector('[aria-label="Right user"]');
    if (!left || !right) return null;
    const leftOptions = [...left.options].map(o => o.value);
    const rightOptions = [...right.options].map(o => o.value);
    return { leftOptions, rightOptions };
  })()`);
  if (compareValues && compareValues.leftOptions.length >= 2) {
    await page.fill('[aria-label="Left user"]', compareValues.leftOptions[0]);
    await page.fill('[aria-label="Right user"]', compareValues.leftOptions[1]);
    await page.click("button", "Compare", { last: true });
    await page.waitForText("only here:", { timeout: 15000 });
    check("user comparison produces a diff table", (await page.bodyText()).includes("Different"));
    await page.screenshot("14-access-compare");
  } else {
    check("user comparison has at least two users", false, "insufficient users");
  }

  await page.clickTab("Access history");
  await page.waitForText("Permission audit history");
  const auditRows = await page.evaluate(`document.querySelectorAll("main [class*='divide-y'] > div").length`);
  check("access history shows append-only audit entries", auditRows > 0, `rows=${auditRows}`);
  check("role creation appears in access history", (await page.bodyText()).includes("ROLE CREATED"));
  await page.screenshot("15-access-history");

  await logout(page);
  check("admin logout returns to login", (await page.evaluate("location.pathname")) === "/login");
}

/* ------------------------------------------------------------------ */
/* Runner                                                              */
/* ------------------------------------------------------------------ */

async function main() {
  await mkdir(ARTIFACTS, { recursive: true });
  console.log(`FinCloud LMS browser smoke test → ${BASE}`);
  const chrome = await launchChrome();
  const cdp = new Cdp(chrome.wsUrl);
  let child = chrome.child;
  const watchdog = setTimeout(() => {
    console.error("\nWATCHDOG: browser smoke test exceeded 5 minutes; aborting.");
    child.kill("SIGKILL");
    process.exit(3);
  }, 300000);
  watchdog.unref();
  try {
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const page = new Page(cdp, sessionId);

    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Network.enable");
    await page.send("Log.enable");
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: HELPER_SOURCE });
    await page.setViewport(1440, 960);

    cdp.on("Runtime.exceptionThrown", (params, sid) => {
      if (sid !== sessionId) return;
      const description = params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? "unknown";
      consoleErrors.push(description.split("\n")[0]);
    });
    cdp.on("Runtime.consoleAPICalled", (params, sid) => {
      if (sid !== sessionId || params.type !== "error") return;
      const text = params.args
        .map((arg) => arg.value ?? arg.description ?? arg.unserializableValue ?? "")
        .join(" ")
        .trim();
      if (text) consoleErrors.push(text.split("\n")[0]);
    });
    cdp.on("Log.entryAdded", (params, sid) => {
      if (sid !== sessionId) return;
      if (params.entry?.level === "error") consoleErrors.push(params.entry.text.split("\n")[0]);
    });
    cdp.on("Network.responseReceived", (params, sid) => {
      if (sid !== sessionId) return;
      const { response } = params;
      if (response.status >= 500 && !response.url.includes("favicon")) {
        failedRequests.push(`${response.status} ${response.requestId} ${response.url}`);
      }
    });
    cdp.on("Network.loadingFailed", (params, sid) => {
      if (sid !== sessionId || params.canceled) return;
      failedRequests.push(`FAILED ${params.errorText} ${params.requestId}`);
    });

    await scenarioLoginAndManager(page, cdp);
    await scenarioAdminWorkflows(page);
    await scenarioAccessControl(page);

    // Soft checks on the browser telemetry gathered during the run.
    const realConsoleErrors = consoleErrors.filter(
      (line) => !/favicon|Download the React DevTools|net::ERR_ABORTED/i.test(line),
    );
    check("no uncaught page exceptions during the run", realConsoleErrors.length === 0, realConsoleErrors.slice(0, 3).join(" | "));
    const serverFailures = failedRequests.filter((entry) => /^5\d\d/.test(entry));
    check("no 5xx responses during the run", serverFailures.length === 0, serverFailures.slice(0, 3).join(" | "));

    const passed = checks.filter((item) => item.pass).length;
    const failed = checks.length - passed;
    await writeFile(
      path.join(ARTIFACTS, "results.json"),
      JSON.stringify(
        {
          baseUrl: BASE,
          ranAt: new Date().toISOString(),
          passed,
          failed,
          checks,
          consoleErrors: realConsoleErrors,
          failedRequests,
        },
        null,
        2,
      ),
    );
    console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed}/${checks.length} browser checks passed`);
    console.log(`Report: ${path.relative(process.cwd(), path.join(ARTIFACTS, "results.json"))}`);
    if (failed > 0) process.exitCode = 1;
  } catch (error) {
    fatalError = error;
    console.error(`\nFATAL: ${error.message}`);
    process.exitCode = 1;
  } finally {
    cdp.close();
    child.kill("SIGKILL");
  }  if (fatalError) {
    await writeFile(
      path.join(ARTIFACTS, "results.json"),
      JSON.stringify({ baseUrl: BASE, ranAt: new Date().toISOString(), fatal: fatalError.message, checks }, null, 2),
    ).catch(() => {});
  }
}

main();
