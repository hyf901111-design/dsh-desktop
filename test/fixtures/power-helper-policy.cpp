#include "power-guard-policy.hpp"
#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

using namespace sherlock_power;

struct FakeBackend final : Backend {
  Journal diskJournal = Journal::None;
  std::optional<bool> power = false;
  bool failJournal = false;
  bool failRestore = false;
  bool failEnable = false;
  std::vector<std::string> events;
  Journal readJournal() override { return diskJournal; }
  std::optional<bool> readSleepDisabled() override { return power; }
  bool createJournal() override {
    events.push_back("journal");
    if (failJournal || diskJournal != Journal::None) return false;
    diskJournal = Journal::Owned;
    return true;
  }
  bool clearJournal() override {
    events.push_back("clear");
    if (diskJournal == Journal::Invalid) return false;
    diskJournal = Journal::None;
    return true;
  }
  bool setSleepDisabled(bool value) override {
    events.push_back(value ? "enable" : "restore");
    if ((value && failEnable) || (!value && failRestore)) return false;
    power = value;
    return true;
  }
};

void require(bool value, const char *message) { if (!value) throw std::runtime_error(message); }
const Lease first{123, "Wed Oct 28 10:00:00 2026", "0123456789abcdef0123456789abcdef"};
const Lease second{124, "Wed Oct 28 10:00:01 2026", "fedcba9876543210fedcba9876543210"};
Input present(const Lease &lease = first) { Input input; input.lease = lease; return input; }

