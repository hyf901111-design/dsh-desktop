#import <AppKit/AppKit.h>
#import <CoreImage/CoreImage.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#include <node_api.h>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <mutex>
#include <string>

// A single in-process stream gives the model its actual frames and lets macOS
// own the sharing indicator and Stop Sharing control. No synthetic status UI.
static std::mutex gate;
static std::condition_variable changed;
static uint64_t generation = 0;
static uint64_t frameTimeMs = 0;
static pid_t targetPid = 0;
static CGWindowID targetWindow = 0;
static bool running = false, stoppedBySystem = false;
static NSData *latestFrame;
static size_t frameWidth = 0, frameHeight = 0;
static CGRect windowBounds = CGRectZero;
static SCStream *stream;
static id outputDelegate;
static dispatch_queue_t frameQueue = dispatch_queue_create("com.ework.computer.capture", DISPATCH_QUEUE_SERIAL);

static std::string message(NSError *error, const char *fallback) {
  return error ? std::string(error.localizedDescription.UTF8String ?: fallback) : std::string(fallback);
}

@interface EWorkCaptureOutput : NSObject <SCStreamOutput, SCStreamDelegate, SCContentSharingPickerObserver>
@property(nonatomic) uint64_t ownerGeneration;
@end
@implementation EWorkCaptureOutput
- (void)stream:(SCStream *)sender didOutputSampleBuffer:(CMSampleBufferRef)sample ofType:(SCStreamOutputType)type {
  if (type != SCStreamOutputTypeScreen || !CMSampleBufferIsValid(sample)) return;
  CVPixelBufferRef pixels = CMSampleBufferGetImageBuffer(sample);
  if (!pixels) return;
  NSDictionary *attachments = (__bridge NSDictionary *)CMGetAttachment(sample, (__bridge CFStringRef)SCStreamFrameInfoStatus, nullptr);
  if ([attachments isKindOfClass:NSNumber.class] && [((NSNumber *)attachments) integerValue] != SCFrameStatusComplete) return;
  uint64_t capturedAt = (uint64_t)([[NSDate date] timeIntervalSince1970] * 1000);
  @autoreleasepool {
    CIImage *image = [CIImage imageWithCVPixelBuffer:pixels];
    static CIContext *context = [CIContext contextWithOptions:@{kCIContextUseSoftwareRenderer: @NO}];
    static CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    NSDictionary *options = @{(id)kCGImageDestinationLossyCompressionQuality: @0.78};
    NSData *jpeg = [context JPEGRepresentationOfImage:image colorSpace:colorSpace options:options];
    if (!jpeg.length) return;
    std::lock_guard<std::mutex> hold(gate);
    if (running && stream == sender && generation == self.ownerGeneration) {
      latestFrame = jpeg;
      frameWidth = CVPixelBufferGetWidth(pixels);
      frameHeight = CVPixelBufferGetHeight(pixels);
      frameTimeMs = capturedAt;
      changed.notify_all();
    }
  }
}
- (void)stream:(SCStream *)sender didStopWithError:(NSError *)error {
  (void)error;
  std::lock_guard<std::mutex> hold(gate);
  if (stream == sender && generation == self.ownerGeneration) {
    running = false;
    stoppedBySystem = true;
    latestFrame = nil;
    changed.notify_all();
  }
}
- (void)contentSharingPicker:(SCContentSharingPicker *)picker didCancelForStream:(SCStream *)sender API_AVAILABLE(macos(14.0)) { (void)picker; (void)sender; }
- (void)contentSharingPicker:(SCContentSharingPicker *)picker didUpdateWithFilter:(SCContentFilter *)filter forStream:(SCStream *)sender API_AVAILABLE(macos(14.0)) {
  (void)picker; (void)filter;
  // A system-side retarget invalidates the model's window and AX coordinates.
  std::lock_guard<std::mutex> hold(gate);
  if (stream == sender && generation == self.ownerGeneration) {
    running = false;
    stoppedBySystem = true;
    latestFrame = nil;
    changed.notify_all();
  }
}
- (void)contentSharingPickerStartDidFailWithError:(NSError *)error { (void)error; }
@end

enum class Command { Start, Stop };
struct Job {
  napi_async_work work;
  napi_deferred deferred;
  Command command;
  pid_t pid = 0;
  CGWindowID window = 0;
  NSData *jpeg;
  size_t width = 0, height = 0;
  CGRect bounds = CGRectZero;
  uint64_t freshAfterMs = 0;
  std::string error;
};

