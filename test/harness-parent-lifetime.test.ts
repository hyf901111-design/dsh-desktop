import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { expect, it, vi } from "vitest";

const node = resolve("node_modules/node/bin/node"),
  bootstrap = resolve("build/harness-node-entry.mjs");

it.each([true, false])(
  "bounds the lifetime only of a desktop-owned Harness after its actual parent exits: owned=%s",
  async (owned) => {
    const root = await mkdtemp(join(tmpdir(), "ework-parent-lifetime-")),
      ready = join(root, "ready.json"),
      stopped = join(root, "stopped"),
      info = join(root, "process.json"),
      worker = join(root, "worker.mjs"),
      owner = join(root, "owner.mjs");
    let parent: ChildProcess | undefined, childPid: number | undefined;
    try {
      await writeFile(
        worker,
        `import {createServer} from 'node:http';import {writeFileSync} from 'node:fs';const server=createServer((q,r)=>r.end('fixture'));server.listen(0,'127.0.0.1',()=>writeFileSync(${JSON.stringify(ready)},JSON.stringify({pid:process.pid,port:server.address().port})));process.on('SIGTERM',()=>{writeFileSync(${JSON.stringify(stopped)},'graceful stop');server.close(()=>process.exit(0))});`,
      );
      await writeFile(
        owner,
        `import{spawn}from'node:child_process';import{writeFileSync}from'node:fs';const env={...process.env};delete env.SHERLOCK_DESKTOP_PARENT_PID;${owned ? "env.SHERLOCK_DESKTOP_PARENT_PID=String(process.pid);" : ""}const child=spawn(process.execPath,['--expose-internals',${JSON.stringify(bootstrap)},${JSON.stringify(worker)}],{env,stdio:'ignore'});writeFileSync(${JSON.stringify(info)},JSON.stringify({pid:child.pid}));setInterval(()=>{},1000);`,
      );
      parent = spawn(node, [owner], { stdio: "ignore" });
      await vi.waitFor(
        () => expect(existsSync(ready) && existsSync(info)).toBe(true),
        { timeout: 5000 },
      );
      childPid = JSON.parse(await readFile(info, "utf8")).pid;
      await new Promise((resolve) => setTimeout(resolve, 1200));
      expect(existsSync(stopped)).toBe(false);
      const exited = once(parent, "exit");
      parent.kill("SIGKILL");
      await exited;
      if (owned)
        await vi.waitFor(() => expect(existsSync(stopped)).toBe(true), {
          timeout: 3500,
        });
      else {
        await new Promise((resolve) => setTimeout(resolve, 1400));
        expect(existsSync(stopped)).toBe(false);
        expect(() => process.kill(childPid!, 0)).not.toThrow();
      }
    } finally {
      if (parent && parent.exitCode === null && parent.signalCode === null)
        parent.kill("SIGKILL");
      if (!childPid && existsSync(info))
        childPid = JSON.parse(await readFile(info, "utf8")).pid;
      if (childPid)
        try {
          process.kill(childPid, "SIGKILL");
        } catch {}
      await rm(root, { recursive: true, force: true });
    }
  },
  10000,
);

it("does not keep a normally finished owned entry alive", async () => {
  const root = await mkdtemp(join(tmpdir(), "ework-parent-short-"));
  try {
    const entry = join(root, "entry.mjs");
    await writeFile(entry, "process.stdout.write('short entry complete\\n')");
    const result = spawnSync(node, ["--expose-internals", bootstrap, entry], {
      encoding: "utf8",
      env: { ...process.env, SHERLOCK_DESKTOP_PARENT_PID: String(process.pid) },
      timeout: 2500,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("short entry complete");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