void scenario(const std::string &name) {
  FakeBackend backend;
  if (name == "external" || name == "external-unsafe" || name == "release-external") backend.power = true;
  if (name == "crash-recovery" || name == "failed-restore") { backend.diskJournal = Journal::Owned; backend.power = true; }
  if (name == "malformed-journal") { backend.diskJournal = Journal::Invalid; backend.power = true; }
  if (name == "failed-restore") backend.failRestore = true;
  if (name == "failed-enable") backend.failEnable = true;
  if (name == "journal-before-enable") backend.failJournal = true;
  Policy policy(backend);

  if (name == "ownership") {
    require(policy.tick(present()).mode == Mode::Active, "valid lease must acquire");
    require(backend.events == std::vector<std::string>{"journal", "enable"}, "journal must precede enable");
    require(policy.tick(present()).ownerPid == 123, "active status must identify owner");
    require(policy.tick({}).mode == Mode::Idle, "lease removal must idle");
    require(backend.power == false && backend.diskJournal == Journal::None, "lease removal must restore and clear journal");
    require(backend.events == std::vector<std::string>{"journal", "enable", "restore", "clear"}, "restore must precede clearing journal");
  } else if (name == "external") {
    require(policy.tick(present()).mode == Mode::External, "existing flag must be borrowed");
    require(policy.tick({}).mode == Mode::Idle, "borrowed state must release lease");
    require(backend.power == true && backend.events.empty(), "borrowed state must never be changed");
  } else if (name == "external-unsafe") {
    policy.tick(present()); auto unsafe = present(); unsafe.unsafe = true;
    require(policy.tick(unsafe).mode == Mode::SafetyStop, "external safety condition must be visible");
    require(backend.power == true && backend.events.empty(), "safety must preserve external state");
  } else if (name == "lease-loss") {
    policy.tick(present());
    policy.tick({}); // Filesystem/identity/TTL validation turns every lost lease into this input.
    require(backend.power == false && backend.diskJournal == Journal::None, "expired or exited lease must restore");
  } else if (name == "crash-recovery") {
    require(policy.tick({}).mode == Mode::Idle, "crash journal must recover before idle");
    require(backend.events == std::vector<std::string>{"restore", "clear"}, "restart must restore first");
    require(backend.power == false && backend.diskJournal == Journal::None, "recovery must clear only after restore");
    require(policy.tick(present()).mode == Mode::Active, "service must remain reusable after recovery");
  } else if (name == "malformed-journal") {
    require(policy.tick(present()).mode == Mode::Error, "malformed journal must fail closed");
    require(policy.tick({}).mode == Mode::Error, "uncertain journal must remain blocked");
    require(backend.events.empty() && backend.power == true, "uncertain ownership must not mutate power or journal");
  } else if (name == "failed-restore") {
    require(policy.tick({}).mode == Mode::Error, "failed recovery must be visible");
    require(backend.diskJournal == Journal::Owned && backend.power == true, "failure must retain recovery journal");
    backend.failRestore = false;
    require(policy.tick({}).mode == Mode::Idle && backend.power == false, "next loop must retry recovery");
  } else if (name == "failed-enable") {
    require(policy.tick(present()).mode == Mode::Error, "failed enable must be visible");
    require(backend.power == false && backend.diskJournal == Journal::None, "failed enable must recover its journal");
    const auto writes = backend.events;
    policy.tick(present());
    require(backend.events == writes, "failed token must not endlessly mutate power");
  } else if (name == "journal-before-enable") {
    require(policy.tick(present()).mode == Mode::Error, "failed journal must reject acquisition");
    require(backend.events == std::vector<std::string>{"journal"} && backend.power == false, "no enable without durable journal");
  } else if (name == "unsafe") {
    auto unsafe = present(); unsafe.unsafe = true;
    require(policy.tick(unsafe).mode == Mode::SafetyStop && backend.events.empty(), "unsafe acquisition must not set flag");
    require(policy.tick(present()).mode == Mode::SafetyStop, "same token must stay stopped when temperature falls");
    require(policy.tick(present(second)).mode == Mode::Active, "fresh token may reacquire when safe");
    unsafe.lease = second;
    require(policy.tick(unsafe).mode == Mode::SafetyStop, "thermal or battery hazard must stop active lease");
    require(backend.power == false && backend.diskJournal == Journal::None, "hazard must restore owned flag");
  } else if (name == "drift") {
    policy.tick(present()); backend.power = false;
    require(policy.tick(present()).mode == Mode::SystemChanged, "system drift must be acknowledged");
    const auto writes = backend.events;
    require(policy.tick(present()).mode == Mode::SystemChanged, "drifted token must remain blocked");
    require(backend.events == writes && backend.power == false, "drift must never reassert disablesleep");
    require(backend.diskJournal == Journal::None, "verified external restore must release journal");
  } else if (name == "new-token") {
    policy.tick(present());
    const auto status = policy.tick(present(second));
    require(status.mode == Mode::Active && status.ownerPid == 124 && status.token == second.token, "changed lease must get its own ownership");
    require(backend.events == std::vector<std::string>{"journal", "enable", "restore", "clear", "journal", "enable"}, "changed owner must release before reacquiring");
  } else if (name == "stop") {
    policy.tick(present()); auto stopping = present(); stopping.stopping = true;
    require(policy.tick(stopping).mode == Mode::Idle, "signal shutdown must idle");
    require(backend.power == false && backend.diskJournal == Journal::None, "signal shutdown must restore");
  } else if (name == "bad-lease") {
    policy.tick(present()); Input invalid; invalid.invalidLease = true;
    require(policy.tick(invalid).mode == Mode::Error, "rejected lease must expose error");
    require(backend.power == false && backend.diskJournal == Journal::None, "bad signature or file must release owned flag");
  } else if (name == "release-before-acquire") {
    auto release = present(); release.release = true; release.unsafe = true;
    const auto acknowledged = policy.tick(release);
    require(acknowledged.mode == Mode::Idle && acknowledged.ownerPid == 123 && acknowledged.token == first.token,
      "release must acknowledge exact identity before any acquisition or safety decision");
    require(backend.events.empty() && backend.power == false, "unacquired release must not change power");
    const auto repeated = policy.tick(release);
    require(repeated.mode == Mode::Idle && repeated.token == first.token && backend.events.empty(), "repeated release must be idempotent");
  } else if (name == "release-owned") {
    policy.tick(present());
    auto release = present(); release.release = true;
    const auto acknowledged = policy.tick(release);
    require(acknowledged.mode == Mode::Idle && acknowledged.ownerPid == 123 && acknowledged.token == first.token,
      "owned release must acknowledge exact identity");
    require(backend.power == false && backend.diskJournal == Journal::None, "owned release must restore and clear before acknowledgement");
    const auto writes = backend.events;
    policy.tick(release);
    require(backend.events == writes, "repeated owned release must not write again");
  } else if (name == "release-external") {
    policy.tick(present()); auto release = present(); release.release = true;
    const auto acknowledged = policy.tick(release);
    require(acknowledged.mode == Mode::Idle && acknowledged.token == first.token, "external release must acknowledge identity");
    require(backend.power == true && backend.events.empty(), "external release must preserve external flag");
  } else if (name == "failed-release") {
    policy.tick(present()); backend.failRestore = true;
    auto release = present(); release.release = true;
    require(policy.tick(release).mode == Mode::Error, "failed release must never acknowledge idle");
    require(backend.power == true && backend.diskJournal == Journal::Owned, "failed release must preserve recovery journal");
    require(policy.tick(release).mode == Mode::Error, "unrestored release must remain error");
    backend.failRestore = false;
    const auto acknowledged = policy.tick(release);
    require(acknowledged.mode == Mode::Idle && acknowledged.ownerPid == 123 && acknowledged.token == first.token,
      "release must acknowledge only after a later verified recovery");
    require(backend.power == false && backend.diskJournal == Journal::None, "retry must complete restore before acknowledgement");
  } else if (name == "released-token-blocked") {
    auto release = present(); release.release = true;
    policy.tick(release);
    require(policy.tick(present()).mode == Mode::Idle && backend.events.empty(), "released token must not reacquire if release flag disappears");
    require(policy.tick(present(second)).mode == Mode::Active && backend.power == true, "new nonce may acquire normally");
  } else if (name == "lease-boundaries") {
    require(validToken("0123456789abcdef0123456789abcdef"), "32 lowercase hex token must be accepted");
    require(!validToken("0123456789ABCDEF0123456789ABCDEF") && !validToken("0123") &&
      !validToken("0123456789abcdef0123456789abcdeg"), "malformed token must fail");
    require(leaseFresh(30) && leaseFresh(-5), "TTL boundaries must be accepted");
    require(!leaseFresh(30.001) && !leaseFresh(-5.001), "expired or future-dated leases must fail");
  } else if (name == "battery-boundaries") {
    require(batteryUnsafe(5, 100, true) && batteryUnsafe(0, 100, true), "discharging battery at or below 5 percent must stop");
    require(!batteryUnsafe(6, 100, true) && !batteryUnsafe(5, 100, false), "healthy or AC battery must remain usable");
    require(batteryUnsafe(5, 101, true) && !batteryUnsafe(1, 19, true), "capacity ratio must preserve 5 percent boundary");
    require(!batteryUnsafe(0, 0, true) && !batteryUnsafe(-1, 100, true), "invalid capacity cannot report empty battery");
  } else if (name == "pmset-parser") {
    require(parseSleepDisabled("System-wide power settings:\n SleepDisabled\t0\n sleep 0\n") == false, "explicit zero must be read");
    require(parseSleepDisabled(" SleepDisabled 1 \n") == true, "explicit one must be read");
    require(!parseSleepDisabled(" sleep 0\n") && !parseSleepDisabled("SleepDisabled 7\n") &&
      !parseSleepDisabled("SleepDisabled 0\nSleepDisabled 1\n") && !parseSleepDisabled("SleepDisabled 1 extra\n"), "ambiguous or missing system flags must fail");
  } else throw std::runtime_error("unknown scenario");
}

int main(int argc, char **argv) {
  if (argc != 2) return 64;
  try { scenario(argv[1]); std::cout << argv[1] << ": ok\n"; return 0; }
  catch (const std::exception &error) { std::cerr << error.what() << '\n'; return 1; }
}
