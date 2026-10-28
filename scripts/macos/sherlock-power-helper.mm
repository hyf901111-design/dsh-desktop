#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <IOKit/ps/IOPowerSources.h>
#import <IOKit/ps/IOPSKeys.h>
#include <libproc.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <signal.h>
#include <unistd.h>
#include <cerrno>
#include <climits>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <locale.h>
#include <utility>
#include "power-guard-policy.hpp"

using namespace sherlock_power;

namespace {
constexpr size_t kMaximumFileBytes = 2048;
constexpr const char *kJournalName = "recovery.json";
volatile sig_atomic_t gStopping = 0;
void stopSignal(int) { gStopping = 1; }

struct Descriptor {
  int value = -1;
  explicit Descriptor(int descriptor = -1) : value(descriptor) {}
  ~Descriptor() { if (value >= 0) close(value); }
  Descriptor(const Descriptor &) = delete;
  Descriptor &operator=(const Descriptor &) = delete;
  Descriptor(Descriptor &&other) noexcept : value(std::exchange(other.value, -1)) {}
  explicit operator bool() const { return value >= 0; }
};

// A private root-owned inode coordinates the global pmset bit across enrolled UIDs.
Descriptor openTransitionFile(int powerDirectory) {
  Descriptor file(openat(powerDirectory, ".transition.lock", O_RDWR | O_CREAT | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC, 0600));
  struct stat metadata{};
  if (!file || fstat(file.value, &metadata) != 0 || !S_ISREG(metadata.st_mode) || metadata.st_uid != 0 ||
      (metadata.st_mode & 07777) != 0600 || metadata.st_nlink != 1 || metadata.st_size != 0) return Descriptor();
  return file;
}

struct TransitionLock {
  int descriptor;
  bool locked = false;
  explicit TransitionLock(int file) : descriptor(file) {
    int result;
    do { result = flock(descriptor, LOCK_EX); } while (result != 0 && errno == EINTR);
    locked = result == 0;
  }
  ~TransitionLock() { if (locked) flock(descriptor, LOCK_UN); }
  TransitionLock(const TransitionLock &) = delete;
  TransitionLock &operator=(const TransitionLock &) = delete;
  explicit operator bool() const { return locked; }
};

bool directoryAllowed(int descriptor, uid_t owner, mode_t permissions, bool exact) {
  struct stat metadata{};
  return fstat(descriptor, &metadata) == 0 && S_ISDIR(metadata.st_mode) && metadata.st_uid == owner &&
    (exact ? (metadata.st_mode & 07777) == permissions : (metadata.st_mode & 0022) == 0);
}

Descriptor openDirectory(int parent, const char *component, uid_t owner, mode_t permissions, bool exact = true) {
  Descriptor directory(openat(parent, component, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC));
  if (!directory || !directoryAllowed(directory.value, owner, permissions, exact)) return Descriptor();
  return directory;
}

Descriptor openBase(uid_t uid) {
  Descriptor root(open("/", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC));
  if (!root || !directoryAllowed(root.value, 0, 0755, false)) return Descriptor();
  auto library = openDirectory(root.value, "Library", 0, 0755, false);
  if (!library) return Descriptor();
  auto support = openDirectory(library.value, "Application Support", 0, 0755, false);
  if (!support) return Descriptor();
  auto app = openDirectory(support.value, "EWork Odyssey", 0, 0755, false);
  if (!app) return Descriptor();
  auto power = openDirectory(app.value, "Power", 0, 0755, false);
  if (!power) return Descriptor();
  return openDirectory(power.value, std::to_string(uid).c_str(), 0, 0755);
}

bool fileAllowed(const struct stat &metadata, uid_t owner, mode_t permissions) {
  return S_ISREG(metadata.st_mode) && metadata.st_uid == owner &&
    (metadata.st_mode & 07777) == permissions && metadata.st_nlink == 1 &&
    metadata.st_size > 0 && metadata.st_size <= static_cast<off_t>(kMaximumFileBytes);
}

struct FileData {
  enum class State { Missing, Valid, Invalid } state = State::Invalid;
  NSData *bytes = nil;
  struct stat metadata{};
};

struct FileReadComplete { void operator()(int) const {} };

// The private template seam lets native tests mutate metadata at the precise
// read/fstat boundary. Production instantiates only the empty inlined callback.
template <typename AfterRead = FileReadComplete>
FileData readFile(int parent, const char *name, uid_t owner, mode_t permissions, AfterRead afterRead = {}) {
  FileData result;
  Descriptor file(openat(parent, name, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC));
  if (!file) {
    if (errno == ENOENT) result.state = FileData::State::Missing;
    return result;
  }
  if (fstat(file.value, &result.metadata) != 0 || !fileAllowed(result.metadata, owner, permissions)) return result;
  unsigned char bytes[kMaximumFileBytes + 1];
  size_t count = 0;
  while (count < sizeof(bytes)) {
    const ssize_t amount = read(file.value, bytes + count, sizeof(bytes) - count);
    if (amount < 0) { if (errno == EINTR) continue; return result; }
    if (amount == 0) break;
    count += static_cast<size_t>(amount);
  }
  afterRead(file.value);
  struct stat after{}, named{};
  if (count != static_cast<size_t>(result.metadata.st_size) ||
      fstat(file.value, &after) != 0 || !fileAllowed(after, owner, permissions) ||
      after.st_size != result.metadata.st_size || after.st_mtimespec.tv_sec != result.metadata.st_mtimespec.tv_sec ||
      after.st_mtimespec.tv_nsec != result.metadata.st_mtimespec.tv_nsec ||
      fstatat(parent, name, &named, AT_SYMLINK_NOFOLLOW) != 0 || !fileAllowed(named, owner, permissions) ||
      named.st_dev != after.st_dev || named.st_ino != after.st_ino) return result;
  result.bytes = [NSData dataWithBytes:bytes length:count];
  result.state = FileData::State::Valid;
  return result;
}

template <typename Reader>
FileData readStableLeaseFile(Reader reader) {
  FileData result;
  for (unsigned int attempt = 0; attempt < 3; ++attempt) {
    result = reader();
    if (result.state != FileData::State::Invalid) break;
  }
  return result;
}

NSDictionary *jsonObject(NSData *bytes) {
  id object = bytes ? [NSJSONSerialization JSONObjectWithData:bytes options:0 error:nil] : nil;
  return [object isKindOfClass:[NSDictionary class]] ? object : nil;
}

bool integerNumber(id object, long long minimum, long long maximum) {
  if (![object isKindOfClass:[NSNumber class]] || CFGetTypeID((__bridge CFTypeRef)object) == CFBooleanGetTypeID()) return false;
  const double value = [object doubleValue];
  return std::isfinite(value) && std::floor(value) == value && value >= minimum && value <= maximum;
}

Journal parseJournalData(NSData *bytes) {
  NSDictionary *object = jsonObject(bytes);
  id owned = object[@"owned"];
  if (!object || object.count != 2 || !integerNumber(object[@"version"], 1, 1) || !owned ||
      CFGetTypeID((__bridge CFTypeRef)owned) != CFBooleanGetTypeID() || ![owned boolValue]) return Journal::Invalid;
  return Journal::Owned;
}

std::optional<bool> parseReleaseFlag(NSDictionary *object) {
  id release = object[@"release"];
  if (!release) return false;
  if (CFGetTypeID((__bridge CFTypeRef)release) != CFBooleanGetTypeID()) return std::nullopt;
  return [release boolValue];
}

bool writeAll(int descriptor, NSData *bytes) {
  const auto *cursor = static_cast<const unsigned char *>(bytes.bytes);
  size_t left = bytes.length;
  while (left > 0) {
    const ssize_t written = write(descriptor, cursor, left);
    if (written < 0) { if (errno == EINTR) continue; return false; }
    if (written == 0) return false;
    cursor += written;
    left -= static_cast<size_t>(written);
  }
  return true;
}

bool atomicJSON(int directory, const char *name, NSDictionary *object, mode_t mode, bool exclusive) {
  NSData *bytes = [NSJSONSerialization dataWithJSONObject:object options:0 error:nil];
  if (!bytes || bytes.length > kMaximumFileBytes) return false;
  const std::string temporary = ".power-" + std::to_string(getpid()) + "-" + std::to_string(arc4random());
  Descriptor output(openat(directory, temporary.c_str(), O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600));
  if (!output) return false;
  bool succeeded = writeAll(output.value, bytes) && fchown(output.value, 0, 0) == 0 && fchmod(output.value, mode) == 0 && fsync(output.value) == 0;
  if (succeeded) {
    succeeded = exclusive ? linkat(directory, temporary.c_str(), directory, name, 0) == 0 :
      renameat(directory, temporary.c_str(), directory, name) == 0;
  }
  if (unlinkat(directory, temporary.c_str(), 0) != 0 && errno != ENOENT) succeeded = false;
  if (succeeded) succeeded = fsync(directory) == 0;
  return succeeded;
}

struct CommandResult { bool success = false; std::string output; };

CommandResult pmset(bool write, bool disabled = false) {
  @try {
    NSTask *task = [[NSTask alloc] init];
    task.executableURL = [NSURL fileURLWithPath:@"/usr/bin/pmset"];
    task.arguments = write ? @[@"-a", @"disablesleep", disabled ? @"1" : @"0"] : @[@"-g"];
    task.environment = @{@"PATH": @"/usr/bin:/bin:/usr/sbin:/sbin", @"LANG": @"C", @"LC_ALL": @"C"};
    NSPipe *pipe = [NSPipe pipe];
    task.standardOutput = pipe;
    task.standardError = pipe;
    NSError *error = nil;
    if (![task launchAndReturnError:&error]) return {};
    const auto deadline = [NSProcessInfo processInfo].systemUptime + 5.0;
    while (task.running && [NSProcessInfo processInfo].systemUptime < deadline) usleep(20000);
    if (task.running) {
      [task terminate];
      usleep(100000);
      if (task.running) kill(task.processIdentifier, SIGKILL);
      [task waitUntilExit];
      return {};
    }
    [task waitUntilExit];
    NSData *data = [pipe.fileHandleForReading readDataToEndOfFile];
    if (data.length > 65536) return {};
    return {task.terminationReason == NSTaskTerminationReasonExit && task.terminationStatus == 0,
      std::string(static_cast<const char *>(data.bytes), data.length)};
  } @catch (NSException *) { return {}; }
}

class NativeBackend final : public Backend {
 public:
  explicit NativeBackend(int base) : base_(base) {}
  Journal readJournal() override {
    const auto file = readFile(base_, kJournalName, 0, 0600);
    if (file.state == FileData::State::Missing) return Journal::None;
    return file.state == FileData::State::Valid ? parseJournalData(file.bytes) : Journal::Invalid;
  }
  std::optional<bool> readSleepDisabled() override {
    const auto result = pmset(false);
    return result.success ? parseSleepDisabled(result.output) : std::nullopt;
  }
  bool createJournal() override {
    if (readJournal() != Journal::None) return false;
    return atomicJSON(base_, kJournalName, @{@"version": @1, @"owned": @YES}, 0600, true);
  }
  bool clearJournal() override {
    const auto journal = readJournal();
    if (journal == Journal::None) return fsync(base_) == 0;
    return journal == Journal::Owned && unlinkat(base_, kJournalName, 0) == 0 && fsync(base_) == 0;
  }
  bool setSleepDisabled(bool disabled) override { return pmset(true, disabled).success; }
 private:
  int base_;
};

bool processMatches(const Lease &lease, uid_t uid) {
  struct proc_bsdinfo info{};
  if (proc_pidinfo(lease.pid, PROC_PIDTBSDINFO, 0, &info, sizeof(info)) != sizeof(info) || info.pbi_uid != uid || info.pbi_ruid != uid) return false;
  const time_t started = static_cast<time_t>(info.pbi_start_tvsec);
  struct tm local{};
  if (!localtime_r(&started, &local)) return false;
  char formatted[64]{};
  locale_t locale = newlocale(LC_TIME_MASK, "C", nullptr);
  if (!locale) return false;
  const bool formattedOK = strftime_l(formatted, sizeof(formatted), "%a %b %e %T %Y", &local, locale) > 0;
  freelocale(locale);
  return formattedOK && lease.started == formatted;
}

bool signedClient(const Lease &lease) {
  SecCodeRef code = nullptr;
  NSDictionary *attributes = @{(__bridge NSString *)kSecGuestAttributePid: @(lease.pid)};
  if (SecCodeCopyGuestWithAttributes(nullptr, (__bridge CFDictionaryRef)attributes, kSecCSDefaultFlags, &code) != errSecSuccess) return false;
  SecRequirementRef requirement = nullptr;
  const OSStatus created = SecRequirementCreateWithString(CFSTR("anchor apple generic and identifier \"com.evanarts.sherlock\" and certificate leaf[subject.OU] = \"FAV8TLDK73\""), kSecCSDefaultFlags, &requirement);
  const bool valid = created == errSecSuccess && SecCodeCheckValidity(code, kSecCSStrictValidate, requirement) == errSecSuccess;
  if (requirement) CFRelease(requirement);
  CFRelease(code);
  return valid;
}

Input readLease(int base, uid_t uid, std::optional<Lease> &verified) {
  Input result;
  auto directory = openDirectory(base, "leases", uid, 0700);
  if (!directory) { result.invalidLease = true; return result; }
  // Heartbeat futimes or atomic renewal may cross a strict metadata snapshot.
  // Retry only failed reads, reopening each time; a missing lease stays missing.
  const auto file = readStableLeaseFile([&] { return readFile(directory.value, "session.json", uid, 0600); });
  if (file.state == FileData::State::Missing) return result;
  result.invalidLease = true;
  if (file.state != FileData::State::Valid) return result;
  const double modified = static_cast<double>(file.metadata.st_mtimespec.tv_sec) + file.metadata.st_mtimespec.tv_nsec / 1e9;
  if (!leaseFresh([[NSDate date] timeIntervalSince1970] - modified)) return result;
  NSDictionary *object = jsonObject(file.bytes);
  if (!object || !integerNumber(object[@"version"], 1, 1) || !integerNumber(object[@"pid"], 1, INT_MAX) ||
      ![object[@"started"] isKindOfClass:[NSString class]] || ![object[@"token"] isKindOfClass:[NSString class]]) return result;
  const auto release = parseReleaseFlag(object);
  if (!release.has_value()) return result;
  NSString *started = object[@"started"], *token = object[@"token"];
  if (started.length == 0 || started.length >= 64 || token.length != 32) return result;
  Lease lease{[object[@"pid"] intValue],
    std::string(started.UTF8String, [started lengthOfBytesUsingEncoding:NSUTF8StringEncoding]),
    std::string(token.UTF8String, [token lengthOfBytesUsingEncoding:NSUTF8StringEncoding])};
  if (!validToken(lease.token) || !processMatches(lease, uid)) return result;
  if (!verified || !(*verified == lease)) {
    if (!signedClient(lease) || !processMatches(lease, uid)) return result;
    verified = lease;
  }
  result.invalidLease = false;
  result.lease = lease;
  result.release = *release;
  return result;
}

bool unsafePowerState() {
  const auto thermal = [NSProcessInfo processInfo].thermalState;
  if (thermal == NSProcessInfoThermalStateSerious || thermal == NSProcessInfoThermalStateCritical) return true;
  CFTypeRef info = IOPSCopyPowerSourcesInfo();
  if (!info) return true;
  CFArrayRef list = IOPSCopyPowerSourcesList(info);
  bool unsafe = false;
  if (!list) unsafe = true;
  else {
    for (CFIndex index = 0; index < CFArrayGetCount(list); ++index) {
      CFDictionaryRef description = IOPSGetPowerSourceDescription(info, CFArrayGetValueAtIndex(list, index));
      if (!description) continue;
      NSDictionary *source = (__bridge NSDictionary *)description;
      const bool discharging = [source[@kIOPSPowerSourceStateKey] isEqual:@kIOPSBatteryPowerValue] && ![source[@kIOPSIsChargingKey] boolValue];
      id capacity = source[@kIOPSCurrentCapacityKey], maximum = source[@kIOPSMaxCapacityKey];
      if (integerNumber(capacity, 0, INT_MAX) && integerNumber(maximum, 1, INT_MAX) &&
          batteryUnsafe([capacity longLongValue], [maximum longLongValue], discharging)) { unsafe = true; break; }
    }
    CFRelease(list);
  }
  CFRelease(info);
  return unsafe;
}

NSDictionary *statusJSON(const Status &status) {
  id token = status.token ? [NSString stringWithUTF8String:status.token->c_str()] : [NSNull null];
  return @{@"version": @1, @"implementationVersion": @2, @"servicePid": @(getpid()),
    @"mode": [NSString stringWithUTF8String:modeName(status.mode)], @"ownerPid": @(status.ownerPid), @"token": token};
}

bool writeStatus(int base, const Status &status) {
  return atomicJSON(base, "status.json", statusJSON(status), 0644, false);
}

bool sameStatus(const Status &left, const Status &right) {
  return left.mode == right.mode && left.ownerPid == right.ownerPid && left.token == right.token;
}

std::optional<uid_t> parseUID(const char *text) {
  if (!*text) return std::nullopt;
  for (const char *cursor = text; *cursor; ++cursor) if (*cursor < '0' || *cursor > '9') return std::nullopt;
  errno = 0;
  const unsigned long long value = strtoull(text, nullptr, 10);
  if (errno != 0 || value == 0 || value >= UINT_MAX) return std::nullopt;
  return static_cast<uid_t>(value);
}
} // namespace

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--version") == 0) { puts("2"); return 0; }
  const auto uid = argc == 3 && strcmp(argv[1], "--uid") == 0 ? parseUID(argv[2]) : std::nullopt;
  if (!uid) { fputs("usage: sherlock-power-helper --uid <non-root-uid> | --version\n", stderr); return 64; }
  if (geteuid() != 0 || getuid() != 0) { fputs("power helper requires root\n", stderr); return 77; }
  @autoreleasepool {
    auto base = openBase(*uid);
    if (!base) { fputs("power helper directory is missing or unsafe\n", stderr); return 78; }
    Descriptor powerDirectory(openat(base.value, "..", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC));
    if (!powerDirectory || !directoryAllowed(powerDirectory.value, 0, 0755, false)) {
      fputs("power helper coordination directory is unsafe\n", stderr); return 78;
    }
    auto coordinator = openTransitionFile(powerDirectory.value);
    if (!coordinator) { fputs("power helper coordination file is unsafe\n", stderr); return 78; }
    struct sigaction action{};
    action.sa_handler = stopSignal;
    sigemptyset(&action.sa_mask);
    sigaction(SIGTERM, &action, nullptr);
    sigaction(SIGINT, &action, nullptr);
    NativeBackend backend(base.value);
    Policy policy(backend);
    const auto transition = [&](const Input &input) -> Status {
      TransitionLock lock(coordinator.value);
      if (!lock) return {Mode::Error, 0, std::nullopt};
      return policy.tick(input);
    };
    std::optional<Lease> verified;
    std::optional<Status> previous;
    while (true) {
      @autoreleasepool {
        Input input;
        if (!gStopping) input = readLease(base.value, *uid, verified);
        input.stopping = gStopping != 0;
        if (input.lease) input.unsafe = unsafePowerState();
        const auto status = transition(input);
        if (!previous || !sameStatus(*previous, status)) {
          if (writeStatus(base.value, status)) previous = status;
          else fputs("power helper could not write status\n", stderr);
        }
      }
      if (gStopping) break;
      for (unsigned int interval = 0; interval < 10 && !gStopping; ++interval) usleep(100000);
    }
    // A signal may arrive during acquisition, after the loop sampled its input.
    // Always make one final restore attempt before exiting; a failure retains the journal.
    Input stopping;
    stopping.stopping = true;
    const auto stopped = transition(stopping);
    if (!previous || !sameStatus(*previous, stopped)) writeStatus(base.value, stopped);
  }
  return 0;
}