static bool waitFor(dispatch_semaphore_t sem, double seconds) {
  return dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(seconds * NSEC_PER_SEC))) == 0;
}
static SCWindow *findWindow(pid_t pid, CGWindowID window, std::string &error) {
  __block SCShareableContent *content = nil;
  __block NSError *failure = nil;
  dispatch_semaphore_t sem = dispatch_semaphore_create(0);
  [SCShareableContent getShareableContentExcludingDesktopWindows:YES onScreenWindowsOnly:NO
    completionHandler:^(SCShareableContent *found, NSError *issue) {
      content = found; failure = issue; dispatch_semaphore_signal(sem);
    }];
  if (!waitFor(sem, 5)) { error = "读取可共享窗口超时"; return nil; }
  if (failure) { error = message(failure, "无法读取可共享窗口"); return nil; }
  for (SCWindow *candidate in content.windows) {
    if (candidate.windowID == window && candidate.owningApplication.processID == pid) return candidate;
  }
  error = "目标窗口已关闭或不属于指定应用";
  return nil;
}
static bool currentWindowBounds(pid_t pid, CGWindowID window, CGRect *bounds) {
  NSArray *list = CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow, window));
  for (NSDictionary *entry in list) {
    if ([entry[(id)kCGWindowNumber] unsignedIntValue] != window) continue;
    if ([entry[(id)kCGWindowOwnerPID] intValue] != pid || ![entry[(id)kCGWindowIsOnscreen] boolValue]) return false;
    return CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)entry[(id)kCGWindowBounds], bounds);
  }
  return false;
}
static bool sameBounds(CGRect a, CGRect b) {
  return std::abs(a.origin.x - b.origin.x) < 1 && std::abs(a.origin.y - b.origin.y) < 1 &&
    std::abs(a.size.width - b.size.width) < 1 && std::abs(a.size.height - b.size.height) < 1;
}
static SCStreamConfiguration *configuration(SCWindow *window) {
  SCStreamConfiguration *config = [SCStreamConfiguration new];
  __block double scale = 1.0;
  dispatch_sync(dispatch_get_main_queue(), ^{ NSScreen *screen = [NSScreen mainScreen]; if (screen) scale = screen.backingScaleFactor; });
  double longest = std::max(window.frame.size.width, window.frame.size.height) * scale;
  double ratio = std::min(1.0, 1600.0 / std::max(1.0, longest));
  config.width = std::max((size_t)1, (size_t)std::llround(window.frame.size.width * scale * ratio));
  config.height = std::max((size_t)1, (size_t)std::llround(window.frame.size.height * scale * ratio));
  config.minimumFrameInterval = CMTimeMake(1, 3);
  config.queueDepth = 3;
  config.showsCursor = NO;
  if (@available(macOS 13.0, *)) config.capturesAudio = NO;
  config.scalesToFit = YES;
  if (@available(macOS 14.0, *)) config.streamName = @"EWork Odyssey";
  return config;
}
static void closeStream(SCStream *old, id oldDelegate) {
  if (!old) return;
  if (@available(macOS 14.0, *)) {
    dispatch_sync(dispatch_get_main_queue(), ^{
      [[SCContentSharingPicker sharedPicker] removeObserver:oldDelegate];
      [[SCContentSharingPicker sharedPicker] setConfiguration:nil forStream:old];
    });
  }
  dispatch_semaphore_t sem = dispatch_semaphore_create(0);
  [old stopCaptureWithCompletionHandler:^(NSError *error) { (void)error; dispatch_semaphore_signal(sem); }];
  waitFor(sem, 3);
}
static void execute(napi_env env, void *raw) {
  (void)env;
  Job *job = static_cast<Job *>(raw);
  @autoreleasepool {
    if (job->command == Command::Stop) {
      SCStream *old = nil; id delegate = nil;
      {
        std::lock_guard<std::mutex> hold(gate);
        ++generation; running = false; stoppedBySystem = false;
        targetPid = 0; targetWindow = 0; windowBounds = CGRectZero; latestFrame = nil;
        old = stream; delegate = outputDelegate;
        stream = nil; outputDelegate = nil;
        changed.notify_all();
      }
      closeStream(old, delegate);
      if (@available(macOS 14.0, *)) dispatch_sync(dispatch_get_main_queue(), ^{ [SCContentSharingPicker sharedPicker].active = NO; });
      return;
    }
    CGRect actualBounds = CGRectZero;
    if (!currentWindowBounds(job->pid, job->window, &actualBounds)) { job->error = "目标窗口已关闭或不在屏幕上"; return; }
    {
      std::unique_lock<std::mutex> hold(gate);
      if (stoppedBySystem) { job->error = "系统已停止共享，桌面控制已中止"; return; }
      if (running && targetPid == job->pid && targetWindow == job->window && latestFrame && sameBounds(actualBounds, windowBounds)) {
        if (job->freshAfterMs && frameTimeMs < job->freshAfterMs) {
          changed.wait_for(hold, std::chrono::milliseconds(550), [&] { return !running || frameTimeMs >= job->freshAfterMs; });
        }
        if (!running) { job->error = stoppedBySystem ? "系统已停止共享" : "共享画面已停止"; return; }
        job->jpeg = latestFrame; job->width = frameWidth; job->height = frameHeight; job->bounds = windowBounds; return;
      }
    }
    SCWindow *window = findWindow(job->pid, job->window, job->error);
    if (!window) return;
    SCContentFilter *filter = [[SCContentFilter alloc] initWithDesktopIndependentWindow:window];
    SCStreamConfiguration *config = configuration(window);
    SCStream *existing = nil; id delegate = nil; uint64_t owner;
    {
      std::lock_guard<std::mutex> hold(gate);
      if (stoppedBySystem) { job->error = "系统已停止共享，桌面控制已中止"; return; }
      existing = stream; delegate = outputDelegate;
      owner = ++generation;
      latestFrame = nil; running = false; targetPid = job->pid; targetWindow = job->window; windowBounds = actualBounds;
      changed.notify_all();
    }
    bool canUpdate;
    { std::lock_guard<std::mutex> hold(gate); canUpdate = existing && !stoppedBySystem; }
    if (canUpdate) {
      // Preserve the OS sharing session while following an app-owned popup.
      __block NSError *issue = nil;
      dispatch_semaphore_t sem = dispatch_semaphore_create(0);
      [existing updateContentFilter:filter completionHandler:^(NSError *error) { issue = error; dispatch_semaphore_signal(sem); }];
      if (waitFor(sem, 4) && !issue) {
        dispatch_semaphore_t sized = dispatch_semaphore_create(0);
        [existing updateConfiguration:config completionHandler:^(NSError *error) { issue = error; dispatch_semaphore_signal(sized); }];
        if (waitFor(sized, 4) && !issue) {
          std::lock_guard<std::mutex> hold(gate);
          stream = existing; ((EWorkCaptureOutput *)delegate).ownerGeneration = owner;
          running = true;
        }
      }
      bool updated;
      { std::lock_guard<std::mutex> hold(gate); updated = running; }
      if (updated) {
        std::unique_lock<std::mutex> hold(gate);
        changed.wait_for(hold, std::chrono::seconds(2), [&] { return !running || latestFrame != nil; });
        if (running && latestFrame) { job->jpeg = latestFrame; job->width = frameWidth; job->height = frameHeight; job->bounds = windowBounds; return; }
      }
      closeStream(existing, delegate);
    }
    { std::lock_guard<std::mutex> hold(gate); if (stoppedBySystem) { job->error = "系统已停止共享"; return; } }
    EWorkCaptureOutput *fresh = [EWorkCaptureOutput new];
    fresh.ownerGeneration = owner;
    SCStream *created = [[SCStream alloc] initWithFilter:filter configuration:config delegate:fresh];
    NSError *addError = nil;
    if (![created addStreamOutput:fresh type:SCStreamOutputTypeScreen sampleHandlerQueue:frameQueue error:&addError]) {
      job->error = message(addError, "无法监听共享画面"); return;
    }
    {
      std::lock_guard<std::mutex> hold(gate);
      if (generation != owner || stoppedBySystem) { job->error = "共享会话已取消"; return; }
      stream = created; outputDelegate = fresh; running = true;
    }
    if (@available(macOS 14.0, *)) {
      dispatch_sync(dispatch_get_main_queue(), ^{
        SCContentSharingPicker *picker = [SCContentSharingPicker sharedPicker];
        SCContentSharingPickerConfiguration *choice = [SCContentSharingPickerConfiguration new];
        choice.allowedPickerModes = SCContentSharingPickerModeSingleWindow;
        choice.allowsChangingSelectedContent = NO;
        picker.maximumStreamCount = @0;
        [picker addObserver:fresh];
        [picker setConfiguration:choice forStream:created];
        picker.active = YES;
      });
    }
    __block NSError *startError = nil;
    dispatch_semaphore_t started = dispatch_semaphore_create(0);
    [created startCaptureWithCompletionHandler:^(NSError *error) { startError = error; dispatch_semaphore_signal(started); }];
    if (!waitFor(started, 6) || startError) {
      job->error = message(startError, "启动系统共享超时");
      { std::lock_guard<std::mutex> hold(gate); running = false; latestFrame = nil; if (stream == created) { stream = nil; outputDelegate = nil; } changed.notify_all(); }
      closeStream(created, fresh); return;
    }
    std::unique_lock<std::mutex> hold(gate);
    changed.wait_for(hold, std::chrono::seconds(3), [&] { return !running || latestFrame != nil; });
    if (!running || !latestFrame) { job->error = stoppedBySystem ? "系统已停止共享" : "共享画面尚未到达"; return; }
    job->jpeg = latestFrame; job->width = frameWidth; job->height = frameHeight; job->bounds = windowBounds;
  }
}
static void complete(napi_env env, napi_status status, void *raw) {
  Job *job = static_cast<Job *>(raw);
  if (status != napi_ok && job->error.empty()) job->error = "共享任务执行失败";
  napi_value value;
  if (!job->error.empty()) {
    napi_value reason; napi_create_string_utf8(env, job->error.c_str(), NAPI_AUTO_LENGTH, &reason);
    napi_create_error(env, nullptr, reason, &value); napi_reject_deferred(env, job->deferred, value);
  } else {
    if (job->jpeg) {
      napi_create_object(env, &value);
      napi_value bytes, width, height, bounds, coordinate;
      napi_create_buffer_copy(env, job->jpeg.length, job->jpeg.bytes, nullptr, &bytes);
      napi_create_double(env, job->width, &width); napi_create_double(env, job->height, &height);
      napi_set_named_property(env, value, "data", bytes);
      napi_set_named_property(env, value, "width", width);
      napi_set_named_property(env, value, "height", height);
      napi_create_object(env, &bounds);
      napi_create_double(env, job->bounds.origin.x, &coordinate); napi_set_named_property(env, bounds, "x", coordinate);
      napi_create_double(env, job->bounds.origin.y, &coordinate); napi_set_named_property(env, bounds, "y", coordinate);
      napi_create_double(env, job->bounds.size.width, &coordinate); napi_set_named_property(env, bounds, "width", coordinate);
      napi_create_double(env, job->bounds.size.height, &coordinate); napi_set_named_property(env, bounds, "height", coordinate);
      napi_set_named_property(env, value, "windowBounds", bounds);
    } else napi_get_undefined(env, &value);
    napi_resolve_deferred(env, job->deferred, value);
  }
  napi_delete_async_work(env, job->work); delete job;
}
static napi_value schedule(napi_env env, napi_callback_info info, Command command) {
  size_t argc = 3; napi_value args[3]; napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  Job *job = new Job{}; job->command = command;
  if (command == Command::Start) {
    double pid = NAN, window = NAN;
    if (argc > 0) napi_get_value_double(env, args[0], &pid);
    if (argc > 1) napi_get_value_double(env, args[1], &window);
    if (!std::isfinite(pid) || !std::isfinite(window) || pid < 1 || window < 1 || pid > INT_MAX || window > UINT32_MAX || std::floor(pid) != pid || std::floor(window) != window) {
      delete job; napi_throw_type_error(env, nullptr, "需要准确的进程和窗口 ID"); return nullptr;
    }
    job->pid = (pid_t)pid; job->window = (CGWindowID)window;
    double freshAfter = 0;
    if (argc > 2 && napi_get_value_double(env, args[2], &freshAfter) == napi_ok && std::isfinite(freshAfter) && freshAfter > 0) job->freshAfterMs = (uint64_t)freshAfter;
  }
  napi_value promise, name; napi_create_promise(env, &job->deferred, &promise);
  napi_create_string_utf8(env, "ework.capture", NAPI_AUTO_LENGTH, &name);
  napi_create_async_work(env, nullptr, name, execute, complete, job, &job->work);
  napi_queue_async_work(env, job->work); return promise;
}
static napi_value start(napi_env env, napi_callback_info info) { return schedule(env, info, Command::Start); }
static napi_value stop(napi_env env, napi_callback_info info) { return schedule(env, info, Command::Stop); }
static napi_value state(napi_env env, napi_callback_info) {
  std::lock_guard<std::mutex> hold(gate);
  napi_value result, active, stopped; napi_create_object(env, &result);
  napi_get_boolean(env, running, &active); napi_get_boolean(env, stoppedBySystem, &stopped);
  napi_set_named_property(env, result, "active", active); napi_set_named_property(env, result, "stoppedBySystem", stopped);
  return result;
}
static napi_value init(napi_env env, napi_value exports) {
  napi_property_descriptor props[] = {
    {"start", nullptr, start, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"stop", nullptr, stop, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"state", nullptr, state, nullptr, nullptr, nullptr, napi_default, nullptr}
  };
  napi_define_properties(env, exports, 3, props); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
