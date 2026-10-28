#pragma once

#include <optional>
#include <sstream>
#include <string>

namespace sherlock_power {

enum class Journal { None, Owned, Invalid };
enum class Mode { Idle, Active, External, SafetyStop, SystemChanged, Error };

inline const char *modeName(Mode mode) {
  switch (mode) {
    case Mode::Idle: return "idle";
    case Mode::Active: return "active";
    case Mode::External: return "external";
    case Mode::SafetyStop: return "safety-stop";
    case Mode::SystemChanged: return "system-changed";
    case Mode::Error: return "error";
  }
  return "error";
}

struct Lease {
  int pid;
  std::string started;
  std::string token;
  bool operator==(const Lease &other) const {
    return pid == other.pid && started == other.started && token == other.token;
  }
};

struct Input {
  std::optional<Lease> lease;
  bool invalidLease = false;
  bool unsafe = false;
  bool stopping = false;
  bool release = false;
};

struct Status {
  Mode mode;
  int ownerPid = 0;
  std::optional<std::string> token;
};

// All mutations flow through this seam; the daemon supplies the privileged backend.
struct Backend {
  virtual ~Backend() = default;
  virtual Journal readJournal() = 0;
  virtual std::optional<bool> readSleepDisabled() = 0;
  virtual bool createJournal() = 0;
  virtual bool clearJournal() = 0;
  virtual bool setSleepDisabled(bool value) = 0;
};

inline bool validToken(const std::string &token) {
  if (token.size() != 32) return false;
  for (char character : token) {
    if (!((character >= '0' && character <= '9') || (character >= 'a' && character <= 'f'))) return false;
  }
  return true;
}

inline bool leaseFresh(double ageSeconds) { return ageSeconds >= -5.0 && ageSeconds <= 30.0; }

inline bool batteryUnsafe(long long capacity, long long maximum, bool discharging) {
  return discharging && maximum > 0 && capacity >= 0 && capacity <= maximum / 20;
}

inline std::optional<bool> parseSleepDisabled(const std::string &output) {
  std::istringstream lines(output);
  std::string line;
  std::optional<bool> value;
  while (std::getline(lines, line)) {
    std::istringstream row(line);
    std::string key, setting, extra;
    if (!(row >> key) || key != "SleepDisabled") continue;
    if (value.has_value() || !(row >> setting) || (row >> extra) || (setting != "0" && setting != "1")) return std::nullopt;
    value = setting == "1";
  }
  return value;
}

class Policy {
 public:
  explicit Policy(Backend &backend) : backend_(backend) {}

  Status tick(const Input &input) {
    if (!initialized_) {
      const auto journal = backend_.readJournal();
      if (journal == Journal::Invalid) return {Mode::Error, 0, std::nullopt};
      owned_ = journal == Journal::Owned;
      if (!restoreOwned()) return {Mode::Error, 0, std::nullopt};
      initialized_ = true;
    }
    if (recoveryPending_) {
      if (!restoreOwned()) return {Mode::Error, 0, std::nullopt};
      recoveryPending_ = false;
    }
    if (input.stopping || input.invalidLease || !input.lease) {
      const bool restored = restoreOwned();
      recoveryPending_ = !restored;
      current_.reset();
      return {restored && !input.invalidLease ? Mode::Idle : Mode::Error, 0, std::nullopt};
    }

    const Lease &lease = *input.lease;
    if (input.release) return stop(lease, Mode::Idle);
    if (current_ && !(*current_ == lease)) {
      if (!restoreOwned()) return stop(lease, Mode::Error);
      current_.reset();
    }
    if (blockedToken_ && *blockedToken_ == lease.token) return status(blockedMode_, lease);
    blockedToken_.reset();

    if (input.unsafe) return stop(lease, Mode::SafetyStop);
    if (current_) {
      const auto disabled = backend_.readSleepDisabled();
      if (!disabled) return stop(lease, Mode::Error);
      if (!*disabled) return stop(lease, Mode::SystemChanged);
      return status(owned_ ? Mode::Active : Mode::External, lease);
    }

    const auto disabled = backend_.readSleepDisabled();
    if (!disabled) return stop(lease, Mode::Error);
    if (*disabled) {
      current_ = lease;
      return status(Mode::External, lease);
    }
    if (!backend_.createJournal()) return stop(lease, Mode::Error);
    owned_ = true;
    const bool enabled = backend_.setSleepDisabled(true);
    const auto verified = backend_.readSleepDisabled();
    if (!enabled || !verified || !*verified) return stop(lease, Mode::Error);
    current_ = lease;
    return status(Mode::Active, lease);
  }

 private:
  Backend &backend_;
  bool initialized_ = false;
  bool owned_ = false;
  bool recoveryPending_ = false;
  std::optional<Lease> current_;
  std::optional<std::string> blockedToken_;
  Mode blockedMode_ = Mode::Error;

  static Status status(Mode mode, const Lease &lease) { return {mode, lease.pid, lease.token}; }

  bool restoreOwned() {
    if (!owned_) return true;
    auto disabled = backend_.readSleepDisabled();
    if (!disabled) return false;
    if (*disabled) {
      backend_.setSleepDisabled(false);
      disabled = backend_.readSleepDisabled();
      if (!disabled || *disabled) return false;
    }
    if (!backend_.clearJournal()) return false;
    owned_ = false;
    return true;
  }

  Status stop(const Lease &lease, Mode mode) {
    blockedToken_ = lease.token;
    blockedMode_ = mode;
    const bool restored = restoreOwned();
    recoveryPending_ = !restored;
    current_.reset();
    return status(restored ? mode : Mode::Error, lease);
  }
};

} // namespace sherlock_power
