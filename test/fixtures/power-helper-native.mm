// This separate executable exercises native readers only. It never runs the daemon main or pmset.
#define main sherlock_power_daemon_main
#include "../../scripts/macos/sherlock-power-helper.mm"
#undef main
#include <iostream>
#include <stdexcept>

void requireNative(bool value, const char *message) { if (!value) throw std::runtime_error(message); }

void nativeScenario(const std::string &scenario, int parentPID, const char *started) {
  if (scenario == "journal-schema") {
    requireNative(parseJournalData([@"{\"version\":1,\"owned\":true}" dataUsingEncoding:NSUTF8StringEncoding]) == Journal::Owned, "valid owned journal must recover");
    for (NSString *text in @[@"{\"version\":1,\"other\":true}", @"{\"version\":1,\"owned\":1}",
      @"{\"version\":true,\"owned\":true}", @"{\"version\":1,\"owned\":false}", @"[]", @"null", @"bad"]) {
      requireNative(parseJournalData([text dataUsingEncoding:NSUTF8StringEncoding]) == Journal::Invalid, "malformed journal must fail closed without crashing");
    }
  } else if (scenario == "release-schema") {
    requireNative(parseReleaseFlag(@{}) == false, "absent release must default false");
    requireNative(parseReleaseFlag(@{@"release": @YES}) == true, "actual JSON boolean true must release");
    requireNative(parseReleaseFlag(@{@"release": @NO}) == false, "actual JSON boolean false must not release");
    for (id invalid in @[@1, @0, @"true", [NSNull null], @[], @{}]) {
      requireNative(!parseReleaseFlag(@{@"release": invalid}).has_value(), "nonboolean release must invalidate the lease");
    }
  } else if (scenario == "process-identity") {
    Lease parent{parentPID, started, "0123456789abcdef0123456789abcdef"};
    requireNative(processMatches(parent, getuid()), "native process time must agree with C-locale ps");
    requireNative(!processMatches(parent, getuid() + 1), "different UID must fail");
    requireNative(!signedClient(parent), "a Node test process must not impersonate the signed EWork client");
    parent.started = "previous application launch";
    requireNative(!processMatches(parent, getuid()), "reused PID with different start must fail");
  } else if (scenario == "transition-lock") {
    char pattern[] = "/tmp/sherlock-power-lock-XXXXXX";
    const char *temporary = mkdtemp(pattern);
    requireNative(temporary != nullptr, "lock fixture directory must exist");
    {
      Descriptor directory(open(temporary, O_RDONLY | O_DIRECTORY | O_CLOEXEC));
      Descriptor first(openat(directory.value, ".transition.lock", O_RDWR | O_CREAT | O_CLOEXEC, 0600));
      Descriptor second(openat(directory.value, ".transition.lock", O_RDWR | O_CLOEXEC));
      if (getuid() != 0) requireNative(!openTransitionFile(directory.value), "daemon must reject a non-root-owned coordination file");
      {
        TransitionLock lock(first.value);
        requireNative(static_cast<bool>(lock), "transition must acquire private coordination file lock");
        requireNative(flock(second.value, LOCK_EX | LOCK_NB) != 0 && errno == EWOULDBLOCK, "another daemon must not enter the same global transition");
      }
      requireNative(flock(second.value, LOCK_EX | LOCK_NB) == 0, "global lock must release after transition");
      flock(second.value, LOCK_UN);
      requireNative(unlinkat(directory.value, ".transition.lock", 0) == 0, "lock fixture must remove");
    }
    requireNative(rmdir(temporary) == 0, "lock fixture directory must remove");
  } else if (scenario == "file-validation") {
    char pattern[] = "/tmp/sherlock-power-files-XXXXXX";
    const char *temporary = mkdtemp(pattern);
    requireNative(temporary != nullptr, "temporary fixture directory must exist");
    @try {
      Descriptor directory(open(temporary, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC));
      requireNative(static_cast<bool>(directory), "fixture directory must open");
      NSString *path = [NSString stringWithUTF8String:temporary];
      const auto write = [&](NSString *name, NSData *bytes) {
        NSString *file = [path stringByAppendingPathComponent:name];
        requireNative([bytes writeToFile:file atomically:YES], "fixture file must write");
        requireNative(chmod(file.fileSystemRepresentation, 0600) == 0, "fixture must be private");
      };
      write(@"good", [@"{\"version\":1}" dataUsingEncoding:NSUTF8StringEncoding]);
      requireNative(readFile(directory.value, "good", getuid(), 0600).state == FileData::State::Valid, "private regular file must read");
      requireNative(readFile(directory.value, "absent", getuid(), 0600).state == FileData::State::Missing, "missing file must idle");
      requireNative(readFile(directory.value, "good", getuid() + 1, 0600).state == FileData::State::Invalid, "wrong file owner must fail");
      requireNative(symlinkat("good", directory.value, "symlink") == 0, "symlink fixture must create");
      requireNative(readFile(directory.value, "symlink", getuid(), 0600).state == FileData::State::Invalid, "symlink must fail");
      requireNative(linkat(directory.value, "good", directory.value, "hardlink", 0) == 0, "hardlink fixture must create");
      requireNative(readFile(directory.value, "hardlink", getuid(), 0600).state == FileData::State::Invalid, "hardlinked file must fail");
      requireNative(unlinkat(directory.value, "hardlink", 0) == 0, "hardlink fixture must remove");
      requireNative(fchmodat(directory.value, "good", 0644, 0) == 0, "wrong mode fixture must create");
      requireNative(readFile(directory.value, "good", getuid(), 0600).state == FileData::State::Invalid, "publicly readable lease must fail");
      write(@"oversized", [NSMutableData dataWithLength:2049]);
      write(@"empty", [NSData data]);
      requireNative(readFile(directory.value, "oversized", getuid(), 0600).state == FileData::State::Invalid, "oversized file must fail");
      requireNative(readFile(directory.value, "empty", getuid(), 0600).state == FileData::State::Invalid, "empty file must fail");
      requireNative(mkfifo([[path stringByAppendingPathComponent:@"fifo"] fileSystemRepresentation], 0600) == 0, "FIFO fixture must create");
      requireNative(readFile(directory.value, "fifo", getuid(), 0600).state == FileData::State::Invalid, "FIFO must reject without blocking");
      requireNative(mkdirat(directory.value, "leases", 0700) == 0, "lease directory must create");
      requireNative(static_cast<bool>(openDirectory(directory.value, "leases", getuid(), 0700)), "private enrolled directory must open");
      requireNative(symlinkat("leases", directory.value, "linked-directory") == 0, "directory symlink fixture must create");
      requireNative(!openDirectory(directory.value, "linked-directory", getuid(), 0700), "directory symlink must fail");
      requireNative(fchmodat(directory.value, "leases", 0755, 0) == 0, "insecure directory mode fixture must create");
      requireNative(!openDirectory(directory.value, "leases", getuid(), 0700), "insecure lease directory must fail");
    } @finally {
      [[NSFileManager defaultManager] removeItemAtPath:[NSString stringWithUTF8String:temporary] error:nil];
    }
  } else throw std::runtime_error("unknown native scenario");
}

int main(int argc, char **argv) {
  if (argc != 4) return 64;
  @autoreleasepool {
    try { nativeScenario(argv[1], std::stoi(argv[2]), argv[3]); std::cout << argv[1] << ": ok\n"; return 0; }
    catch (const std::exception &error) { std::cerr << error.what() << '\n'; return 1; }
  }
}
